from __future__ import annotations

from datetime import datetime
from typing import Protocol, runtime_checkable

from pydantic import BaseModel, Field


# ── User / Auth DTOs ─────────────────────────────────────────────────

class LoginRequest(BaseModel):
    phone: str
    password: str


class RegisterRequest(BaseModel):
    phone: str
    password: str
    nickname: str = ""


class UserResponse(BaseModel):
    id: str
    phone: str
    nickname: str
    avatar: str
    is_active: bool = Field(alias="isActive")
    is_admin: bool = Field(alias="isAdmin")
    created_at: datetime

    model_config = {"from_attributes": True, "populate_by_name": True}


class TokenResponse(BaseModel):
    access_token: str = Field(alias="accessToken")
    token_type: str = "bearer"
    user: UserResponse

    model_config = {"populate_by_name": True}


class UserUpdate(BaseModel):
    nickname: str | None = None
    avatar: str | None = None
    old_password: str | None = Field(default=None, alias="oldPassword")
    new_password: str | None = Field(default=None, alias="newPassword")

    model_config = {"populate_by_name": True}


# ── Model Config DTOs ────────────────────────────────────────────────

class ModelConfigCreate(BaseModel):
    config_key: str = Field(alias="configKey")
    name: str
    ai_node: str = Field(alias="aiNode")
    provider: str
    model_name: str = Field(alias="modelName")
    api_key: str = Field(default="", alias="apiKey")
    endpoint: str = ""
    description: str = ""
    enabled: bool = True
    display_order: int = Field(default=0, alias="displayOrder")
    prompt: str = ""

    model_config = {"populate_by_name": True}


class ModelConfigUpdate(BaseModel):
    name: str | None = None
    ai_node: str | None = Field(default=None, alias="aiNode")
    provider: str | None = None
    model_name: str | None = Field(default=None, alias="modelName")
    api_key: str | None = Field(default=None, alias="apiKey")
    endpoint: str | None = None
    description: str | None = None
    enabled: bool | None = None
    display_order: int | None = Field(default=None, alias="displayOrder")
    prompt: str | None = None

    model_config = {"populate_by_name": True}


class ModelConfigResponse(BaseModel):
    id: str
    user_id: str = Field(alias="userId")
    config_key: str = Field(alias="configKey")
    name: str
    ai_node: str = Field(alias="aiNode")
    provider: str
    model_name: str = Field(alias="modelName")
    api_key: str = Field(alias="apiKey")
    endpoint: str
    description: str
    enabled: bool
    connection_status: str = Field(default="untested", alias="connectionStatus")
    last_tested_at: datetime | None = Field(default=None, alias="lastTestedAt")
    last_test_message: str = Field(default="", alias="lastTestMessage")
    last_test_latency_ms: int | None = Field(default=None, alias="lastTestLatencyMs")
    display_order: int = Field(alias="displayOrder")
    prompt: str = ""
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True, "populate_by_name": True}


# ── Doc Template DTOs ────────────────────────────────────────────────

class DocTemplateCreate(BaseModel):
    config_key: str = Field(alias="configKey")
    name: str
    description: str = ""
    template_file: str = Field(default="", alias="templateFile")
    prompt_template: str = Field(default="", alias="promptTemplate")
    output_fields: str = Field(default="", alias="outputFields")
    display_order: int = Field(default=0, alias="displayOrder")

    model_config = {"populate_by_name": True}


class DocTemplateUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    template_file: str | None = Field(default=None, alias="templateFile")
    prompt_template: str | None = Field(default=None, alias="promptTemplate")
    output_fields: str | None = Field(default=None, alias="outputFields")
    display_order: int | None = Field(default=None, alias="displayOrder")

    model_config = {"populate_by_name": True}


