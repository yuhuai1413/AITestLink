from typing import Optional
from pydantic import BaseModel


class AITaskResponse(BaseModel):
    id: str
    projectId: str
    type: str
    status: str
    modelName: str
    errorMessage: Optional[str]
    createdAt: str
    finishedAt: Optional[str]

    class Config:
        from_attributes = True
