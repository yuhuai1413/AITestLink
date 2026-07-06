from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.requirement import Requirement
from app.routers.auth import get_current_user
from app.schemas.requirement import RequirementUpdate
from app.utils import model_to_dict

router = APIRouter()


@router.get("/projects/{project_id}/requirements")
async def list_requirements(
    project_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Requirement).where(Requirement.project_id == project_id)
    )
    return [model_to_dict(r) for r in result.scalars().all()]


@router.put("/requirements/{req_id}")
async def update_requirement(
    req_id: str,
    data: RequirementUpdate,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Requirement).where(Requirement.id == req_id))
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="Requirement not found")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(req, key, value)

    await db.commit()
    await db.refresh(req)
    return model_to_dict(req)


@router.delete("/requirements/{req_id}")
async def delete_requirement(
    req_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Requirement).where(Requirement.id == req_id))
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="Requirement not found")
    await db.delete(req)
    await db.commit()
    return {"ok": True}
