from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import shutil
import os

from database import get_db
from models.user import User
from models.knowledge_base import KnowledgeBase
from schemas.knowledge_base import KBCreate, KBUpdate, KBResponse
from routers.auth import get_current_user
from config import settings
from services.vector_service import vector_service

router = APIRouter(prefix="/knowledge-bases", tags=["knowledge-bases"])


@router.get("", response_model=list[KBResponse])
def list_knowledge_bases(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    kbs = db.query(KnowledgeBase).filter(KnowledgeBase.user_id == current_user.id).all()
    return [
        KBResponse(
            id=kb.id, name=kb.name, description=kb.description,
            doc_count=kb.doc_count, ready_doc_count=kb.ready_doc_count,
            created_at=kb.created_at, updated_at=kb.updated_at,
        )
        for kb in kbs
    ]


@router.post("", response_model=KBResponse, status_code=201)
def create_knowledge_base(
    request: KBCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    kb = KnowledgeBase(name=request.name, description=request.description, user_id=current_user.id)
    db.add(kb)
    db.commit()
    return KBResponse(
        id=kb.id, name=kb.name, description=kb.description,
        doc_count=0, ready_doc_count=0,
        created_at=kb.created_at, updated_at=kb.updated_at,
    )


@router.get("/{kb_id}", response_model=KBResponse)
def get_knowledge_base(
    kb_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    kb = db.get(KnowledgeBase, kb_id)
    if not kb or kb.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="知识库不存在")
    return KBResponse(
        id=kb.id, name=kb.name, description=kb.description,
        doc_count=kb.doc_count, ready_doc_count=kb.ready_doc_count,
        created_at=kb.created_at, updated_at=kb.updated_at,
    )


@router.put("/{kb_id}", response_model=KBResponse)
def update_knowledge_base(
    kb_id: str, request: KBUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    kb = db.get(KnowledgeBase, kb_id)
    if not kb or kb.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="知识库不存在")
    if request.name is not None:
        kb.name = request.name
    if request.description is not None:
        kb.description = request.description
    db.commit()
    return KBResponse(
        id=kb.id, name=kb.name, description=kb.description,
        doc_count=kb.doc_count, ready_doc_count=kb.ready_doc_count,
        created_at=kb.created_at, updated_at=kb.updated_at,
    )


@router.delete("/{kb_id}")
def delete_knowledge_base(
    kb_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    kb = db.get(KnowledgeBase, kb_id)
    if not kb or kb.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="知识库不存在")

    # 级联删除：磁盘文件
    kb_dir = os.path.join(settings.file_storage_dir, kb_id)
    if os.path.exists(kb_dir):
        shutil.rmtree(kb_dir)

    # 级联删除：ChromaDB collection
    vector_service.delete_collection(kb_id)

    # 级联删除：DB 记录（cascade="all, delete-orphan" 自动处理文档记录）
    db.delete(kb)
    db.commit()
    return {"message": "知识库已删除"}
