from __future__ import annotations

from datetime import datetime
from typing import Protocol, runtime_checkable

from pydantic import BaseModel, Field


# ── Request / Response DTOs ──────────────────────────────────────────

class ProjectCreate(BaseModel):
    name: str
    test_type: str = Field(alias="testType")
    test_status: str = Field(default="待测试", alias="testStatus")
    doc_status: str = Field(default="待解析", alias="docStatus")
    priority: str = "中"
    description: str = ""

    model_config = {"populate_by_name": True}


class ProjectUpdate(BaseModel):
    name: str | None = None
    test_type: str | None = Field(default=None, alias="testType")
    test_status: str | None = Field(default=None, alias="testStatus")
    doc_status: str | None = Field(default=None, alias="docStatus")
    priority: str | None = None
    description: str | None = None

    model_config = {"populate_by_name": True}


class ProjectResponse(BaseModel):
    id: str
    name: str
    test_type: str = Field(alias="testType")
    test_status: str = Field(alias="testStatus")
    doc_status: str = Field(alias="docStatus")
    priority: str
    description: str
    case_count: int = Field(alias="caseCount")
    pass_rate: int = Field(alias="passRate")
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True, "populate_by_name": True}


# ── Service Protocol ─────────────────────────────────────────────────

@runtime_checkable
class IProjectService(Protocol):
    async def create(self, data: ProjectCreate, user_id: str) -> ProjectResponse: ...
    async def get_by_id(self, project_id: str) -> ProjectResponse | None: ...
    async def list_by_user(self, user_id: str, skip: int = 0, limit: int = 100) -> list[ProjectResponse]: ...
    async def update(self, project_id: str, data: ProjectUpdate) -> ProjectResponse | None: ...
    async def delete(self, project_id: str) -> bool: ...
    async def update_status(self, project_id: str, field: str, value: str, user_id: str, reason: str | None = None) -> ProjectResponse | None: ...
    async def get_stats(self, project_id: str) -> dict: ...
