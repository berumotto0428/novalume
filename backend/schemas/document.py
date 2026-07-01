from datetime import datetime

from pydantic import BaseModel, Field, ConfigDict


class DocumentRename(BaseModel):
    filename: str = Field(..., min_length=1, max_length=255)


class DocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    knowledge_base_id: str
    filename: str
    file_size: int
    page_count: int | None
    file_type: str | None = None
    status: str
    chunk_count: int
    error_message: str | None
    created_at: datetime
