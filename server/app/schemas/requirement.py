from typing import Optional
from pydantic import BaseModel


class RequirementUpdate(BaseModel):
    rule: Optional[str] = None
    question: Optional[str] = None
    confirmed: Optional[bool] = None
    reviewStatus: Optional[str] = None


class RequirementResponse(BaseModel):
    id: str
    projectId: str
    module: str
    feature: str
    source: str
    risk: str
    rule: str
    question: str
    confirmed: bool
    reviewStatus: str = "待评审" 

    class Config:
        from_attributes = True
