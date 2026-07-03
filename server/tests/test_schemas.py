"""Tests for Pydantic schemas."""
import pytest
from pydantic import ValidationError

from app.schemas.project import ProjectCreate, ProjectUpdate, ProjectResponse
from app.schemas.requirement import RequirementUpdate, RequirementResponse
from app.schemas.test_point import TestPointCreate, TestPointUpdate, TestPointResponse
from app.schemas.test_case import TestCaseCreate, TestCaseUpdate, TestCaseResponse
from app.schemas.ai_task import AITaskResponse
from app.schemas.file_asset import FileAssetResponse


class TestProjectCreate:
    def test_valid_creation(self):
        data = ProjectCreate(name="测试项目", owner="张三", testType="功能测试")
        assert data.name == "测试项目"
        assert data.version == "V0.1"  # default
        assert data.status == "设计中"  # default
        assert data.riskLevel == "中"  # default
        assert data.description == ""  # default

    def test_full_fields(self):
        data = ProjectCreate(
            name="完整项目", version="V2.0", owner="李四",
            testType="性能测试", status="执行中",
            description="完整描述", riskLevel="高"
        )
        assert data.version == "V2.0"
        assert data.status == "执行中"
        assert data.riskLevel == "高"

    def test_missing_required_name(self):
        with pytest.raises(ValidationError):
            ProjectCreate(owner="张三", testType="功能测试")

    def test_missing_required_owner(self):
        with pytest.raises(ValidationError):
            ProjectCreate(name="项目", testType="功能测试")

    def test_missing_required_test_type(self):
        with pytest.raises(ValidationError):
            ProjectCreate(name="项目", owner="张三")

    def test_empty_name_allowed(self):
        """Empty string is valid for str fields (not None)."""
        data = ProjectCreate(name="", owner="张三", testType="功能测试")
        assert data.name == ""


class TestProjectUpdate:
    def test_partial_update(self):
        data = ProjectUpdate(name="新名称")
        dumped = data.model_dump(exclude_unset=True)
        assert "name" in dumped
        assert "version" not in dumped

    def test_all_none_by_default(self):
        data = ProjectUpdate()
        dumped = data.model_dump(exclude_unset=True)
        assert len(dumped) == 0

    def test_multiple_fields(self):
        data = ProjectUpdate(name="更新", status="已完成", riskLevel="低")
        dumped = data.model_dump(exclude_unset=True)
        assert len(dumped) == 3


class TestRequirementUpdate:
    def test_update_confirmed(self):
        data = RequirementUpdate(confirmed=True)
        assert data.confirmed is True

    def test_update_rule_and_question(self):
        data = RequirementUpdate(rule="新规则", question="新问题")
        assert data.rule == "新规则"
        assert data.question == "新问题"

    def test_partial_update(self):
        data = RequirementUpdate(confirmed=True)
        dumped = data.model_dump(exclude_unset=True)
        assert "confirmed" in dumped
        assert "rule" not in dumped


class TestTestPointCreate:
    def test_valid_creation(self):
        data = TestPointCreate(
            module="用户管理", type="正常流程", title="测试登录"
        )
        assert data.module == "用户管理"
        assert data.type == "正常流程"
        assert data.priority == "P1"  # default
        assert data.automatable is False  # default

    def test_missing_required_fields(self):
        with pytest.raises(ValidationError):
            TestPointCreate(module="用户管理")

    def test_all_types_accepted(self):
        """All 6 test point types should be accepted as strings."""
        for tp_type in ["正常流程", "异常流程", "边界值", "权限控制", "数据一致性", "状态流转"]:
            data = TestPointCreate(module="M", type=tp_type, title="T")
            assert data.type == tp_type


class TestTestPointUpdate:
    def test_partial_update(self):
        data = TestPointUpdate(priority="P0")
        dumped = data.model_dump(exclude_unset=True)
        assert "priority" in dumped
        assert "title" not in dumped

    def test_update_review_status(self):
        data = TestPointUpdate(reviewStatus="已评审")
        assert data.reviewStatus == "已评审"


class TestTestCaseCreate:
    def test_valid_creation(self):
        data = TestCaseCreate(
            caseCode="TC_001", module="用户管理", title="测试登录"
        )
        assert data.caseCode == "TC_001"
        assert data.priority == "P1"
        assert data.automation == "待评估"
        assert data.reviewStatus == "待评审"
        assert data.testPointId is None
        assert data.requirementId is None

    def test_missing_required_fields(self):
        with pytest.raises(ValidationError):
            TestCaseCreate(module="M", title="T")  # missing caseCode

    def test_with_references(self):
        data = TestCaseCreate(
            caseCode="TC_001", module="M", title="T",
            testPointId="tp-001", requirementId="req-001"
        )
        assert data.testPointId == "tp-001"
        assert data.requirementId == "req-001"


class TestTestCaseUpdate:
    def test_partial_update(self):
        data = TestCaseUpdate(title="新标题", priority="P0")
        dumped = data.model_dump(exclude_unset=True)
        assert len(dumped) == 2

    def test_empty_update(self):
        data = TestCaseUpdate()
        dumped = data.model_dump(exclude_unset=True)
        assert len(dumped) == 0


class TestAITaskResponse:
    def test_response_fields(self):
        data = AITaskResponse(
            id="task-001", projectId="proj-001", type="需求解析",
            status="执行中", modelName="gpt-4",
            errorMessage=None, createdAt="2025-01-01T00:00:00",
            finishedAt=None
        )
        assert data.id == "task-001"
        assert data.status == "执行中"
        assert data.finishedAt is None


class TestFileAssetResponse:
    def test_response_fields(self):
        data = FileAssetResponse(
            id="file-001", projectId="proj-001", name="doc.pdf",
            fileType="需求文档", size="12 KB", parseStatus="待解析",
            uploadedAt="2025-01-01T00:00:00"
        )
        assert data.fileType == "需求文档"
        assert data.parseStatus == "待解析"
