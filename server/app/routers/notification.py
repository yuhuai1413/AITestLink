import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select, update, func

from app.database import async_session
from app.models.notification import Notification
from app.routers.deps import get_current_user
from app.utils import model_to_dict

router = APIRouter()


class NotificationCreate(BaseModel):
    type: str
    taskType: str
    projectId: str
    projectName: str = ""
    message: str = ""
    targetPath: str = ""


class NotificationUpdate(BaseModel):
    read: bool | None = None


# ── 列表 ──

@router.get("/notifications")
async def list_notifications(user: dict = Depends(get_current_user)):
    async with async_session() as db:
        result = await db.execute(
            select(Notification)
            .where(Notification.user_id == user["sub"])
            .order_by(Notification.created_at.desc())
            .limit(100)
        )
        return [model_to_dict(n) for n in result.scalars().all()]


# ── 未读数 ──

@router.get("/notifications/unread-count")
async def unread_count(user: dict = Depends(get_current_user)):
    async with async_session() as db:
        result = await db.execute(
            select(func.count(Notification.id))
            .where(Notification.user_id == user["sub"], Notification.read == False)
        )
        return {"count": result.scalar() or 0}


# ── 创建 ──

@router.post("/notifications", status_code=201)
async def create_notification(data: NotificationCreate, user: dict = Depends(get_current_user)):
    async with async_session() as db:
        n = Notification(
            id=str(uuid.uuid4()),
            user_id=user["sub"],
            type=data.type,
            task_type=data.taskType,
            project_id=data.projectId,
            project_name=data.projectName,
            message=data.message,
            target_path=data.targetPath,
        )
        db.add(n)
        await db.commit()
        await db.refresh(n)
        return model_to_dict(n)


# ── 标记已读 ──

@router.put("/notifications/{notification_id}/read")
async def mark_read(notification_id: str, user: dict = Depends(get_current_user)):
    async with async_session() as db:
        await db.execute(
            update(Notification)
            .where(Notification.id == notification_id, Notification.user_id == user["sub"])
            .values(read=True)
        )
        await db.commit()
        return {"ok": True}


# ── 全部已读 ──

@router.put("/notifications/read-all")
async def mark_all_read(user: dict = Depends(get_current_user)):
    async with async_session() as db:
        await db.execute(
            update(Notification)
            .where(Notification.user_id == user["sub"], Notification.read == False)
            .values(read=True)
        )
        await db.commit()
        return {"ok": True}


# ── 清空 ──

@router.delete("/notifications")
async def clear_notifications(user: dict = Depends(get_current_user)):
    async with async_session() as db:
        from sqlalchemy import delete
        await db.execute(
            delete(Notification).where(Notification.user_id == user["sub"])
        )
        await db.commit()
        return {"ok": True}
