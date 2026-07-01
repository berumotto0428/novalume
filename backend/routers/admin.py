from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from pypinyin import lazy_pinyin
import os
import shutil

from database import get_db
from models.user import User
from models.knowledge_base import KnowledgeBase
from models.document import Document
from routers.auth import get_current_user
from services.auth_service import hash_password
from services.vector_service import vector_service
from config import settings

router = APIRouter(prefix="/admin", tags=["admin"])


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="无管理员权限")
    return current_user


@router.get("/stats")
def get_stats(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return {
        "total_users": db.query(User).count(),
        "active_users": db.query(User).filter(User.is_active == True).count(),
        "total_knowledge_bases": db.query(KnowledgeBase).count(),
        "total_documents": db.query(Document).count(),
        "ready_documents": db.query(Document).filter(Document.status == "ready").count(),
    }


@router.get("/users")
def list_users(
    page: int = 1,
    page_size: int = 20,
    search: str | None = None,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    query = db.query(User)
    if search:
        query = query.filter(
            User.username.ilike(f"%{search}%") | User.email.ilike(f"%{search}%")
        )
    total = query.count()
    start = (page - 1) * page_size
    users = query.order_by(User.created_at.desc()).offset(start).limit(page_size).all()

    def fmt_dt(dt) -> str | None:
        """序列化时间，标记 UTC"""
        if dt is None:
            return None
        return dt.isoformat() + 'Z'

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [
            {
                "id": u.id,
                "username": u.username,
                "email": u.email,
                "is_admin": u.is_admin,
                "is_active": u.is_active,
                "kb_count": len(u.knowledge_bases),
                "last_login_at": fmt_dt(u.last_login_at),
                "created_at": fmt_dt(u.created_at),
            }
            for u in users
        ],
    }


@router.get("/users/{user_id}")
def get_user_detail(
    user_id: str,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    def fmt(dt):
        return dt.isoformat() + 'Z' if dt else None

    kbs = db.query(KnowledgeBase).filter(KnowledgeBase.user_id == user_id).all()
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "is_admin": user.is_admin,
        "is_active": user.is_active,
        "kb_count": len(kbs),
        "last_login_at": fmt(user.last_login_at),
        "created_at": fmt(user.created_at),
        "knowledge_bases": [
            {
                "id": kb.id,
                "name": kb.name,
                "doc_count": kb.doc_count,
                "created_at": fmt(kb.created_at),
                "documents": [
                    {
                        "id": doc.id,
                        "filename": doc.filename,
                        "file_type": doc.file_type,
                        "file_size": doc.file_size,
                        "page_count": doc.page_count,
                        "status": doc.status,
                        "chunk_count": doc.chunk_count,
                        "created_at": fmt(doc.created_at),
                    }
                    for doc in kb.documents
                ],
            }
            for kb in kbs
        ],
    }


class UserStatusUpdate(BaseModel):
    is_active: bool


@router.put("/users/{user_id}/status")
def update_user_status(
    user_id: str,
    request: UserStatusUpdate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    if user.is_admin:
        raise HTTPException(status_code=400, detail="不能禁用管理员账号")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="不能操作自己的账号")
    user.is_active = request.is_active
    db.commit()
    return {"message": "成功禁用用户" if not request.is_active else "成功启用用户"}


@router.post("/users/{user_id}/reset-password")
def reset_password(
    user_id: str,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    user.password_hash = hash_password("123456")
    db.commit()
    return {"message": "密码已重置为 123456，请提醒用户及时修改"}


@router.delete("/users/{user_id}")
def delete_user(
    user_id: str,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    if user.is_admin:
        raise HTTPException(status_code=400, detail="不能删除管理员账号")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="不能删除自己的账号")

    # 清理磁盘文件和 ChromaDB
    for kb in user.knowledge_bases:
        kb_dir = os.path.join(settings.file_storage_dir, kb.id)
        if os.path.exists(kb_dir):
            shutil.rmtree(kb_dir)
        vector_service.delete_collection(kb.id)

    db.delete(user)  # cascade 自动删除 knowledge_bases / documents / conversations / messages
    db.commit()
    return {"message": "用户已删除"}
