"""
FastAPI 应用入口。

负责：
1. 应用初始化与生命周期管理（lifespan）
2. 数据库迁移（新增字段）
3. 路由注册
4. 中间件配置（CORS）

启动方式：uvicorn main:app --reload --port 8000
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from sqlalchemy import text
from database import engine, SessionLocal
from models import Base
from routers import auth, knowledge_bases, documents, chat, admin
from config import settings
from services.vector_service import vector_service
import os


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    应用生命周期管理器。
    - 启动时：清理 ChromaDB 残留 → 建表 → 创建存储目录 → 执行迁移
    - 关闭时：无特殊清理
    """
    # 0. 清理之前删除集合时遗留的 ChromaDB 目录（此时 ChromaDB 还没加载）
    vector_service.cleanup_pending()

    # 1. 创建所有 ORM 表（如果不存在）
    Base.metadata.create_all(bind=engine)

    # 2. 创建必要的存储目录
    os.makedirs(settings.file_storage_dir, exist_ok=True)
    os.makedirs(settings.chroma_persist_dir, exist_ok=True)
    os.makedirs(os.path.join(settings.file_storage_dir, "..", "storage", "avatars"), exist_ok=True)

    # 3. 增量数据库迁移：用 _migrations 标记表追踪已执行操作
    with SessionLocal() as db:
        db.execute(text(
            "CREATE TABLE IF NOT EXISTS _migrations "
            "(id INTEGER PRIMARY KEY, name TEXT UNIQUE, applied_at TEXT)"
        ))
        db.commit()
        applied = {row[0] for row in db.execute(text("SELECT name FROM _migrations")).fetchall()}

        pending = [
            ("add_is_admin", "ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT 0"),
            ("add_is_active", "ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT 1"),
            ("add_last_login_at", "ALTER TABLE users ADD COLUMN last_login_at DATETIME"),
            ("add_avatar_path", "ALTER TABLE users ADD COLUMN avatar_path VARCHAR"),
            ("add_file_type", "ALTER TABLE documents ADD COLUMN file_type VARCHAR(20)"),
        ]
        for name, sql in pending:
            if name not in applied:
                try:
                    db.execute(text(sql))
                    db.execute(
                        text(f"INSERT INTO _migrations (name, applied_at) VALUES ('{name}', datetime('now'))")
                    )
                    db.commit()
                except Exception:
                    db.rollback()

    yield


app = FastAPI(title="RAG Knowledge Base", lifespan=lifespan)

# CORS 中间件：允许前端跨域请求
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由模块，所有 API 统一挂载在 /api 前缀下
app.include_router(auth.router, prefix="/api")
app.include_router(knowledge_bases.router, prefix="/api")
app.include_router(documents.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
