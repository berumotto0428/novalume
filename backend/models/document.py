from uuid import uuid4
from datetime import datetime

from sqlalchemy import String, Integer, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid4()))
    knowledge_base_id: Mapped[str] = mapped_column(String, ForeignKey("knowledge_bases.id"), nullable=False)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    file_path: Mapped[str] = mapped_column(String, nullable=False)  # 相对于 FILE_STORAGE_DIR 的路径
    file_size: Mapped[int] = mapped_column(Integer)  # 字节
    page_count: Mapped[int | None] = mapped_column(Integer)  # PDF 页数
    # file_type 枚举：pdf | word | markdown | excel | pptx | image
    file_type: Mapped[str | None] = mapped_column(String(20))  # ← 新增
    status: Mapped[str] = mapped_column(String(20), default="pending")
    # status 枚举：pending | processing | ready | failed
    chunk_count: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[str | None] = mapped_column(String(1000))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    # relationships
    knowledge_base: Mapped["KnowledgeBase"] = relationship(back_populates="documents")
