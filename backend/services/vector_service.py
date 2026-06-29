"""
向量数据库服务，封装 ChromaDB 的增删查操作。

不使用 ChromaDB 内建的嵌入函数（embedding-3 非标准模型会导致序列化错误），
所有向量预计算后再写入。
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
        """返回 OpenAI 兼容的嵌入函数（智谱 embedding-3，2048 维）。"""
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
        """
        获取或创建集合。集合本身不绑定嵌入函数（避免 embedding-3 序列化问题），
        调用方需自行准备向量。
        """
        name = self._collection_name(kb_id)
        try:
            return self.client.get_collection(name)
        except Exception:
            return self.client.create_collection(
                name=name,
                embedding_function=None,
                metadata={"hnsw:space": "cosine"},
            )

    def add_chunks(self, kb_id: str, chunks: list[str], metadatas: list[dict], ids: list[str]) -> None:
        """
        批量添加文本片段到向量库。

        用 self.embedding_fn 预计算向量后写入（集合本身不绑定嵌入函数，
        避免 embedding-3 被 ChromaDB 错误序列化导致维度问题）。
        """
        import time
        collection = self.get_or_create_collection(kb_id)
        batch_size = 50
        for i in range(0, len(chunks), batch_size):
            batch = chunks[i:i + batch_size]
            for attempt in range(3):
                try:
                    embeddings = self.embedding_fn(batch)
                    collection.add(
                        embeddings=embeddings,
                        documents=batch,
                        metadatas=metadatas[i:i + batch_size],
                        ids=ids[i:i + batch_size],
                    )
                    break
                except Exception as e:
                    if attempt < 2:
                        time.sleep(2 * (attempt + 1))
                    else:
                        raise

    def _embed_query(self, text: str) -> list[float]:
        """用 embedding_fn 将查询文本转为向量。"""
        return self.embedding_fn([text])[0]

    def query(self, kb_id: str, query_text: str) -> list[dict]:
        """
        RRF 混合搜索主方法。

        预计算查询向量后直接检索（避免 ChromaDB 嵌入函数维度问题）。
        """
        import jieba
        import re
        from collections import Counter

        collection = self.get_or_create_collection(kb_id)
        fetch_count = min(settings.fetch_count, collection.count())
        if fetch_count == 0:
            return []

        # 预计算查询向量
        query_embedding = self._embed_query(query_text)

        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=fetch_count,
            include=["documents", "metadatas", "distances"],
        )

        # Step 2: 阈值过滤
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
        candidates.sort(key=lambda x: x["distance"])
        for rank, c in enumerate(candidates, start=1):
            c["_dense_rank"] = rank

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

        w = settings.keyword_weight
        K = settings.rrf_k
        for c in candidates:
            c["_rrf"] = (1 - w) / (K + c["_dense_rank"]) + w / (K + c["_sparse_rank"])

        candidates.sort(key=lambda x: -x["_rrf"])
        selected = candidates[:settings.max_chunks]

        max_rrf = 1 / (settings.rrf_k + 1)
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
        """删除整个 ChromaDB 集合。"""
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


# 全局单例
vector_service = VectorService()
