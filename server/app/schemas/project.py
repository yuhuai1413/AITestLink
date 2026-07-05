from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class ProjectCreate(BaseModel):
    name: str
    testType: str
    testStatus: str = "待测试"
    docStatus: str = "待解析"
    priority: str = "中"
    description: str = ""


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    testType: Optional[str] = None
    testStatus: Optional[str] = None
    docStatus: Optional[str] = None
    priority: Optional[str] = None
    description: Optional[str] = None


class ProjectResponse(BaseModel):
    id: str
    name: str
    testType: str
    testStatus: str
    docStatus: str
    priority: str
    description: str
    caseCount: int
    passRate: int
    createdAt: str
    updatedAt: str

    class Config:
        from_attributes = True
