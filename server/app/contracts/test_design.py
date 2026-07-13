from __future__ import annotations

from datetime import datetime
from typing import Protocol, runtime_checkable

from pydantic import BaseModel, Field


# ── Test Point DTOs ──────────────────────────────────────────────────

class TestPointCreate(BaseModel):
    module: str
    type: str
    title: str
    description: str = ""
    priority: str = "P1"
    automatable: bool = False


class TestPointUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    priority: str | None = None
    review_status: str | None = Field(default=None, alias="reviewStatus")

    model_config = {"populate_by_name": True}


class TestPointResponse(BaseModel):
    id: str
    project_id: str = Field(alias="projectId")
    requirement_id: str | None = Field(default=None, alias="requirementId")
    module: str
    type: str
    title: str
    description: str
    priority: str
    automatable: bool
    review_status: str = Field(alias="reviewStatus")
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True, "populate_by_name": True}


class GeneratedTestPoint(BaseModel):
    """AI 生成的测试点"""
    module: str
    type: str
    title: str
    description: str
    priority: str = "P1"
    automatable: bool = False


# ── Test Case DTOs ───────────────────────────────────────────────────

class TestCaseCreate(BaseModel):
    case_code: str = Field(alias="caseCode")
    module: str
    feature: str = ""
    title: str
    priority: str = "P1"
    precondition: str = ""
    steps: str = ""
    test_data: str = Field(default="", alias="testData")
    expected_result: str = Field(default="", alias="expectedResult")
    test_type: str = Field(default="功能测试", alias="testType")
    automation: str = "待评估"
    review_status: str = Field(default="待评审", alias="reviewStatus")
    remark: str = ""
    test_point_id: str | None = Field(default=None, alias="testPointId")
    requirement_id: str | None = Field(default=None, alias="requirementId")

    model_config = {"populate_by_name": True}


class TestCaseUpdate(BaseModel):
    title: str | None = None
    priority: str | None = None
    precondition: str | None = None
    steps: str | None = None
    test_data: str | None = Field(default=None, alias="testData")
    expected_result: str | None = Field(default=None, alias="expectedResult")
    test_type: str | None = Field(default=None, alias="testType")
    automation: str | None = None
    review_status: str | None = Field(default=None, alias="reviewStatus")
    actual_result: str | None = Field(default=None, alias="actualResult")
    passed: str | None = None
    tester: str | None = None
    test_date: str | None = Field(default=None, alias="testDate")
    remark: str | None = None

    model_config = {"populate_by_name": True}


class TestCaseResponse(BaseModel):
    id: str
    project_id: str = Field(alias="projectId")
    test_point_id: str | None = Field(default=None, alias="testPointId")
    requirement_id: str | None = Field(default=None, alias="requirementId")
    case_code: str = Field(alias="caseCode")
    module: str
    feature: str
    title: str
    priority: str
    precondition: str
    steps: str
    test_data: str = Field(alias="testData")
    expected_result: str = Field(alias="expectedResult")
    test_type: str = Field(alias="testType")
    actual_result: str = Field(alias="actualResult")
    passed: str
    automation: str
    review_status: str = Field(alias="reviewStatus")
    remark: str
    tester: str
    test_date: str = Field(alias="testDate")
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True, "populate_by_name": True}


class GeneratedTestCase(BaseModel):
    """AI 生成的测试用例"""
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


# ── Coverage DTOs ────────────────────────────────────────────────────

class TestCoverage(BaseModel):
    total_requirements: int = Field(alias="totalRequirements")
    covered_requirements: int = Field(alias="coveredRequirements")
    total_test_points: int = Field(alias="totalTestPoints")
    total_test_cases: int = Field(alias="totalTestCases")
    by_type: dict[str, int] = Field(default_factory=dict, alias="byType")
    by_priority: dict[str, int] = Field(default_factory=dict, alias="byPriority")
    automation_rate: float = Field(default=0.0, alias="automationRate")

    model_config = {"populate_by_name": True}


# ── Service Protocol ─────────────────────────────────────────────────

@runtime_checkable
class ITestDesignService(Protocol):
    # Test Points
    async def generate_test_points(self, project_id: str, requirement_ids: list[str], user_id: str) -> list[TestPointResponse]: ...
    async def get_test_point(self, point_id: str) -> TestPointResponse | None: ...
    async def list_test_points(self, project_id: str, skip: int = 0, limit: int = 100) -> list[TestPointResponse]: ...
    async def list_test_points_by_requirement(self, requirement_id: str) -> list[TestPointResponse]: ...
    async def update_test_point(self, point_id: str, data: TestPointUpdate) -> TestPointResponse | None: ...
    async def delete_test_point(self, point_id: str) -> bool: ...
    async def batch_update_review(self, point_ids: list[str], status: str) -> int: ...

    # Test Cases
    async def generate_test_cases(self, project_id: str, test_point_ids: list[str], user_id: str) -> list[TestCaseResponse]: ...
    async def get_test_case(self, case_id: str) -> TestCaseResponse | None: ...
    async def list_test_cases(self, project_id: str, skip: int = 0, limit: int = 100) -> list[TestCaseResponse]: ...
    async def list_test_cases_by_point(self, test_point_id: str) -> list[TestCaseResponse]: ...
    async def update_test_case(self, case_id: str, data: TestCaseUpdate) -> TestCaseResponse | None: ...
    async def delete_test_case(self, case_id: str) -> bool: ...
    async def batch_update_status(self, case_ids: list[str], status: str) -> int: ...
    async def batch_update_review(self, case_ids: list[str], status: str) -> int: ...

    # Coverage
    async def get_coverage(self, project_id: str) -> TestCoverage: ...

    # Review
    async def review_test_cases(self, project_id: str, case_ids: list[str], user_id: str) -> dict: ...
