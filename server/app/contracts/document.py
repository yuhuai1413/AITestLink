from __future__ import annotations

from datetime import datetime
from typing import Protocol, runtime_checkable

from pydantic import BaseModel, Field


# ── Request / Response DTOs ──────────────────────────────────────────

class FileAssetResponse(BaseModel):
    id: str
    project_id: str = Field(alias="projectId")
    name: str
    file_type: str = Field(alias="fileType")
    size: str
    storage_path: str = Field(alias="storagePath")
    parse_status: str = Field(alias="parseStatus")
    parse_error: str = Field(alias="parseError")
    uploaded_at: datetime = Field(alias="uploadedAt")

    model_config = {"from_attributes": True, "populate_by_name": True}


class RequirementUpdate(BaseModel):
    rule: str | None = None
    question: str | None = None
    confirmed: bool | None = None
    review_status: str | None = Field(default=None, alias="reviewStatus")

    model_config = {"populate_by_name": True}


class RequirementResponse(BaseModel):
    id: str
    req_id: str = Field(default="", alias="reqId")
    project_id: str = Field(alias="projectId")
    module: str
    feature: str
    source: str
    risk: str
    rule: str
    question: str
    confirmed: bool
    review_status: str = Field(default="待评审", alias="reviewStatus")
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = {"from_attributes": True, "populate_by_name": True}


class ParsedRequirement(BaseModel):
    """AI 解析出的单条需求"""
    module: str
    feature: str
    source: str = ""
    risk: str = "中"
    rule: str = ""
    question: str = ""


class DocumentParseResult(BaseModel):
    """文档解析结果"""
    requirements: list[ParsedRequirement]
    total_count: int = 0
    module_count: int = 0


# ── Service Protocol ─────────────────────────────────────────────────

@runtime_checkable
class IDocumentService(Protocol):
    async def upload(self, file_content: bytes, filename: str, project_id: str) -> FileAssetResponse: ...
    async def get_by_id(self, doc_id: str) -> FileAssetResponse | None: ...
    async def list_by_project(self, project_id: str) -> list[FileAssetResponse]: ...
    async def delete(self, doc_id: str) -> bool: ...
    async def get_content(self, doc_id: str) -> str | None: ...
    async def parse_document(self, doc_id: str, user_id: str) -> DocumentParseResult: ...
    async def get_requirements(self, project_id: str) -> list[RequirementResponse]: ...
    async def update_requirement(self, req_id: str, data: RequirementUpdate) -> RequirementResponse | None: ...
    async def search_requirements(self, project_id: str, query: str) -> list[RequirementResponse]: ...
    async def batch_confirm(self, req_ids: list[str], confirmed: bool) -> int: ...
