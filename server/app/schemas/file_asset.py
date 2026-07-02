from typing import Optional
from pydantic import BaseModel


class FileAssetResponse(BaseModel):
    id: str
    projectId: str
    name: str
    fileType: str
    size: str
    parseStatus: str
    uploadedAt: str

    class Config:
        from_attributes = True
