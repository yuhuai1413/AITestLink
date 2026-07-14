from __future__ import annotations

from typing import Protocol, runtime_checkable

from pydantic import BaseModel, Field


# ── AI Service DTOs ──────────────────────────────────────────────────

class AIConfig(BaseModel):
    """AI 调用配置"""
    api_key: str = Field(alias="apiKey")
    endpoint: str
    model: str

    model_config = {"populate_by_name": True}


class RequirementParseResult(BaseModel):
    """需求解析结果"""
    module: str
    feature: str
    source: str = ""
    risk: str = "中"
    rule: str = ""
    question: str = ""


class TestPointGenerateResult(BaseModel):
    """测试点生成结果"""
    module: str
    type: str
    title: str
    description: str
    priority: str = "P1"
    automatable: bool = False


class TestCaseGenerateResult(BaseModel):
    """测试用例生成结果"""
    module: str
    feature: str = ""
    title: str
    priority: str = "P1"
    precondition: str = ""
    steps: str
    test_data: str = Field(default="", alias="testData")
    expected_result: str = Field(alias="expectedResult")
    test_type: str = Field(default="功能测试", alias="testType")
    automation: str = "待评估"

    model_config = {"populate_by_name": True}


class ScriptGenerateResult(BaseModel):
    """脚本生成结果"""
    test_case_id: str = Field(alias="testCaseId")
    script_type: str = Field(default="UI", alias="scriptType")
    framework: str = "Playwright"
    language: str = "Python"
    code: str
    description: str = ""

    model_config = {"populate_by_name": True}


# ── Service Protocol ─────────────────────────────────────────────────

@runtime_checkable
class IAIService(Protocol):
    async def call_llm(self, user_prompt: str, task_type: str, user_id: str, max_tokens: int = 16000, system_prompt_override: str = "") -> str: ...
    def parse_json_response(self, text: str) -> list | dict: ...
    async def parse_requirements(self, file_content: str, user_id: str = "") -> list[dict]: ...
    async def generate_test_points(self, requirements_text: str, user_id: str = "") -> list[dict]: ...
    async def generate_test_cases(self, test_points_text: str, user_id: str = "") -> list[dict]: ...
    async def generate_automation_scripts(self, test_cases_text: str, user_id: str = "") -> list[dict]: ...
    async def analyze_script_execution(self, scripts_text: str, execution_results: str, user_id: str = "") -> dict: ...
    async def generate_test_documents(self, project_info: str, requirements_text: str, test_points_text: str, test_cases_text: str, user_id: str = "") -> dict: ...
    async def generate_doc_by_template(self, template_prompt: str, project_info: str, requirements_text: str, test_points_text: str, test_cases_text: str, user_id: str = "") -> dict: ...
