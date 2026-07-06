from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.project import Project
from app.models.test_case import TestCase
from app.routers.auth import get_current_user
from app.schemas.project import ProjectCreate, ProjectUpdate
from app.utils import model_to_dict

router = APIRouter()


@router.get("")
async def list_projects(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Use subquery to avoid N+1
    count_subq = (
        select(TestCase.project_id, func.count(TestCase.id).label("case_count"))
        .group_by(TestCase.project_id)
        .subquery()
    )
    result = await db.execute(
        select(Project, func.coalesce(count_subq.c.case_count, 0).label("case_count"))
        .outerjoin(count_subq, Project.id == count_subq.c.project_id)
        .order_by(Project.updated_at.desc())
    )
    rows = result.all()

    response = []
    for project, case_count in rows:
        d = model_to_dict(project)
        d["caseCount"] = case_count
        response.append(d)

    return response


@router.post("", status_code=201)
async def create_project(
    data: ProjectCreate,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(
        select(Project).where(
            Project.name == data.name,
            Project.test_type == data.testType,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"项目「{data.name}」已存在同类型「{data.testType}」的记录，请勿重复创建")

    project = Project(
        name=data.name,
        test_type=data.testType,
        test_status=data.testStatus,
        doc_status=data.docStatus,
        priority=data.priority,
        description=data.description,
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return model_to_dict(project)


@router.get("/{project_id}")
async def get_project(
    project_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
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
async def update_project(
    project_id: str,
    data: ProjectUpdate,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    update_data = data.model_dump(exclude_unset=True)
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

    project.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(project)
    return model_to_dict(project)


@router.delete("/{project_id}")
async def delete_project(
    project_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if project.test_status == "测试中":
        raise HTTPException(status_code=400, detail="项目正在测试中，无法删除")

    await db.delete(project)
    await db.commit()
    return {"ok": True}
