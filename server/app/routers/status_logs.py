from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.status_log import StatusLog
from app.routers.auth import get_current_user
from app.utils import model_to_dict, verify_project_owner

router = APIRouter()


@router.get("/projects/{project_id}/status-logs")
async def list_status_logs(
    project_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取项目状态变更日志"""
    await verify_project_owner(db, project_id, user["sub"])
    result = await db.execute(
        select(StatusLog)
        .where(StatusLog.project_id == project_id)
        .order_by(StatusLog.created_at.desc())
    )
    return [model_to_dict(log) for log in result.scalars().all()]


@router.post("/projects/{project_id}/status-logs")
async def create_status_log(
    project_id: str,
    field_name: str,
    old_value: str | None,
    new_value: str,
    change_type: str,
    reason: str | None,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """创建状态变更日志（供内部调用）"""
    await verify_project_owner(db, project_id, user["sub"])
    
    log = StatusLog(
        project_id=project_id,
        user_id=user["sub"],
        field_name=field_name,
        old_value=old_value,
        new_value=new_value,
        change_type=change_type,
        reason=reason,
    )
    db.add(log)
    await db.commit()
    return model_to_dict(log)