class DocTemplateResponse(BaseModel):
    id: str
    user_id: str = Field(alias="userId")
    config_key: str = Field(alias="configKey")
    name: str
    description: str
    template_file: str = Field(alias="templateFile")
    prompt_template: str = Field(alias="promptTemplate")
    output_fields: str = Field(alias="outputFields")
    display_order: int = Field(alias="displayOrder")
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True, "populate_by_name": True}


# ── Status Log DTOs ──────────────────────────────────────────────────

class StatusLogResponse(BaseModel):
    id: str
    project_id: str = Field(alias="projectId")
    user_id: str = Field(alias="userId")
    field_name: str = Field(alias="fieldName")
    old_value: str | None = Field(default=None, alias="oldValue")
    new_value: str = Field(alias="newValue")
    change_type: str = Field(alias="changeType")
    reason: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True, "populate_by_name": True}


# ── AI Task DTOs ─────────────────────────────────────────────────────

class AITaskResponse(BaseModel):
    id: str
    project_id: str = Field(alias="projectId")
    type: str
    status: str
    model_name: str = Field(alias="modelName")
    error_message: str | None = Field(default=None, alias="errorMessage")
    result: str | None = None
    created_at: datetime
    finished_at: datetime | None = Field(default=None, alias="finishedAt")

    model_config = {"from_attributes": True, "populate_by_name": True}


class AITaskStatusCheck(BaseModel):
    configured: bool
    name: str = ""
    message: str = ""
    config_id: str | None = Field(default=None, alias="configId")

    model_config = {"populate_by_name": True}


# ── Service Protocols ────────────────────────────────────────────────

@runtime_checkable
class IAuthService(Protocol):
    async def login(self, data: LoginRequest) -> TokenResponse: ...
    async def register(self, data: RegisterRequest) -> UserResponse: ...
    async def get_current_user(self, user_id: str) -> UserResponse | None: ...
    async def update_profile(self, user_id: str, data: UserUpdate) -> UserResponse | None: ...
    async def change_password(self, user_id: str, old_password: str, new_password: str) -> bool: ...
    async def get_user_by_id(self, user_id: str) -> UserResponse | None: ...
    async def list_users(self, skip: int = 0, limit: int = 100) -> list[UserResponse]: ...
    async def update_user_admin(self, user_id: str, is_admin: bool) -> UserResponse | None: ...
    async def update_user_active(self, user_id: str, is_active: bool) -> UserResponse | None: ...


@runtime_checkable
class IModelConfigService(Protocol):
    async def create(self, user_id: str, data: ModelConfigCreate) -> ModelConfigResponse: ...
    async def get_by_id(self, config_id: str) -> ModelConfigResponse | None: ...
    async def list_by_user(self, user_id: str, config_key: str | None = None) -> list[ModelConfigResponse]: ...
    async def update(self, config_id: str, data: ModelConfigUpdate) -> ModelConfigResponse | None: ...
    async def delete(self, config_id: str) -> bool: ...
    async def check_config_for_task(self, task_type: str, user_id: str) -> AITaskStatusCheck: ...


@runtime_checkable
class IDocTemplateService(Protocol):
    async def create(self, user_id: str, data: DocTemplateCreate) -> DocTemplateResponse: ...
    async def get_by_id(self, template_id: str) -> DocTemplateResponse | None: ...
    async def list_by_user(self, user_id: str, config_key: str | None = None) -> list[DocTemplateResponse]: ...
    async def update(self, template_id: str, data: DocTemplateUpdate) -> DocTemplateResponse | None: ...
    async def delete(self, template_id: str) -> bool: ...


@runtime_checkable
class IStatusLogService(Protocol):
    async def log(self, project_id: str, user_id: str, field_name: str, old_value: str | None, new_value: str, change_type: str, reason: str | None = None) -> StatusLogResponse: ...
    async def list_by_project(self, project_id: str, skip: int = 0, limit: int = 100) -> list[StatusLogResponse]: ...
    async def list_by_user(self, user_id: str, skip: int = 0, limit: int = 100) -> list[StatusLogResponse]: ...
