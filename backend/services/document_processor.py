"""
文档处理流水线（在后台线程中执行）。

职责链条：
  上传完成 → 解析PDF → 切分文本 → 匹配页码 → 写入ChromaDB

在 run_in_executor 中运行，不阻塞主事件循环。
每个文档独立处理，一个失败不影响其他文档。
"""
import os

from database import SessionLocal
from config import settings
from services.pdf_service import parse_pdf, split_text
from services.vector_service import vector_service


def _find_page(chunk_text: str, page_texts: list[str]) -> int:
    """
    通过文本指纹匹配，确定文本块来自第几页（1-based）。

    方法：取 chunk 前 80 个字符作为指纹，在逐页文本中查找。
    如果未找到匹配页，返回 0（未知页）。这是一个启发式算法，
    对于 PDF 提取的连续性文本较为可靠。
    """
    fingerprint = chunk_text[:80].strip()
    for i, page_text in enumerate(page_texts):
        if fingerprint in page_text:
            return i + 1
    return 0


def process_document(document_id: str):
    """
    后台线程：解析 PDF → 分块 → embed → 存向量库。

    状态机：pending → processing → ready（成功）/ failed（失败）
    如果知识库在后台任务运行中被删除，任务会静默退出并删除文档记录。
    """
    from models.document import Document
    from models.knowledge_base import KnowledgeBase

    db = SessionLocal()
    doc = None
    try:
        doc = db.get(Document, document_id)
        if not doc:
            return

        # 安全校验：知识库是否仍然存在（防止用户删库后任务还在跑）
        kb = db.get(KnowledgeBase, doc.knowledge_base_id)
        if not kb:
            db.delete(doc)
            db.commit()
            return

        doc.status = "processing"
        db.commit()

        # Step 1: 解析 PDF（pymupdf）
        full_path = os.path.join(settings.file_storage_dir, doc.file_path)
        text, page_count, page_texts = parse_pdf(full_path)
        doc.page_count = page_count

        # Step 2: 分块（RecursiveCharacterTextSplitter）
        chunks = split_text(text, settings.chunk_size, settings.chunk_overlap)

        # Step 3: 构建 metadata（含页码匹配）
        metadatas = [
            {
                "document_id": doc.id,
                "knowledge_base_id": doc.knowledge_base_id,
                "filename": doc.filename,
                "chunk_index": i,
                "page_number": _find_page(chunk, page_texts),
            }
            for i, chunk in enumerate(chunks)
        ]
        ids = [f"{doc.id}_chunk_{i}" for i in range(len(chunks))]

        # Step 4: 写入向量库（捕获集合被删除的异常）
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
