"""Tests for SQLAlchemy database models."""
import uuid
from datetime import datetime

import pytest
from sqlalchemy import select

from app.models.project import Project
from app.models.requirement import Requirement
from app.models.test_point import TestPoint
from app.models.test_case import TestCase
from app.models.file_asset import FileAsset
from app.models.ai_task import AITask


class TestProjectModel:
    def test_create_project(self, db):
        project = Project(
            name="测试项目", owner="张三", test_type="功能测试"
        )
        db.add(project)
        db.commit()
        db.refresh(project)

        assert project.id is not None
        assert len(project.id) == 36  # UUID format
        assert project.name == "测试项目"
        assert project.version == "V0.1"  # default
        assert project.status == "设计中"  # default
        assert project.description == ""  # default
        assert project.case_count == 0  # default
        assert project.pass_rate == 0  # default
        assert project.risk_level == "中"  # default
        assert project.created_at is not None
        assert project.updated_at is not None

    def test_project_with_custom_id(self, db):
        project = Project(
            id="custom-id-001",
            name="自定义ID项目", owner="李四", test_type="性能测试"
        )
        db.add(project)
        db.commit()
        db.refresh(project)
        assert project.id == "custom-id-001"


class TestRequirementModel:
    def test_create_requirement(self, db, sample_project):
        req = Requirement(
            project_id=sample_project.id,
            module="用户管理", feature="登录功能"
        )
        db.add(req)
        db.commit()
        db.refresh(req)

        assert req.id is not None
        assert req.project_id == sample_project.id
        assert req.module == "用户管理"
        assert req.feature == "登录功能"
        assert req.source == ""  # default
        assert req.risk == "中"  # default
        assert req.confirmed is False  # default

    def test_requirement_cascade_delete(self, db, sample_project, sample_requirement):
        """Deleting project should cascade delete requirements."""
        project_id = sample_project.id
        db.delete(sample_project)
        db.commit()

        result = db.execute(
            select(Requirement).where(Requirement.project_id == project_id)
        )
        assert result.scalars().all() == []


class TestTestPointModel:
    def test_create_test_point(self, db, sample_project):
        tp = TestPoint(
            project_id=sample_project.id,
            module="用户管理", type="正常流程", title="测试登录"
        )
        db.add(tp)
        db.commit()
        db.refresh(tp)

        assert tp.id is not None
        assert tp.priority == "P1"  # default
        assert tp.automatable is False  # default
        assert tp.review_status == "待评审"  # default
        assert tp.requirement_id is None  # nullable

    def test_test_point_set_null_on_requirement_delete(
        self, db, sample_project, sample_requirement
    ):
        """Deleting requirement should set test_point.requirement_id to NULL."""
        tp = TestPoint(
            project_id=sample_project.id,
            requirement_id=sample_requirement.id,
            module="M", type="正常流程", title="T"
        )
        db.add(tp)
        db.commit()

        db.delete(sample_requirement)
        db.commit()

        result = db.execute(select(TestPoint).where(TestPoint.id == tp.id))
        updated_tp = result.scalar_one()
        assert updated_tp.requirement_id is None


class TestTestCaseModel:
    def test_create_test_case(self, db, sample_project):
        tc = TestCase(
            project_id=sample_project.id,
            case_code="TC_001", module="M", title="T"
        )
        db.add(tc)
        db.commit()
        db.refresh(tc)

        assert tc.id is not None
        assert tc.case_code == "TC_001"
        assert tc.feature == ""  # default
        assert tc.priority == "P1"  # default
        assert tc.automation == "待评估"  # default
        assert tc.review_status == "待评审"  # default
        assert tc.test_point_id is None
        assert tc.requirement_id is None

    def test_test_case_cascade_delete(self, db, sample_project, sample_test_case):
        """Deleting project should cascade delete test cases."""
        project_id = sample_project.id
        db.delete(sample_project)
        db.commit()

        result = db.execute(
            select(TestCase).where(TestCase.project_id == project_id)
        )
        assert result.scalars().all() == []


class TestFileAssetModel:
    def test_create_file_asset(self, db, sample_project):
        fa = FileAsset(
            project_id=sample_project.id,
            name="需求文档.pdf", file_type="需求文档", size="12 KB"
        )
        db.add(fa)
        db.commit()
        db.refresh(fa)

        assert fa.id is not None
        assert fa.parse_status == "待解析"  # default
        assert fa.uploaded_at is not None


class TestAITaskModel:
    def test_create_ai_task(self, db, sample_project):
        task = AITask(
            project_id=sample_project.id,
            type="需求解析", model_name="gpt-4"
        )
        db.add(task)
        db.commit()
        db.refresh(task)

        assert task.id is not None
        assert task.status == "等待"  # default
        assert task.error_message is None  # nullable
        assert task.finished_at is None  # nullable

    def test_ai_task_cascade_delete(self, db, sample_project):
        """Deleting project should cascade delete AI tasks."""
        task = AITask(
            project_id=sample_project.id,
            type="需求解析", status="成功"
        )
        db.add(task)
        db.commit()

        db.delete(sample_project)
        db.commit()

        result = db.execute(
            select(AITask).where(AITask.project_id == sample_project.id)
        )
        assert result.scalars().all() == []


class TestCascadeDeletes:
    """Test that deleting a project cascades to all child entities."""

    def test_full_cascade_delete(
        self, db, sample_project, sample_requirement, sample_test_point, sample_test_case
    ):
        """Deleting a project should remove all related entities."""
        project_id = sample_project.id

        # Verify entities exist
        assert db.execute(
            select(Requirement).where(Requirement.project_id == project_id)
        ).scalars().all()
        assert db.execute(
            select(TestPoint).where(TestPoint.project_id == project_id)
        ).scalars().all()
        assert db.execute(
            select(TestCase).where(TestCase.project_id == project_id)
        ).scalars().all()

        # Delete project
        db.delete(sample_project)
        db.commit()

        # Verify all entities are gone
        assert db.execute(
            select(Requirement).where(Requirement.project_id == project_id)
        ).scalars().all() == []
        assert db.execute(
            select(TestPoint).where(TestPoint.project_id == project_id)
        ).scalars().all() == []
        assert db.execute(
            select(TestCase).where(TestCase.project_id == project_id)
        ).scalars().all() == []
