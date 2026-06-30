"""
向量数据库服务，封装 ChromaDB 的增删查操作。

不使用 ChromaDB 内建的嵌入函数（embedding-3 非标准模型会导致序列化错误），
所有向量预计算后再写入。每次操作新建客户端，避免线程安全问题。
"""
import os
import warnings

import chromadb
from chromadb.utils.embedding_functions import OpenAIEmbeddingFunction
from config import settings


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
        """批量添加文本片段到向量库。"""
        import time, logging
        logger = logging.getLogger('vector_service')
        local_client = self._get_local_client()
        collection = self.get_or_create_collection(kb_id, local_client)
        ef = self._make_ef()
        batch_size = 10

        for i in range(0, len(chunks), batch_size):
            batch = chunks[i:i + batch_size]
            ok = False
            for attempt in range(3):
                try:
                    embeddings = ef(batch)
                    collection.add(
                        embeddings=embeddings, documents=batch,
                        metadatas=metadatas[i:i + batch_size],
                        ids=ids[i:i + batch_size],
                    )
                    ok = True
                    break
                except Exception as e:
                    logger.error(f"BATCH {i//batch_size+1} attempt {attempt+1}: {e}")
                    if attempt < 2:
                        time.sleep(3 * (attempt + 1))

            if not ok:
                # 逐条写入，跳过有问题的
                for j, (doc, meta, eid) in enumerate(
                    zip(batch, metadatas[i:i + batch_size], ids[i:i + batch_size])
                ):
                    for t in range(2):
                        try:
                            emb = ef([doc])
                            collection.add(embeddings=emb, documents=[doc], metadatas=[meta], ids=[eid])
                            break
                        except Exception as e:
                            if t == 0:
                                logger.warning(f"ITEM {i//batch_size+1}_{j}: {e}")
                                time.sleep(3)
                            else:
                                logger.error(f"ITEM {i//batch_size+1}_{j} SKIPPED: {e}")
            if not ok:
                raise Exception(f"batch {i//batch_size+1} failed")

    def _make_ef(self):
        return OpenAIEmbeddingFunction(
            api_key=settings.embedding_api_key,
            api_base=settings.embedding_base_url,
            model_name=settings.embedding_model,
        )

    def _embed_query(self, text: str) -> list[float]:
        return self._make_ef()([text])[0]

    def query(self, kb_id: str, query_text: str) -> list[dict]:
        import jieba
        import re
        from collections import Counter

        local_client = self._get_local_client()
        collection = self.get_or_create_collection(kb_id, local_client)
        fetch_count = min(settings.fetch_count, collection.count())
        if fetch_count == 0:
            return []

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
