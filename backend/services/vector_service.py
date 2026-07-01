"""
向量数据库服务，封装 ChromaDB 的增删查操作。

不使用 ChromaDB 内建的嵌入函数（embedding-3 非标准模型会导致序列化错误），
所有向量预计算后再写入。每次操作新建客户端，避免线程安全问题。
"""
import os
import math
import logging
import warnings
from collections import Counter

from concurrent.futures import ThreadPoolExecutor, as_completed

import jieba
import re
import time
import chromadb
from chromadb.utils.embedding_functions import OpenAIEmbeddingFunction
from config import settings

logger = logging.getLogger(__name__)


class VectorService:

    def __init__(self):
        self.client = chromadb.PersistentClient(path=settings.chroma_persist_dir)
        self._embedding_fn = None

    @property
    def embedding_fn(self):
        if self._embedding_fn is None:
            self._embedding_fn = OpenAIEmbeddingFunction(
                api_key=settings.embedding_api_key,
                api_base=settings.embedding_base_url,
                model_name=settings.embedding_model,
            )
        return self._embedding_fn

    @staticmethod
    def cleanup_pending():
        pending_file = os.path.join(settings.chroma_persist_dir, "_pending_cleanup.txt")
        if not os.path.exists(pending_file):
            return
        with open(pending_file) as f:
            for line in f:
                seg = line.strip()
                if seg:
                    path = os.path.join(settings.chroma_persist_dir, seg)
                    if os.path.isdir(path):
                        import shutil
                        shutil.rmtree(path, ignore_errors=True)
        os.remove(pending_file)

    def _collection_name(self, kb_id: str) -> str:
        return f"kb_{kb_id.replace('-', '_')}"

    def _get_local_client(self):
        """每次调用新建客户端，避免后台线程共享同一连接的问题。"""
        return chromadb.PersistentClient(path=settings.chroma_persist_dir)

    def get_or_create_collection(self, kb_id: str, client=None):
        client = client or self.client
        name = self._collection_name(kb_id)
        try:
            return client.get_collection(name)
        except Exception:
            return client.create_collection(
                name=name,
                embedding_function=None,
                metadata={"hnsw:space": "cosine"},
            )

    def add_chunks(self, kb_id: str, chunks: list[str], metadatas: list[dict], ids: list[str]) -> None:
        """
        批量添加文本片段到向量库。

        性能优化：嵌入 API 调用并行化（最多 5 个线程同时调用智谱 API），
        ChromaDB 写入仍保持串行以避免线程安全问题。
        """
        local_client = self._get_local_client()
        collection = self.get_or_create_collection(kb_id, local_client)
        batch_size = 10

        # 分批
        batches = []
        for i in range(0, len(chunks), batch_size):
            batches.append({
                "chunks": chunks[i:i + batch_size],
                "metadatas": metadatas[i:i + batch_size],
                "ids": ids[i:i + batch_size],
                "idx": i // batch_size,
            })

        # 并行嵌入：每批独立调用 API（每个线程建自己的 client，httpx 非线程安全）
        def _embed(batch: dict) -> tuple[int, list[list[float]] | None]:
            local_ef = self._make_ef()
            for attempt in range(3):
                try:
                    emb = local_ef(batch["chunks"])
                    return batch["idx"], emb
                except Exception as e:
                    logger.warning("BATCH %s attempt %s: %s", batch['idx']+1, attempt+1, e)
                    if attempt < 2:
                        time.sleep(3 * (attempt + 1))
            return batch["idx"], None

        embedded = [None] * len(batches)
        with ThreadPoolExecutor(max_workers=12) as pool:
            fut_map = {pool.submit(_embed, b): b["idx"] for b in batches}
            for fut in as_completed(fut_map):
                idx, embs = fut.result()
                embedded[idx] = embs

        # 串行写入：嵌入完成后顺序写 ChromaDB
        for i, batch in enumerate(batches):
            embs = embedded[i]
            if embs is not None:
                try:
                    collection.add(
                        embeddings=embs, documents=batch["chunks"],
                        metadatas=batch["metadatas"], ids=batch["ids"],
                    )
                    continue
                except Exception as e:
                    logger.warning("WRITE batch %s: %s", i+1, e)

            # 批量写入失败 → 逐条写入（跳过有问题的单条）
            all_ok = True
            for j, (doc, meta, eid) in enumerate(
                zip(batch["chunks"], batch["metadatas"], batch["ids"])
            ):
                item_ok = False
                for t in range(2):
                    try:
                        ef = self._make_ef()
                        emb = ef([doc])
                        collection.add(embeddings=emb, documents=[doc], metadatas=[meta], ids=[eid])
                        item_ok = True
                        break
                    except Exception as e:
                        if t == 0:
                            logger.warning("ITEM %s_%s: %s", i+1, j, e)
                            time.sleep(3)
                        else:
                            logger.warning("ITEM %s_%s SKIPPED: %s", i+1, j, e)
                if not item_ok:
                    all_ok = False
            if not all_ok:
                raise Exception(f"batch {i+1} failed")

    def _make_ef(self):
        return OpenAIEmbeddingFunction(
            api_key=settings.embedding_api_key,
            api_base=settings.embedding_base_url,
            model_name=settings.embedding_model,
        )

    def _embed_query(self, text: str) -> list[float]:
        return self._make_ef()([text])[0]

    # ────────────────────────────────────────────
    # BM25 关键词打分（基于 30 个候选片段的统计）
    # ────────────────────────────────────────────

    @staticmethod
    def _tokenize(text: str) -> list[str]:
        """分词并过滤停用词级别的噪音。"""
        return [
            w for w in jieba.lcut(text)
            if len(w) > 1 and not re.match(r'^\d+$', w)
        ]

    @staticmethod
    def _bm25_scores(
        query_words: list[str],
        candidates_texts: list[str],
    ) -> list[float]:
        """
        对候选列表计算 BM25 关键词分数。

        参数：
          query_words — 查询的分词结果（已过滤）
          candidates_texts — 每个候选的原文

        返回：
          每个候选的 BM25 分数（浮点数列表，与 candidates_texts 同序）
        """
        from collections import Counter

        N = len(candidates_texts)
        if N == 0 or not query_words:
            return [0.0] * N

        # 切词 + 统计文档频率
        doc_freq = Counter()   # 每个词出现在几个文档中
        doc_words_list = []
        doc_lengths = []

        for text in candidates_texts:
            words = VectorService._tokenize(text)
            doc_words_list.append(words)
            doc_lengths.append(len(words))
            doc_freq.update(set(words))

        avg_doc_len = sum(doc_lengths) / N
        k1, b = 1.5, 0.75

        scores = []
        for i in range(N):
            words = doc_words_list[i]
            doc_len = doc_lengths[i]
            if doc_len == 0:
                scores.append(0.0)
                continue

            word_counter = Counter(words)
            score = 0.0
            for q_word in query_words:
                tf = word_counter.get(q_word, 0)
                if tf == 0:
                    continue
                # BM25 IDF（平滑版）
                df = doc_freq.get(q_word, 0)
                idf = math.log((N - df + 0.5) / max(df + 0.5, 1) + 1)
                # BM25 TF
                tf_norm = (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (doc_len / avg_doc_len)))
                score += idf * tf_norm

            scores.append(score)

        return scores

    # ────────────────────────────────────────────
    # 检索主流程
    # ────────────────────────────────────────────

    def query(self, kb_id: str, query_text: str) -> list[dict]:
        """
        检索 + 混合排名 + 去重。

        完整流程：
          1. ChromaDB 向量检索 → 取 FETCH_COUNT 个候选
          2. BM25 关键词打分（对所有候选，不提前过滤）
          3. 稠密排名（按余弦距离）
          4. 稀疏排名（按 BM25 分数）
          5. RRF 融合 + 降序排列
          6. 取 Top MAX_CHUNKS
          7. RRF 相对阈值过滤（低于峰值 × min_score_ratio 的丢弃）
          8. 去重：同一文档的相邻 chunk 只留一个
        """
        local_client = self._get_local_client()
        collection = self.get_or_create_collection(kb_id, local_client)
        fetch_count = min(settings.fetch_count, collection.count())
        if fetch_count == 0:
            return []

        # ── 1. 向量检索 ──
        query_embedding = self._embed_query(query_text)
        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=fetch_count,
            include=["documents", "metadatas", "distances"],
        )

        candidates = []
        for doc, meta, dist in zip(
            results["documents"][0],
            results["metadatas"][0],
            results["distances"][0],
        ):
            candidates.append({
                "text": doc,
                "filename": meta.get("filename", ""),
                "document_id": meta.get("document_id", ""),
                "file_type": meta.get("file_type", "pdf"),
                "chunk_index": meta.get("chunk_index", 0),
                "page_number": meta.get("page_number", 0),
                "distance": dist,
            })

        if not candidates:
            return []

        # ── 2. BM25 关键词打分（对所有候选，不提前过滤）──
        query_words = self._tokenize(query_text)
        bm25_scores = self._bm25_scores(query_words, [c["text"] for c in candidates])
        for c, score in zip(candidates, bm25_scores):
            c["_sparse_score"] = score

        # ── 3. 稠密排名（按距离从小到大排）──
        candidates.sort(key=lambda x: x["distance"])
        for rank, c in enumerate(candidates, start=1):
            c["_dense_rank"] = rank

        # ── 4. 稀疏排名（按 BM25 分数从高到低排）──
        candidates.sort(key=lambda x: -x["_sparse_score"])
        for rank, c in enumerate(candidates, start=1):
            c["_sparse_rank"] = rank

        # ── 5. RRF 融合两个排名 ──
        w = settings.keyword_weight
        K = settings.rrf_k
        for c in candidates:
            c["_rrf"] = (1 - w) / (K + c["_dense_rank"]) + w / (K + c["_sparse_rank"])

        candidates.sort(key=lambda x: -x["_rrf"])

        # ── 6. 取 Top ──
        selected = candidates[:settings.max_chunks]

        # ── 7. RRF 相对阈值过滤：从候选里剔除质量低于峰值的 ──
        # 先按 MAX_CHUNKS 限制数量，再从这 N 个里排除分数低于峰值一定比例的。
        # 峰值始终是 candidates[0]，因为步骤 5 已按 RRF 降序排列。
        ratio = settings.min_score_ratio
        if ratio > 0 and selected:
            threshold = selected[0]["_rrf"] * ratio
            selected = [c for c in selected if c["_rrf"] >= threshold]

        if not selected:
            return []

        # ── 8. 去重：同一文档的相邻 chunk 只保留分数高的那个 ──
        deduped = []
        for r in selected:
            is_dup = False
            for existing in deduped:
                same_doc = r["document_id"] == existing["document_id"]
                adjacent = abs(r["chunk_index"] - existing["chunk_index"]) <= 1
                if same_doc and adjacent:
                    is_dup = True
                    break
            if not is_dup:
                deduped.append(r)

        # ── 评分与排序 ──
        # RRF 只负责"选谁"（top-N + 阈值 + 去重），
        # 最终排序和百分比用原始值计算（余弦相似度 + BM25），不涉及排名转换，
        # 避免排名相近的不相关 chunk 获得虚高分数。
        w = settings.keyword_weight
        max_bm25 = max(r["_sparse_score"] for r in deduped) or 1
        for r in deduped:
            sim = 1 - r["distance"]                     # 语义绝对相关度
            kw = r["_sparse_score"] / max_bm25           # 关键词绝对相关度（归一化）
            r["score"] = round((sim * (1 - w) + kw * w) * 100)

        # 按分数降序排列，与显示的百分比一致
        deduped.sort(key=lambda x: -x["score"])

        return deduped

    def rename_document_chunks(self, kb_id: str, document_id: str, new_filename: str):
        try:
            collection = self.get_or_create_collection(kb_id)
            result = collection.get(
                where={"document_id": document_id},
                include=["metadatas"],
            )
            if not result or not result.get("ids"):
                return
            ids = result["ids"]
            metadatas = result["metadatas"]
            for m in metadatas:
                m["filename"] = new_filename
            batch_size = 50
            for i in range(0, len(ids), batch_size):
                collection.update(
                    ids=ids[i:i + batch_size],
                    metadatas=metadatas[i:i + batch_size],
                )
        except Exception:
            pass

    def delete_document_chunks(self, kb_id: str, document_id: str):
        try:
            collection = self.get_or_create_collection(kb_id)
            collection.delete(where={"document_id": document_id})
        except Exception:
            pass

    def delete_collection(self, kb_id: str) -> bool:
        import shutil
        name = self._collection_name(kb_id)
        try:
            collection = self.client.get_collection(name)
        except Exception:
            return False
        try:
            pending_file = os.path.join(settings.chroma_persist_dir, "_pending_cleanup.txt")
            with open(pending_file, "a") as f:
                for seg in os.listdir(settings.chroma_persist_dir):
                    seg_path = os.path.join(settings.chroma_persist_dir, seg)
                    if os.path.isdir(seg_path) and seg not in ("chroma.sqlite3", "_pending_cleanup.txt"):
                        f.write(seg + "\n")
        except Exception:
            pass
        self.client.delete_collection(name)
        return True


vector_service = VectorService()
