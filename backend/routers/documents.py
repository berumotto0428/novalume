import os
import asyncio

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, Request, BackgroundTasks
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from database import get_db
from models.user import User
from models.knowledge_base import KnowledgeBase
from models.document import Document
from models.message import Message
from schemas.document import DocumentResponse, DocumentRename
from routers.auth import get_current_user
from config import settings
from services.document_processor import process_document
from services.vector_service import vector_service
from services.auth_service import decode_token

router = APIRouter()

ALLOWED_EXTENSIONS = {".pdf"}


def verify_kb_access(kb_id: str, current_user: User, db: Session) -> KnowledgeBase:
    kb = db.get(KnowledgeBase, kb_id)
    if not kb or kb.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="知识库不存在")
    return kb


async def _run_process(doc_id: str):
    """在独立线程中执行文档处理，不阻塞事件循环"""
    await asyncio.get_running_loop().run_in_executor(None, process_document, doc_id)


@router.post("/knowledge-bases/{kb_id}/documents", response_model=list[DocumentResponse], status_code=201)
async def upload_documents(
    kb_id: str,
    request: Request,
    background_tasks: BackgroundTasks,
    files: list[UploadFile] = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # 通过 Content-Length 预检查总上传大小（快速拒绝超大请求）
    content_length = request.headers.get("content-length")
    if content_length:
        total_bytes = int(content_length)
        max_total = settings.max_upload_size_mb * 1024 * 1024 * 5  # 最多5个文件的总和
        if total_bytes > max_total:
            raise HTTPException(status_code=413, detail=f"上传数据过大（限制 {max_total // (1024*1024)}MB）")

    kb = verify_kb_access(kb_id, current_user, db)
    results = []
    kb_dir = os.path.join(settings.file_storage_dir, kb_id)
    os.makedirs(kb_dir, exist_ok=True)

    # 先全部验证通过，再逐个写入（防止部分失败产生孤立数据）
    validated = []
    for file in files:
        ext = os.path.splitext(file.filename)[1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(status_code=400, detail=f"文件 {file.filename} 不是 PDF 格式")
        content = await file.read()
        if len(content) > settings.max_upload_size_mb * 1024 * 1024:
            raise HTTPException(
                status_code=400,
                detail=f"文件 {file.filename} 超出大小限制（{settings.max_upload_size_mb}MB）",
            )
        validated.append((file.filename, content))

    for filename, content in validated:
        doc = Document(
            knowledge_base_id=kb_id,
            user_id=current_user.id,
            filename=filename,
            file_size=len(content),
            status="pending",
            # 先设临时 path，flush 获取 id 后更新为真实路径
            file_path="",
        )
        db.add(doc)
        db.flush()

        # 保存文件：{kb_id}/{doc_id}.pdf（UUID 命名，避免中文文件名问题）
        doc_path = os.path.join(kb_dir, f"{doc.id}.pdf")
        with open(doc_path, "wb") as f:
            f.write(content)
        doc.file_path = os.path.join(kb_id, f"{doc.id}.pdf")

        results.append(DocumentResponse(
            id=doc.id, knowledge_base_id=doc.knowledge_base_id,
            filename=doc.filename, file_size=doc.file_size,
            page_count=doc.page_count, status=doc.status,
            chunk_count=doc.chunk_count, error_message=doc.error_message,
            created_at=doc.created_at,
        ))

        # 触发后台处理（BackgroundTasks + run_in_executor，不阻塞事件循环）
        background_tasks.add_task(_run_process, doc.id)

    db.commit()
    return results


@router.get("/knowledge-bases/{kb_id}/documents", response_model=list[DocumentResponse])
def list_documents(
    kb_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    verify_kb_access(kb_id, current_user, db)
    docs = db.query(Document).filter(Document.knowledge_base_id == kb_id).all()
    return [
        DocumentResponse(
            id=d.id, knowledge_base_id=d.knowledge_base_id,
            filename=d.filename, file_size=d.file_size,
            page_count=d.page_count, status=d.status,
            chunk_count=d.chunk_count, error_message=d.error_message,
            created_at=d.created_at,
        )
        for d in docs
    ]


@router.get("/knowledge-bases/{kb_id}/documents/{doc_id}", response_model=DocumentResponse)
def get_document(
    kb_id: str, doc_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    verify_kb_access(kb_id, current_user, db)
    doc = db.get(Document, doc_id)
    if not doc or doc.knowledge_base_id != kb_id:
        raise HTTPException(status_code=404, detail="文档不存在")
    return DocumentResponse(
        id=doc.id, knowledge_base_id=doc.knowledge_base_id,
        filename=doc.filename, file_size=doc.file_size,
        page_count=doc.page_count, status=doc.status,
        chunk_count=doc.chunk_count, error_message=doc.error_message,
        created_at=doc.created_at,
    )


@router.put("/knowledge-bases/{kb_id}/documents/{doc_id}", response_model=DocumentResponse)
def rename_document(
    kb_id: str, doc_id: str,
    request: DocumentRename,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    verify_kb_access(kb_id, current_user, db)
    doc = db.get(Document, doc_id)
    if not doc or doc.knowledge_base_id != kb_id:
        raise HTTPException(status_code=404, detail="文档不存在")
    old_filename = doc.filename
    doc.filename = request.filename
    db.commit()

    # 同步更新 ChromaDB 中的文件名
    if old_filename != request.filename:
        vector_service.rename_document_chunks(kb_id, doc_id, request.filename)

    # 同步更新历史消息中的来源文件名（只查当前知识库的会话）
    if old_filename != request.filename:
        import json as json_lib
        from models.conversation import Conversation
        conv_ids = [c.id for c in db.query(Conversation).filter(Conversation.knowledge_base_id == kb_id).all()]
        msgs = []
        if conv_ids:
            msgs = db.query(Message).filter(
                Message.conversation_id.in_(conv_ids),
                Message.sources != None,
            ).all()
        updated = 0
        for msg in msgs:
            try:
                sources = json_lib.loads(msg.sources)
                changed = False
                for s in sources:
                    if isinstance(s, dict) and s.get("document_id") == doc_id and s.get("filename") == old_filename:
                        s["filename"] = request.filename
                        changed = True
                if changed:
                    msg.sources = json_lib.dumps(sources, ensure_ascii=False)
                    updated += 1
            except (json_lib.JSONDecodeError, TypeError):
                continue
        db.commit()
    return DocumentResponse(
        id=doc.id, knowledge_base_id=doc.knowledge_base_id,
        filename=doc.filename, file_size=doc.file_size,
        page_count=doc.page_count, status=doc.status,
        chunk_count=doc.chunk_count, error_message=doc.error_message,
        created_at=doc.created_at,
    )


@router.get("/knowledge-bases/{kb_id}/documents/{doc_id}/file")
def get_document_file(
    kb_id: str, doc_id: str,
    request: Request,
    token: str | None = Query(None),
    db: Session = Depends(get_db),
):
    # 1) query param token（iframe 嵌入）
    raw_token = token
    if not raw_token:
        # 2) Bearer header（API 调用）
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            raw_token = auth[7:]

    if not raw_token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        user_id = decode_token(raw_token)
        user = db.get(User, user_id)
    except Exception:
        raise HTTPException(status_code=401, detail="Token 无效")

    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    verify_kb_access(kb_id, user, db)
    doc = db.get(Document, doc_id)
    if not doc or doc.knowledge_base_id != kb_id:
        raise HTTPException(status_code=404, detail="文档不存在")
    file_path = os.path.join(settings.file_storage_dir, doc.file_path)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="文件不存在")
    return FileResponse(file_path, media_type="application/pdf")


@router.delete("/knowledge-bases/{kb_id}/documents/{doc_id}")
def delete_document(
    kb_id: str, doc_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    verify_kb_access(kb_id, current_user, db)
    doc = db.get(Document, doc_id)
    if not doc or doc.knowledge_base_id != kb_id:
        raise HTTPException(status_code=404, detail="文档不存在")

    # 1. 删除磁盘文件
    doc_path = os.path.join(settings.file_storage_dir, doc.file_path)
    if os.path.exists(doc_path):
        os.remove(doc_path)

    # 2. 删除向量库 chunks
    vector_service.delete_document_chunks(doc.knowledge_base_id, doc.id)

    # 3. 删除 DB 记录
    db.delete(doc)
    db.commit()
    return {"message": "文档已删除"}
