from typing import Optional
from pydantic import BaseModel, ConfigDict


class EnvironmentConfigCreate(BaseModel):
    name: str
    webUrl: str = ""
    appUrl: str = ""
    otherUrls: str = ""
    timeout: str = "30"
    retryCount: str = "3"
    notes: str = ""
    isDefault: bool = False


class EnvironmentConfigUpdate(BaseModel):
    name: Optional[str] = None
    webUrl: Optional[str] = None
    appUrl: Optional[str] = None
    otherUrls: Optional[str] = None
    timeout: Optional[str] = None
    retryCount: Optional[str] = None
    notes: Optional[str] = None
    isDefault: Optional[bool] = None


class TestAccountCreate(BaseModel):
    environmentId: str
    name: str
    username: str
    password: str
    role: str = ""
    notes: str = ""


class TestAccountUpdate(BaseModel):
    name: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None
    notes: Optional[str] = None


class EnvironmentConfigResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    projectId: str
    name: str
    webUrl: str
    appUrl: str
    otherUrls: str
    timeout: str
    retryCount: str
    notes: str
    isDefault: bool
    createdAt: str
    updatedAt: str



class TestAccountResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    environmentId: str
    name: str
    username: str
    password: str
    hasPassword: bool = False
    role: str
    notes: str
    createdAt: str
    updatedAt: str
