from __future__ import annotations

import uuid

from sqlalchemy import select

from app.models.status_log import StatusLog
from app.services.base import BaseService


class StatusLogService(BaseService):
    """状态变更日志服务"""

    async def log(
        self,
        project_id: str,
        user_id: str,
        field_name: str,
        old_value: str | None,
        new_value: str,
        change_type: str,
        reason: str | None = None,
    ) -> dict:
        log = StatusLog(
            id=str(uuid.uuid4()),
            project_id=project_id,
            user_id=user_id,
            field_name=field_name,
            old_value=old_value,
            new_value=new_value,
            change_type=change_type,
            reason=reason,
        )
        self.db.add(log)
        await self.db.commit()
        await self.db.refresh(log)
        return self._to_dict(log)

    async def list_by_project(self, project_id: str, skip: int = 0, limit: int = 100) -> list[dict]:
        result = await self.db.execute(
            select(StatusLog)
            .where(StatusLog.project_id == project_id)
            .order_by(StatusLog.created_at.desc())
            .offset(skip).limit(limit)
        )
        return [self._to_dict(l) for l in result.scalars().all()]

    async def list_by_user(self, user_id: str, skip: int = 0, limit: int = 100) -> list[dict]:
        result = await self.db.execute(
            select(StatusLog)
            .where(StatusLog.user_id == user_id)
            .order_by(StatusLog.created_at.desc())
            .offset(skip).limit(limit)
        )
        return [self._to_dict(l) for l in result.scalars().all()]
