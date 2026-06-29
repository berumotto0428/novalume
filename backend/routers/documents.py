import os
import asyncio
import subprocess
import threading

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

ALLOWED_EXTENSIONS = {
    ".pdf", ".docx", ".doc",
    ".md", ".txt",
    ".xlsx", ".xls",
    ".pptx",
    ".jpg", ".jpeg", ".png",
}

MIME_TYPES = {
    ".pdf":  "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".doc":  "application/msword",
    ".md":   "text/markdown",
    ".txt":  "text/plain",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".xls":  "application/vnd.ms-excel",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".jpg":  "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png":  "image/png",
}


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
            raise HTTPException(
                status_code=400,
                detail=f"文件 {file.filename} 格式不支持，仅支持 PDF / Word / Excel / PPT / Markdown / 图片",
            )
        content = await file.read()
        if len(content) > settings.max_upload_size_mb * 1024 * 1024:
            raise HTTPException(
                status_code=400,
                detail=f"文件 {file.filename} 超出大小限制（{settings.max_upload_size_mb}MB）",
            )
        validated.append((file.filename, content, ext))

    for filename, content, ext in validated:
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

        # 保存文件：{kb_id}/{doc_id}{原始扩展名}（UUID 命名，避免中文文件名问题）
        doc_path = os.path.join(kb_dir, f"{doc.id}{ext}")
        with open(doc_path, "wb") as f:
            f.write(content)
        doc.file_path = os.path.join(kb_id, f"{doc.id}{ext}")

        results.append(DocumentResponse.model_validate(doc))

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
    return [DocumentResponse.model_validate(d) for d in docs]


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
    return DocumentResponse.model_validate(doc)


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
    return DocumentResponse.model_validate(doc)


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
    ext = os.path.splitext(doc.file_path)[1].lower()
    mime = MIME_TYPES.get(ext, "application/octet-stream")
    return FileResponse(file_path, media_type=mime)


_preview_lock = threading.Lock()


@router.get("/knowledge-bases/{kb_id}/documents/{doc_id}/preview")
def get_document_preview(
    kb_id: str, doc_id: str,
    request: Request,
    token: str | None = Query(None),
    db: Session = Depends(get_db),
):
    """Word/PPT → LibreOffice 转 PDF，缓存后返回。

    认证：同时支持 Bearer header 和 query param token（与 /file 一致）。
    并发：threading.Lock + 双重检查。LibreOffice 不支持并行转换，第一个
    请求转换期间后续请求排队等待。大文件（几十MB PPT）耗时 10-30 秒。
    FastAPI 自动将 sync def 放线程池执行，不阻塞主事件循环。
    Lock 导致等待请求在线程池中排队，单用户场景可接受。
    """
    # 认证（双模式：query param token + Bearer header）
    raw_token = token
    if not raw_token:
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
        raise HTTPException(status_code=401, detail="用户不存在")

    # 权限校验：确认知识库属于当前用户
    verify_kb_access(kb_id, user, db)

    doc = db.get(Document, doc_id)
    if not doc or doc.knowledge_base_id != kb_id:
        raise HTTPException(status_code=404, detail="文档不存在")

    # 格式校验：只服务 Word/PPT，其他格式不调用 LibreOffice
    PREVIEW_SUPPORTED_TYPES = {"word", "pptx"}
    if doc.file_type not in PREVIEW_SUPPORTED_TYPES:
        raise HTTPException(status_code=400, detail="该格式不支持预览转换")

    preview_path = os.path.join(settings.file_storage_dir, kb_id, f"{doc_id}_preview.pdf")

    # 缓存命中 → 直接返回
    if os.path.exists(preview_path):
        return FileResponse(preview_path, media_type="application/pdf")

    # 缓存未命中 → 加锁转换（LibreOffice 不能并行）
    with _preview_lock:
        # 双重检查（等锁期间可能已被其他请求转好）
        if os.path.exists(preview_path):
            return FileResponse(preview_path, media_type="application/pdf")

        original_path = os.path.join(settings.file_storage_dir, doc.file_path)
        output_dir = os.path.dirname(preview_path)

        result = subprocess.run(
            ["libreoffice", "--headless", "--convert-to", "pdf",
             "--outdir", output_dir, original_path],
            capture_output=True, text=True, timeout=120,
        )
        if result.returncode != 0:
            raise HTTPException(500, f"文档转换失败: {result.stderr[:200]}")

        # LibreOffice 输出文件名 = 磁盘文件名（doc_id）+.pdf，重命名为带 _preview 后缀
        stored_stem = os.path.splitext(os.path.basename(doc.file_path))[0]
        actual_output = os.path.join(output_dir, f"{stored_stem}.pdf")
        expected_output = os.path.join(output_dir, f"{doc_id}_preview.pdf")
        if os.path.exists(actual_output) and actual_output != expected_output:
            os.rename(actual_output, expected_output)

        return FileResponse(preview_path, media_type="application/pdf")


@router.get("/knowledge-bases/{kb_id}/documents/{doc_id}/text")
def get_document_text(
    kb_id: str, doc_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """返回文档的文本内容（用于 Markdown/TXT 预览）。

    Markdown/TXT 直接读取原文件（预览的是用户上传的原文，不是 chunks 拼接）。
    其他格式目前不需要此接口。
    """
    verify_kb_access(kb_id, current_user, db)
    doc = db.get(Document, doc_id)
    if not doc or doc.knowledge_base_id != kb_id:
        raise HTTPException(status_code=404, detail="文档不存在")

    try:
        # Markdown/TXT：直接读取原文件
        if doc.file_type == "markdown":
            file_path = os.path.join(settings.file_storage_dir, doc.file_path)
            if not os.path.exists(file_path):
                return {"text": ""}
            with open(file_path, "r", encoding="utf-8", errors="replace") as f:
                return {"text": f.read()}

        # 其他格式：从 ChromaDB 拼接 chunks
        collection = vector_service.get_or_create_collection(kb_id)
        result = collection.get(
            where={"document_id": doc_id},
            include=["documents", "metadatas"],
        )
        if not result or not result.get("documents"):
            return {"text": ""}

        pairs = sorted(
            zip(result["documents"], result["metadatas"]),
            key=lambda x: x[1].get("chunk_index", 0),
        )
        text = "\n\n---\n\n".join(d for d, _ in pairs)
        return {"text": text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取文档内容失败: {e}")


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

    # 1b. 删除预览缓存（Word/PPT 的 LibreOffice 转换结果）
    preview_path = os.path.join(settings.file_storage_dir, kb_id, f"{doc.id}_preview.pdf")
    if os.path.exists(preview_path):
        os.remove(preview_path)

    # 2. 删除向量库 chunks
    vector_service.delete_document_chunks(doc.knowledge_base_id, doc.id)

    # 3. 删除 DB 记录
    db.delete(doc)
    db.commit()
    return {"message": "文档已删除"}
