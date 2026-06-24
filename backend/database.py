"""
数据库引擎与会话管理。

提供 SQLAlchemy 引擎、Session 工厂和 FastAPI 依赖注入函数。
使用 SQLite 作为本地关系数据库，存储用户、知识库、文档、对话等结构化数据。

与 ChromaDB（向量数据库）互补：SQLite 存业务对象，ChromaDB 存向量索引。
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

# SQLite 数据库文件路径（相对于 backend/ 目录）
SQLALCHEMY_DATABASE_URL = "sqlite:///./rag.db"

# 【风险说明】check_same_thread=False 允许跨线程/协程访问 SQLite
# 在异步框架中这是必要的，但需要使用者保证同一时刻只有一个写操作
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})

# SessionLocal = SQLAlchemy Session 的工厂函数
# autocommit=False：需要显式 commit
# autoflush=False：不会自动 flush，查询前需手动 flush
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    """所有 ORM 模型的基础类"""
    pass


def get_db():
    """
    FastAPI 依赖注入函数。

    用法：在路由函数参数中声明 db: Session = Depends(get_db)
    FastAPI 会自动在每个请求中创建 Session，请求结束后关闭。
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
