from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.project import Project
from app.models.test_case import TestCase
from app.schemas.project import ProjectCreate, ProjectUpdate, ProjectResponse
from app.utils import model_to_dict

router = APIRouter()


@router.get("")
async def list_projects(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Project).order_by(Project.updated_at.desc()))
    projects = result.scalars().all()

    response = []
    for p in projects:
        # Count test cases
        count_result = await db.execute(
            select(func.count(TestCase.id)).where(TestCase.project_id == p.id)
        )
        case_count = count_result.scalar() or 0

        d = model_to_dict(p)
        d["caseCount"] = case_count
        response.append(d)

    return response


@router.post("", status_code=201)
async def create_project(data: ProjectCreate, db: AsyncSession = Depends(get_db)):
    project = Project(
        name=data.name,
        version=data.version,
        owner=data.owner,
        test_type=data.testType,
        status=data.status,
        description=data.description,
        risk_level=data.riskLevel,
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return model_to_dict(project)


@router.get("/{project_id}")
async def get_project(project_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    count_result = await db.execute(
        select(func.count(TestCase.id)).where(TestCase.project_id == project.id)
    )
    case_count = count_result.scalar() or 0

    d = model_to_dict(project)
    d["caseCount"] = case_count
    return d


@router.put("/{project_id}")
async def update_project(project_id: str, data: ProjectUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    update_data = data.model_dump(exclude_unset=True)
    field_map = {
        "name": "name", "version": "version", "owner": "owner",
        "testType": "test_type", "status": "status",
        "description": "description", "riskLevel": "risk_level",
    }
    for schema_key, db_key in field_map.items():
        if schema_key in update_data:
            setattr(project, db_key, update_data[schema_key])

    project.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(project)
    return model_to_dict(project)


@router.delete("/{project_id}")
async def delete_project(project_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    await db.delete(project)
    await db.commit()
    return {"ok": True}
