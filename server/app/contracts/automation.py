from __future__ import annotations

from datetime import datetime
from typing import Protocol, runtime_checkable

from pydantic import BaseModel, Field


# ── Request / Response DTOs ──────────────────────────────────────────

class AutomationScriptResponse(BaseModel):
    id: str
    project_id: str = Field(alias="projectId")
    test_case_id: str | None = Field(default=None, alias="testCaseId")
    script_type: str = Field(alias="scriptType")
    framework: str
    language: str
    code: str
    status: str
    script_code: str = Field(alias="scriptCode")
    review_status: str = Field(alias="reviewStatus")
    generated_by_ai: bool = Field(alias="generatedByAi")
    executed_at: datetime | None = Field(default=None, alias="executedAt")
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True, "populate_by_name": True}


class GeneratedScript(BaseModel):
    """AI 生成的脚本"""
    test_case_id: str = Field(alias="testCaseId")
    script_type: str = Field(default="UI", alias="scriptType")
    framework: str = "Playwright"
    language: str = "Python"
    code: str
    script_code: str = Field(default="", alias="scriptCode")

    model_config = {"populate_by_name": True}


class ScriptReviewRequest(BaseModel):
    review_status: str = Field(alias="reviewStatus")

    model_config = {"populate_by_name": True}


class ExecutionLog(BaseModel):
    """脚本执行日志"""
    script_id: str = Field(alias="scriptId")
    status: str
    output: str = ""
    error: str | None = None
    executed_at: datetime = Field(alias="executedAt")

    model_config = {"populate_by_name": True}


# ── Service Protocol ─────────────────────────────────────────────────

@runtime_checkable
class IAutomationService(Protocol):
    async def generate_scripts(self, project_id: str, case_ids: list[str], user_id: str) -> list[AutomationScriptResponse]: ...
    async def get_script(self, script_id: str) -> AutomationScriptResponse | None: ...
    async def list_scripts(self, project_id: str, skip: int = 0, limit: int = 100) -> list[AutomationScriptResponse]: ...
    async def list_scripts_by_case(self, test_case_id: str) -> list[AutomationScriptResponse]: ...
    async def update_script(self, script_id: str, code: str) -> AutomationScriptResponse | None: ...
    async def delete_script(self, script_id: str) -> bool: ...
    async def review_script(self, script_id: str, status: str) -> AutomationScriptResponse | None: ...
    async def execute_script(self, script_id: str) -> ExecutionLog: ...
    async def get_execution_history(self, script_id: str) -> list[ExecutionLog]: ...
