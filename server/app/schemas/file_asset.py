from typing import Optional
from pydantic import BaseModel, ConfigDict


class FileAssetResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    projectId: str
    name: str
    fileType: str
    size: str
    parseStatus: str
    uploadedAt: str
