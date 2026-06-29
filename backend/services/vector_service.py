"""
向量数据库服务，封装 ChromaDB 的增删查操作。

使用 ChromaDB PersistentClient，数据持久化在本地磁盘。
"""
import os
import warnings

import chromadb
from chromadb.utils.embedding_functions import OpenAIEmbeddingFunction
from config import settings


class VectorService:
    """向量数据库服务单例，统一管理 ChromaDB 集合操作。"""

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
        """清理上次终止时残留的 ChromaDB 段目录。"""
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

    def get_or_create_collection(self, kb_id: str):
        name = self._collection_name(kb_id)
        try:
            return self.client.get_collection(name)
        except Exception:
            return self.client.create_collection(
                name=name,
                embedding_function=self.embedding_fn,
                metadata={"hnsw:space": "cosine"},
            )

    def add_chunks(self, kb_id: str, chunks: list[str], metadatas: list[dict], ids: list[str]) -> None:
        """批量添加文本片段到向量库。"""
        import time
        import logging
        logger = logging.getLogger(__name__)

        # 先算 embedding，再直接写入，避免 ChromaDB collection.add 的内部超时问题
        from openai import OpenAI
        client = OpenAI(api_key=settings.embedding_api_key, base_url=settings.embedding_base_url)

        collection = self.get_or_create_collection(kb_id)
        batch_size = 50

        for i in range(0, len(chunks), batch_size):
            batch = chunks[i:i + batch_size]
            batch_meta = metadatas[i:i + batch_size]
            batch_ids = ids[i:i + batch_size]

            if i > 0:
                time.sleep(3)

            ok = False
            for attempt in range(3):
                try:
                    resp = client.embeddings.create(
                        model=settings.embedding_model,
                        input=batch,
                        timeout=60,
                    )
                    embeddings = [d.embedding for d in resp.data]
                    collection.add(
                        embeddings=embeddings,
                        documents=batch,
                        metadatas=batch_meta,
                        ids=batch_ids,
                    )
                    ok = True
                    break
                except Exception as e:
                    msg = str(e).replace('\n', ' ')[:150]
                    logger.warning(f"add_chunks batch {i//batch_size+1} attempt {attempt+1}: {msg}")
                    if attempt < 2:
                        time.sleep(5 * (attempt + 1))

            if not ok:
                # 记录失败的具体批次内容
                logger.error(f"add_chunks batch {i//batch_size+1} FAILED. First chunk: {batch[0][:80]}")
                try:
                    # 逐条写入失败的批次（跳过有问题的单条）
                    for j, (doc, meta, eid) in enumerate(zip(batch, batch_meta, batch_ids)):
                        for attempt in range(2):
                            try:
                                resp = client.embeddings.create(
                                    model=settings.embedding_model, input=[doc], timeout=30
                                )
                                emb = [d.embedding for d in resp.data]
                                collection.add(embeddings=emb, documents=[doc], metadatas=[meta], ids=[eid])
                                break
                            except Exception:
                                if attempt == 0:
                                    time.sleep(3)
                except Exception as fallback_e:
                    raise Exception(f"fallback also failed: {fallback_e}")

    def query(self, kb_id: str, query_text: str) -> list[dict]:
        """
        RRF 混合搜索主方法。

        流程：
        1. ChromaDB cosine 检索 n_results×3 个候选
        2. 过滤掉 distance > top_k_max_distance 的
        3. jieba 分词 → 关键词命中率评分
        4. RRF 融合：语义排名 + 关键词排名
        """
        import jieba
        import re
        from collections import Counter

        collection = self.get_or_create_collection(kb_id)

        # Step 1: 从 ChromaDB 取候选（给后续过滤留足空间）
        fetch_count = min(settings.fetch_count, collection.count())
        if fetch_count == 0:
            return []

        results = collection.query(
            query_texts=[query_text],
            n_results=fetch_count,
            include=["documents", "metadatas", "distances"],
        )

        # Step 2: 阈值过滤 — 所有 distance ≤ 0.55 的都保留
        candidates = []
        for doc, meta, dist in zip(
            results["documents"][0],
            results["metadatas"][0],
            results["distances"][0],
        ):
            if dist > settings.top_k_max_distance:
                continue
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

        # ── 加权 RRF 排序 ──

        # Step 3a: Dense rank（按余弦距离升序排列）
        candidates.sort(key=lambda x: x["distance"])
        for rank, c in enumerate(candidates, start=1):
            c["_dense_rank"] = rank

        # Step 3b: 关键词评分（Sparse rank）
        query_words = [
            w for w in jieba.lcut(query_text)
            if len(w) > 1 and not re.match(r'^\d+$', w)
        ]
        if query_words:
            query_set = set(query_words)
            for c in candidates:
                doc_words = set(
                    w for w in jieba.lcut(c["text"])
                    if len(w) > 1 and not re.match(r'^\d+$', w)
                )
                hits = len(query_set & doc_words)
                c["_sparse_score"] = hits / max(len(query_set), 1)
            candidates.sort(key=lambda x: -x["_sparse_score"])
            for rank, c in enumerate(candidates, start=1):
                c["_sparse_rank"] = rank
        else:
            for c in candidates:
                c["_sparse_score"] = 0
                c["_sparse_rank"] = len(candidates)

        # Step 4: 加权 RRF = (1-w)/(K+语义排名) + w/(K+关键词排名)
        w = settings.keyword_weight
        K = settings.rrf_k
        for c in candidates:
            c["_rrf"] = (1 - w) / (K + c["_dense_rank"]) + w / (K + c["_sparse_rank"])

        # Step 5: 按加权 RRF 降序取（上限 max_chunks）
        candidates.sort(key=lambda x: -x["_rrf"])
        selected = candidates[:settings.max_chunks]

        # RRF 值转展示分数（放大为 0~100 区间）
        max_rrf = 1 / (settings.rrf_k + 1)  # 理论最大值（两个排名都是1）
        for r in selected:
            r["score"] = round(r["_rrf"] / max_rrf * 100)

        return selected

    def rename_document_chunks(self, kb_id: str, document_id: str, new_filename: str):
        """在 ChromaDB 中更新指定文档所有 chunk 的 filename 元数据。"""
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
        """删除 ChromaDB 中指定文档的所有 chunk。"""
        try:
            collection = self.get_or_create_collection(kb_id)
            collection.delete(where={"document_id": document_id})
        except Exception:
            pass

    def delete_collection(self, kb_id: str) -> bool:
        """删除整个 ChromaDB 集合。

        返回 True 表示存在且已删除；False 表示集合不存在。
        ChromaDB 删除后，段目录可能仍有残留，下次启动时由 cleanup_pending 清理。
        """
        import shutil
        name = self._collection_name(kb_id)
        try:
            collection = self.client.get_collection(name)
        except Exception:
            return False

        # 记录待清理的段目录
        try:
            segments = collection.get()["ids"]
            # 部分版本 ChromaDB 的段信息在 metadata 里
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


# 全局单例
vector_service = VectorService()
