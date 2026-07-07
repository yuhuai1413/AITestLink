import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.test_point import TestPoint
from app.routers.auth import get_current_user
from app.schemas.test_point import TestPointCreate, TestPointUpdate
from app.utils import model_to_dict
from app.utils import verify_project_owner

router = APIRouter()


@router.get("/projects/{project_id}/test-points")
async def list_test_points(
    project_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await verify_project_owner(db, project_id, user["sub"])
    result = await db.execute(
        select(TestPoint).where(TestPoint.project_id == project_id)
    )
    return [model_to_dict(tp) for tp in result.scalars().all()]


@router.post("/projects/{project_id}/test-points", status_code=201)
async def create_test_point(
    project_id: str,
    data: TestPointCreate,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await verify_project_owner(db, project_id, user["sub"])
    tp = TestPoint(
        id=str(uuid.uuid4()),
        project_id=project_id,
        module=data.module,
        type=data.type,
        title=data.title,
        description=data.description,
        priority=data.priority,
        automatable=data.automatable,
    )
    db.add(tp)
    await db.commit()
    await db.refresh(tp)
    return model_to_dict(tp)


@router.put("/test-points/{tp_id}")
async def update_test_point(
    tp_id: str,
    data: TestPointUpdate,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(TestPoint).where(TestPoint.id == tp_id))
    tp = result.scalar_one_or_none()
    if not tp:
        raise HTTPException(status_code=404, detail="Test point not found")

    await verify_project_owner(db, tp.project_id, user["sub"])

    update_data = data.model_dump(exclude_unset=True)
    field_map = {
        "title": "title",
        "description": "description",
        "priority": "priority",
        "review_status": "review_status",
    }
    for schema_key, db_key in field_map.items():
        if schema_key in update_data:
            setattr(tp, db_key, update_data[schema_key])

    await db.commit()
    await db.refresh(tp)
    return model_to_dict(tp)


@router.delete("/test-points/{tp_id}")
async def delete_test_point(
    tp_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(TestPoint).where(TestPoint.id == tp_id))
    tp = result.scalar_one_or_none()
    if not tp:
        raise HTTPException(status_code=404, detail="Test point not found")

    await verify_project_owner(db, tp.project_id, user["sub"])

    await db.delete(tp)
    await db.commit()
    return {"ok": True}
