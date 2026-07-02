from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class ProjectCreate(BaseModel):
    name: str
    version: str = "V0.1"
    owner: str
    testType: str
    status: str = "设计中"
    description: str = ""
    riskLevel: str = "中"


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    version: Optional[str] = None
    owner: Optional[str] = None
    testType: Optional[str] = None
    status: Optional[str] = None
    description: Optional[str] = None
    riskLevel: Optional[str] = None


class ProjectResponse(BaseModel):
    id: str
    name: str
    version: str
    owner: str
    testType: str
    status: str
    description: str
    caseCount: int
    passRate: int
    riskLevel: str
    createdAt: str
    updatedAt: str

    class Config:
        from_attributes = True
