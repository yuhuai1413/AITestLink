"""Tests for Pydantic schemas."""
import pytest
from pydantic import ValidationError

from app.schemas.project import ProjectCreate, ProjectUpdate
from app.schemas.requirement import RequirementUpdate
from app.schemas.test_point import TestPointCreate, TestPointUpdate
from app.schemas.test_case import TestCaseCreate, TestCaseUpdate


class TestProjectCreate:
    def test_valid_creation(self):
        data = ProjectCreate(name="测试项目", testType="功能测试")
        assert data.name == "测试项目"
        assert data.test_status == "待测试"  # default
        assert data.doc_status == "待解析"  # default
        assert data.priority == "中"  # default
        assert data.description == ""  # default

    def test_full_fields(self):
        data = ProjectCreate(
            name="完整项目", testType="性能测试",
            testStatus="执行中", docStatus="已完成",
            description="完整描述", priority="高"
        )
        assert data.test_status == "执行中"
        assert data.doc_status == "已完成"
        assert data.priority == "高"

    def test_missing_required_name(self):
        with pytest.raises(ValidationError):
            ProjectCreate(testType="功能测试")

    def test_missing_required_test_type(self):
        with pytest.raises(ValidationError):
            ProjectCreate(name="项目")

    def test_empty_name_allowed(self):
        """Empty string is valid for str fields (not None)."""
        data = ProjectCreate(name="", testType="功能测试")
        assert data.name == ""


class TestProjectUpdate:
    def test_partial_update(self):
        data = ProjectUpdate(name="新名称")
        dumped = data.model_dump(exclude_unset=True)
        assert "name" in dumped
        assert "testType" not in dumped

    def test_all_none_by_default(self):
        data = ProjectUpdate()
        dumped = data.model_dump(exclude_unset=True)
        assert len(dumped) == 0

    def test_multiple_fields(self):
        data = ProjectUpdate(name="更新", testStatus="已完成", priority="低")
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

    def test_update_clarification_fields(self):
        data = RequirementUpdate(clarificationStatus="已确认", clarificationAnswer="确认结论")
        assert data.clarificationStatus == "已确认"
        assert data.clarificationAnswer == "确认结论"

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
        data = TestPointUpdate(review_status="已评审")
        assert data.review_status == "已评审"


class TestTestCaseCreate:
    def test_valid_creation(self):
        data = TestCaseCreate(
            case_code="TC_001", module="用户管理", title="测试登录"
        )
        assert data.case_code == "TC_001"
        assert data.priority == "P1"
        assert data.automation == "待评估"
        assert data.review_status == "待评审"
        assert data.test_point_id is None
        assert data.requirement_id is None

    def test_missing_required_fields(self):
        with pytest.raises(ValidationError):
            TestCaseCreate(module="M", title="T")  # missing case_code

    def test_with_references(self):
        data = TestCaseCreate(
            case_code="TC_001", module="M", title="T",
            test_point_id="tp-001", requirement_id="req-001"
        )
        assert data.test_point_id == "tp-001"
        assert data.requirement_id == "req-001"


class TestTestCaseUpdate:
    def test_partial_update(self):
        data = TestCaseUpdate(title="新标题", priority="P0")
        dumped = data.model_dump(exclude_unset=True)
        assert len(dumped) == 2

    def test_empty_update(self):
        data = TestCaseUpdate()
        dumped = data.model_dump(exclude_unset=True)
        assert len(dumped) == 0
