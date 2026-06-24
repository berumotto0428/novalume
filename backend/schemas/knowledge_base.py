from pydantic import BaseModel, Field, ConfigDict
from typing import Optional
from datetime import datetime


class KBCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)


class KBUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)


class KBResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    description: Optional[str]
    doc_count: int
    ready_doc_count: int
    created_at: datetime
    updated_at: datetime
