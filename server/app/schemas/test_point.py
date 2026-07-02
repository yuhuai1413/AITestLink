from typing import Optional
from pydantic import BaseModel


class TestPointCreate(BaseModel):
    module: str
    type: str
    title: str
    description: str = ""
    priority: str = "P1"
    automatable: bool = False


class TestPointUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None
    reviewStatus: Optional[str] = None


class TestPointResponse(BaseModel):
    id: str
    projectId: str
    requirementId: Optional[str]
    module: str
    type: str
    title: str
    description: str
    priority: str
    automatable: bool
    reviewStatus: str

    class Config:
        from_attributes = True
