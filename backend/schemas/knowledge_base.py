from datetime import datetime

from pydantic import BaseModel, Field, ConfigDict


class KBCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = Field(None, max_length=500)


class KBUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    description: str | None = Field(None, max_length=500)


class KBResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    description: str | None
    doc_count: int
    ready_doc_count: int
    created_at: datetime
    updated_at: datetime
