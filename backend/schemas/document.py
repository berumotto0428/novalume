from pydantic import BaseModel, Field, ConfigDict
from typing import Optional
from datetime import datetime


class DocumentRename(BaseModel):
    filename: str = Field(..., min_length=1, max_length=255)


class DocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    knowledge_base_id: str
    filename: str
    file_size: int
    page_count: Optional[int]
    status: str
    chunk_count: int
    error_message: Optional[str]
    created_at: datetime
