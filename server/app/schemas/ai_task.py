from typing import Optional
from pydantic import BaseModel, ConfigDict


class AITaskResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    projectId: str
    type: str
    status: str
    modelName: str
    errorMessage: Optional[str]
    createdAt: str
    finishedAt: Optional[str]
