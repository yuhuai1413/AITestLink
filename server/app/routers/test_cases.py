import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.test_case import TestCase
from app.routers.auth import get_current_user
from app.schemas.test_case import TestCaseCreate, TestCaseUpdate
from app.utils import model_to_dict
from app.utils import verify_project_owner

router = APIRouter()


@router.get("/projects/{project_id}/test-cases")
async def list_test_cases(
    project_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await verify_project_owner(db, project_id, user["sub"])
    result = await db.execute(
        select(TestCase).where(TestCase.project_id == project_id)
    )
    return [model_to_dict(tc) for tc in result.scalars().all()]


@router.post("/projects/{project_id}/test-cases", status_code=201)
async def create_test_case(
    project_id: str,
    data: TestCaseCreate,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await verify_project_owner(db, project_id, user["sub"])
    tc = TestCase(
        id=str(uuid.uuid4()),
        project_id=project_id,
        test_point_id=data.test_point_id,
        requirement_id=data.requirement_id,
        case_code=data.case_code,
        module=data.module,
        feature=data.feature,
        title=data.title,
        priority=data.priority,
        precondition=data.precondition,
        steps=data.steps,
        test_data=data.test_data,
        expected_result=data.expected_result,
        automation=data.automation,
        review_status=data.review_status,
        remark=data.remark,
    )
    db.add(tc)
    await db.commit()
    await db.refresh(tc)
    return model_to_dict(tc)


@router.put("/test-cases/{tc_id}")
async def update_test_case(
    tc_id: str,
    data: TestCaseUpdate,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(TestCase).where(TestCase.id == tc_id))
    tc = result.scalar_one_or_none()
    if not tc:
        raise HTTPException(status_code=404, detail="Test case not found")

    await verify_project_owner(db, tc.project_id, user["sub"])

    update_data = data.model_dump(exclude_unset=True)
    field_map = {
        "title": "title",
        "priority": "priority",
        "precondition": "precondition",
        "steps": "steps",
        "test_data": "test_data",
        "expected_result": "expected_result",
        "automation": "automation",
        "review_status": "review_status",
        "remark": "remark",
    }
    for schema_key, db_key in field_map.items():
        if schema_key in update_data:
            setattr(tc, db_key, update_data[schema_key])

    await db.commit()
    await db.refresh(tc)
    return model_to_dict(tc)


@router.delete("/test-cases/{tc_id}")
async def delete_test_case(
    tc_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(TestCase).where(TestCase.id == tc_id))
    tc = result.scalar_one_or_none()
    if not tc:
        raise HTTPException(status_code=404, detail="Test case not found")

    await verify_project_owner(db, tc.project_id, user["sub"])

    await db.delete(tc)
    await db.commit()
    return {"ok": True}
