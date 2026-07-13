from __future__ import annotations

from sqlalchemy import select, func

from app.models.project import Project
from app.models.test_case import TestCase
from app.services.base import BaseService
from app.contracts.project import ProjectCreate, ProjectUpdate


class ProjectService(BaseService):
    """项目管理服务"""

    async def create(self, data: ProjectCreate, user_id: str) -> dict:
        # 检查重名
        existing = await self.db.execute(
            select(Project).where(
                Project.user_id == user_id,
                Project.name == data.name,
                Project.test_type == data.test_type,
            )
        )
        if existing.scalar_one_or_none():
            from fastapi import HTTPException
            raise HTTPException(
                status_code=409,
                detail=f"项目「{data.name}」已存在同类型「{data.test_type}」的记录，请勿重复创建"
            )

        project = Project(
            user_id=user_id,
            name=data.name,
            test_type=data.test_type,
            test_status=data.test_status,
            doc_status=data.doc_status,
            priority=data.priority,
            description=data.description,
        )
        self.db.add(project)
        await self.db.commit()
        await self.db.refresh(project)
        return self._to_dict(project)

    async def list_by_user(self, user_id: str, skip: int = 0, limit: int = 100) -> list[dict]:
        count_subq = (
            select(TestCase.project_id, func.count(TestCase.id).label("case_count"))
            .group_by(TestCase.project_id)
            .subquery()
        )
        result = await self.db.execute(
            select(Project, func.coalesce(count_subq.c.case_count, 0).label("case_count"))
            .outerjoin(count_subq, Project.id == count_subq.c.project_id)
            .where(Project.user_id == user_id)
            .order_by(Project.updated_at.desc())
        )
        rows = result.all()
        response = []
        for project, case_count in rows:
            d = self._to_dict(project)
            d["caseCount"] = case_count
            response.append(d)
        return response

    async def get_by_id(self, project_id: str, user_id: str) -> dict | None:
        result = await self.db.execute(
            select(Project).where(Project.id == project_id, Project.user_id == user_id)
        )
        project = result.scalar_one_or_none()
        if not project:
            return None

        count_result = await self.db.execute(
            select(func.count(TestCase.id)).where(TestCase.project_id == project.id)
        )
        case_count = count_result.scalar() or 0

        d = self._to_dict(project)
        d["caseCount"] = case_count
        return d

    async def update(self, project_id: str, data: ProjectUpdate, user_id: str) -> dict | None:
        result = await self.db.execute(
            select(Project).where(Project.id == project_id, Project.user_id == user_id)
        )
        project = result.scalar_one_or_none()
        if not project:
            return None

        update_data = data.model_dump(exclude_unset=True, by_alias=True)
        field_map = {
            "name": "name",
            "testType": "test_type",
            "testStatus": "test_status",
            "docStatus": "doc_status",
            "priority": "priority",
            "description": "description",
        }
        for schema_key, db_key in field_map.items():
            if schema_key in update_data:
                setattr(project, db_key, update_data[schema_key])

        project.updated_at = self._now()
        await self.db.commit()
        await self.db.refresh(project)
        return self._to_dict(project)

    async def delete(self, project_id: str, user_id: str) -> bool:
        result = await self.db.execute(
            select(Project).where(Project.id == project_id, Project.user_id == user_id)
        )
        project = result.scalar_one_or_none()
        if not project:
            return False

        if project.test_status == "测试中":
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail="项目正在测试中，无法删除")

        await self.db.delete(project)
        await self.db.commit()
        return True
