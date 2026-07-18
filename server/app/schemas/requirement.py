from typing import Optional
from pydantic import BaseModel, ConfigDict


class RequirementUpdate(BaseModel):
    rule: Optional[str] = None
    question: Optional[str] = None
    confirmed: Optional[bool] = None
    clarificationStatus: Optional[str] = None
    clarificationAnswer: Optional[str] = None
    reviewStatus: Optional[str] = None


class RequirementResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    reqId: str = ""
    projectId: str
    module: str
    feature: str
    source: str
    risk: str
    rule: str
    question: str
    confirmed: bool
    clarificationStatus: str = "无需确认"
    clarificationAnswer: str = ""
    reviewStatus: str = "待评审" 
