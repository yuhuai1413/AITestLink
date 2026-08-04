from typing import Optional
from typing import Literal
from pydantic import BaseModel, ConfigDict, model_validator


class EnvironmentConfigCreate(BaseModel):
    name: str
    environmentType: Literal["Web", "APP"] = "Web"
    webUrl: str = ""
    appUrl: str = ""
    otherUrls: str = ""
    timeout: str = "30"
    retryCount: str = "3"
    captchaRequired: bool = True
    captchaCode: str = ""
    notes: str = ""
    isDefault: bool = False

    @model_validator(mode="after")
    def validate_single_target(self):
        if self.environmentType == "Web":
            if not self.webUrl.strip():
                raise ValueError("Web 环境必须配置 Web 地址")
            self.appUrl = ""
        else:
            if not self.appUrl.strip():
                raise ValueError("APP 环境必须配置 APP 地址")
            self.webUrl = ""
        return self


class EnvironmentConfigUpdate(BaseModel):
    name: Optional[str] = None
    environmentType: Optional[Literal["Web", "APP"]] = None
    webUrl: Optional[str] = None
    appUrl: Optional[str] = None
    otherUrls: Optional[str] = None
    timeout: Optional[str] = None
    retryCount: Optional[str] = None
    captchaRequired: Optional[bool] = None
    captchaCode: Optional[str] = None
    notes: Optional[str] = None
    isDefault: Optional[bool] = None


class TestAccountCreate(BaseModel):
    environmentId: str
    name: str
    username: str
    department: str = ""
    password: str
    role: str = ""
    isAdmin: bool = False
    notes: str = ""


class TestAccountUpdate(BaseModel):
    name: Optional[str] = None
    username: Optional[str] = None
    department: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None
    isAdmin: Optional[bool] = None
    notes: Optional[str] = None


class EnvironmentConfigResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    projectId: str
    name: str
    environmentType: str
    webUrl: str
    appUrl: str
    otherUrls: str
    timeout: str
    retryCount: str
    captchaRequired: bool
    captchaCode: str
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
    department: str
    password: str
    hasPassword: bool = False
    role: str
    isAdmin: bool = False
    notes: str
    createdAt: str
    updatedAt: str
