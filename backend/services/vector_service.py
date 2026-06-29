"""
向量数据库服务（ChromaDB + 混合搜索）。

核心 RAG 检索管道：
  用户查询 → ① ChromaDB(cosine) 粗取 candidate → ② 阈值过滤 →
  ③ jieba 分词 → 关键词评分 → ④ RRF 融合排序 → top N

每次上传文档时，文本块被向量化后存入 ChromaDB；
每次提问时，问题被向量化后在 ChromaDB 中搜索最相似的片段。

【混合搜索 RRF】
  Dense（余弦距离）+ Sparse（jieba 关键词命中率）→ RRF 融合
  RRF = 1/(60 + dense_rank) + 1/(60 + sparse_rank)
  解决纯语义搜索对专有名词（人名、地名）匹配弱的问题。
"""
import os
import warnings
warnings.filterwarnings("ignore", category=UserWarning, module="jieba")
import chromadb
from chromadb.utils.embedding_functions import OpenAIEmbeddingFunction
from config import settings


class VectorService:
    """
    ChromaDB 向量数据库的封装（延迟初始化）。

    每个知识库对应一个 ChromaDB Collection（命名规范：kb_{uuid}）。
    ChromaDB client 首次使用时才创建（__init__ 只校验路径）。
    """

    def __init__(self):
        self._client = None
        self._chroma_path = settings.chroma_persist_dir
        self._embedding_fn = None

    @property
    def client(self):
        if self._client is None:
            self._client = chromadb.PersistentClient(path=self._chroma_path)
        return self._client

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
        """服务启动前调用：清理之前删除集合时遗留的 segment 目录"""
        import shutil
        base = settings.chroma_persist_dir
        pending_file = os.path.join(base, "_pending_cleanup.txt")
        if not os.path.exists(pending_file):
            return
        try:
            with open(pending_file) as f:
                uuids = [line.strip() for line in f if line.strip()]
            for uid in uuids:
                seg_dir = os.path.join(base, uid)
                if os.path.isdir(seg_dir):
                    shutil.rmtree(seg_dir, ignore_errors=True)
            os.remove(pending_file)
        except Exception:
            pass

    def _collection_name(self, kb_id: str) -> str:
        """将 UUID 格式的知识库 ID 转为 ChromaDB 兼容的集合名"""
        return "kb_" + kb_id.replace("-", "_")

    def get_or_create_collection(self, kb_id: str):
        """获取或创建知识库对应的向量集合。创建时指定余弦距离作为度量。"""
        return self.client.get_or_create_collection(
            name=self._collection_name(kb_id),
            embedding_function=self.embedding_fn,
            metadata={"hnsw:space": "cosine"},
        )

    def add_chunks(self, kb_id: str, chunks: list[str], metadatas: list[dict], ids: list[str]) -> None:
        """批量添加文本片段到向量库（与改动前逻辑一致，加了重试）。"""
        import time
        collection = self.get_or_create_collection(kb_id)
        batch_size = 50
        for i in range(0, len(chunks), batch_size):
            for attempt in range(3):
                try:
                    collection.add(
                        documents=chunks[i:i + batch_size],
                        metadatas=metadatas[i:i + batch_size],
                        ids=ids[i:i + batch_size],
                    )
                    break
                except Exception as e:
                    if attempt < 2:
                        time.sleep(3 * (attempt + 1))
                    else:
                        raise e

    def query(self, kb_id: str, query_text: str) -> list[dict]:
        """
        RRF 混合搜索主方法。

        流程：
        1. ChromaDB cosine 检索 n_results×3 个候选
        2. 过滤掉 distance > top_k_max_distance 的
        3. jieba 分词 → 关键词命中率评分
        4. RRF 融合：语义排名 + 关键词排名
        5. 取融合后 Top N 返回
        """
        collection = self.get_or_create_collection(kb_id)
        if collection.count() == 0:
            return []

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
        for i, c in enumerate(candidates):
            c["_dense_rank"] = i + 1

        # Step 3b: Sparse rank（jieba 分词 → 关键词命中率）
        import jieba
        words = jieba.lcut(query_text)
        keywords = [w for w in words if len(w) > 1]

        if keywords:
            for c in candidates:
                hits = sum(1 for kw in keywords if kw in c["text"])
                c["_keyword_score"] = hits / len(keywords)
        else:
            for c in candidates:
                c["_keyword_score"] = 0

        candidates.sort(key=lambda x: -x["_keyword_score"])
        for i, c in enumerate(candidates):
            c["_sparse_rank"] = i + 1

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

        # 清理辅助字段
        for r in selected:
            del r["_dense_rank"]
            del r["_keyword_score"]
            del r["_sparse_rank"]
            del r["_rrf"]
        return selected

    # ── 元数据管理 ──

    def rename_document_chunks(self, kb_id: str, document_id: str, new_filename: str) -> None:
        """
        文档重命名时同步更新 ChromaDB metadata（不重新embed，快速）。
        通过 document_id 匹配所有相关 chunk，分批更新 filename 字段。
        受智谱 API 限制，每批最多 50 条。
        """
        try:
            collection = self.client.get_collection(
                name=self._collection_name(kb_id),
                embedding_function=self.embedding_fn,
            )
        except ValueError:
            return
        try:
            results = collection.get(where={"document_id": document_id}, include=["metadatas"])
            if not results["ids"]:
                return
            ids = results["ids"]
            metadatas = results["metadatas"]
            for m in metadatas:
                m["filename"] = new_filename
            batch_size = 50
            for i in range(0, len(ids), batch_size):
                collection.update(
                    ids=ids[i:i + batch_size],
                    metadatas=metadatas[i:i + batch_size],
                )
        except Exception as e:
            print(f"[WARN] 更新 ChromaDB filename 失败 (document={document_id}): {e}")

    def delete_document_chunks(self, kb_id: str, document_id: str) -> None:
        """
        删除文档时同步清理 ChromaDB 中的相关向量。
        通过 document_id 匹配所有 chunk 并批量删除。
        """
        try:
            collection = self.client.get_collection(
                name=self._collection_name(kb_id),
                embedding_function=self.embedding_fn,
            )
        except ValueError:
            return
        try:
            collection.delete(where={"document_id": document_id})
        except Exception as e:
            print(f"[WARN] 删除 ChromaDB chunks 失败 (document={document_id}): {e}")

    def delete_collection(self, kb_id: str) -> None:
        """
        删除整个知识库的 ChromaDB 集合，并彻底清理物理残留文件。

        步骤：
        1. 通过 ChromaDB 内部 SQLite 查到该集合的所有 segment UUID
        2. 调用 ChromaDB API 删除集合（从元数据中移除）
        3. 删除步骤 1 查到的所有 segment UUID 目录（ChromaDB 有时不自动删物理文件）
        """
        import sqlite3
        import shutil

        collection_name = self._collection_name(kb_id)
        base_dir = self.client.get_settings().require("persist_directory")
        sqlite_path = os.path.join(base_dir, "chroma.sqlite3")

        # Step 1: 从 ChromaDB 内部 SQLite 查该集合的 segment UUID
        #         ChromaDB 使用 WAL 模式，读操作不阻塞写操作
        segment_uuids = set()
        if os.path.exists(sqlite_path):
            try:
                conn = sqlite3.connect(sqlite_path, timeout=1)
                for row in conn.execute(
                    "SELECT s.id FROM segments s "
                    "JOIN collections c ON s.collection = c.id "
                    "WHERE c.name = ?", (collection_name,)
                ).fetchall():
                    segment_uuids.add(row[0])
                conn.close()
            except Exception:
                pass  # 读不到 segment UUID 时跳过物理清理

        # Step 2: 调用 ChromaDB API 删除集合
        try:
            self.client.delete_collection(name=collection_name)
        except Exception:
            pass

        # Step 3: 删除步骤 1 查到的所有 segment UUID 目录
        #         Windows 上 ChromaDB 锁住 HNSW 文件无法实时删除。
        #         记录到待清理列表，下次服务启动时再删（此时 ChromaDB 还没加载）。
        try:
            pending_file = os.path.join(base_dir, "_pending_cleanup.txt")
            existing = set()
            if os.path.exists(pending_file):
                with open(pending_file) as pf:
                    existing = set(line.strip() for line in pf if line.strip())
            existing.update(segment_uuids)
            with open(pending_file, "w") as pf:
                pf.write("\n".join(sorted(existing)))
        except Exception:
            pass

        # Step 4: 清理孤立 segment（有记录但集合已被删）
        try:
            conn = sqlite3.connect(sqlite_path, timeout=1)
            orphan_segments = {row[0] for row in conn.execute(
                "SELECT s.id FROM segments s "
                "LEFT JOIN collections c ON s.collection = c.id "
                "WHERE c.id IS NULL"
            ).fetchall()}
            conn.close()
            try:
                pending_file = os.path.join(base_dir, "_pending_cleanup.txt")
                existing = set()
                if os.path.exists(pending_file):
                    with open(pending_file) as pf:
                        existing = set(line.strip() for line in pf if line.strip())
                existing.update(orphan_segments)
                with open(pending_file, "w") as pf:
                    pf.write("\n".join(sorted(existing)))
            except Exception:
                pass
        except Exception:
            pass


# 全局单例
vector_service = VectorService()
