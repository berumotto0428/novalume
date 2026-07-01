"""
文档处理流水线（在后台线程中执行）。

职责链条：
  上传完成 → 解析文件 → 切分文本 → 匹配页码 → 写入ChromaDB

支持格式：PDF、Word、Markdown、Excel、PPT、图片（jpg/png）
在 run_in_executor 中运行，不阻塞主事件循环。
每个文档独立处理，一个失败不影响其他文档。
"""
import os

from sqlalchemy import func

from database import SessionLocal
from config import settings
from models.document import Document
from models.knowledge_base import KnowledgeBase
from services.file_parsers import parse_file
from services.chunking import chunk_by_file_type
from services.vector_service import vector_service


def _find_page(chunk_text: str, page_texts: list[str]) -> int:
    """
    通过文本指纹匹配确定文本块来自第几页/块（1-based）。
    取 chunk 前 80 个字符作为指纹，在 page_texts 中逐项查找。
    未找到时返回 0（未知）。
    """
    fingerprint = chunk_text[:80].strip()
    if not fingerprint:
        return 0
    for i, page_text in enumerate(page_texts):
        if fingerprint in page_text:
            return i + 1
    return 0


def process_document(document_id: str):
    """
    后台线程：解析文件 → 分块 → embed → 存向量库。
    状态机：pending → processing → ready / failed
    """
    from models.document import Document
    from models.knowledge_base import KnowledgeBase

    db = SessionLocal()
    doc = None
    try:
        doc = db.query(Document).filter(Document.id == document_id).first()
        if not doc:
            return

        # 安全校验：知识库是否仍然存在
        kb = db.query(KnowledgeBase).filter(KnowledgeBase.id == doc.knowledge_base_id).first()
        if not kb:
            db.delete(doc)
            db.commit()
            return

        doc.status = "processing"
        db.commit()

        # Step 1: 解析文件（根据扩展名自动路由）
        full_path = os.path.join(settings.file_storage_dir, doc.file_path)
        text, page_count, page_texts, file_type = parse_file(full_path)

        doc.page_count = page_count
        doc.file_type = file_type  # 存入 DB，前端据此选择预览组件

        # Step 2: 切块（根据文件类型采用不同策略）
        chunks = chunk_by_file_type(file_type, page_texts, settings.chunk_size, settings.chunk_overlap)

        if not chunks:
            raise ValueError("文件内容为空，未生成任何文本块")

        # Step 3: 构建 metadata
        metadatas = [
            {
                "document_id": doc.id,
                "knowledge_base_id": doc.knowledge_base_id,
                "filename": doc.filename,
                "file_type": file_type,
                "chunk_index": i,
                "page_number": _find_page(chunk, page_texts),
            }
            for i, chunk in enumerate(chunks)
        ]
        ids = [f"{doc.id}_chunk_{i}" for i in range(len(chunks))]

        # Step 4: 写入向量库
        try:
            vector_service.add_chunks(doc.knowledge_base_id, chunks, metadatas, ids)
        except Exception as ve:
            raise Exception(f"向量库写入失败: {ve}")

        # Step 5: 标记完成
        doc.status = "ready"
        doc.chunk_count = len(chunks)
        db.commit()

    except Exception as e:
        if doc:
            doc.status = "failed"
            doc.error_message = str(e)[:1000]
            db.commit()
    finally:
        db.close()
