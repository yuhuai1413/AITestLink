from typing import Optional
from pydantic import BaseModel


class TestCaseCreate(BaseModel):
    caseCode: str
    module: str
    feature: str = ""
    title: str
    priority: str = "P1"
    precondition: str = ""
    steps: str = ""
    testData: str = ""
    expectedResult: str = ""
    automation: str = "待评估"
    reviewStatus: str = "待评审"
    remark: str = ""
    testPointId: Optional[str] = None
    requirementId: Optional[str] = None


class TestCaseUpdate(BaseModel):
    title: Optional[str] = None
    priority: Optional[str] = None
    precondition: Optional[str] = None
    steps: Optional[str] = None
    testData: Optional[str] = None
    expectedResult: Optional[str] = None
    automation: Optional[str] = None
    reviewStatus: Optional[str] = None
    remark: Optional[str] = None


class TestCaseResponse(BaseModel):
    id: str
    projectId: str
    testPointId: Optional[str]
    requirementId: Optional[str]
    caseCode: str
    module: str
    feature: str
    title: str
    priority: str
    precondition: str
    steps: str
    testData: str
    expectedResult: str
    automation: str
    reviewStatus: str
    remark: str
    createdAt: str
    updatedAt: str

    class Config:
        from_attributes = True
