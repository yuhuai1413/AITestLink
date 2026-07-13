from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project import Project
from app.utils import model_to_dict


class BaseService:
    """所有 Service 的基类，提供通用的 DB 操作和工具方法"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def _verify_project_owner(self, project_id: str, user_id: str) -> Project:
        """验证项目归属，返回项目对象"""
        result = await self.db.execute(
            select(Project).where(Project.id == project_id, Project.user_id == user_id)
        )
        project = result.scalar_one_or_none()
        if not project:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="项目不存在或无权访问")
        return project

    async def _get_project(self, project_id: str) -> Project | None:
        result = await self.db.execute(
            select(Project).where(Project.id == project_id)
        )
        return result.scalar_one_or_none()

    def _to_dict(self, obj) -> dict:
        """将 SQLAlchemy 模型转换为 dict"""
        return model_to_dict(obj)

    @staticmethod
    def _now() -> datetime:
        return datetime.now(timezone.utc)
