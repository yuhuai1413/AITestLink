import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.test_case import TestCase
from app.schemas.test_case import TestCaseCreate, TestCaseUpdate
from app.utils import model_to_dict

router = APIRouter()


@router.get("/projects/{project_id}/test-cases")
async def list_test_cases(project_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(TestCase).where(TestCase.project_id == project_id)
    )
    return [model_to_dict(tc) for tc in result.scalars().all()]


@router.post("/projects/{project_id}/test-cases", status_code=201)
async def create_test_case(project_id: str, data: TestCaseCreate, db: AsyncSession = Depends(get_db)):
    tc = TestCase(
        id=str(uuid.uuid4()),
        project_id=project_id,
        test_point_id=data.testPointId,
        requirement_id=data.requirementId,
        case_code=data.caseCode,
        module=data.module,
        feature=data.feature,
        title=data.title,
        priority=data.priority,
        precondition=data.precondition,
        steps=data.steps,
        test_data=data.testData,
        expected_result=data.expectedResult,
        automation=data.automation,
        review_status=data.reviewStatus,
        remark=data.remark,
    )
    db.add(tc)
    await db.commit()
    await db.refresh(tc)
    return model_to_dict(tc)


@router.put("/test-cases/{tc_id}")
async def update_test_case(tc_id: str, data: TestCaseUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(TestCase).where(TestCase.id == tc_id))
    tc = result.scalar_one_or_none()
    if not tc:
        raise HTTPException(status_code=404, detail="Test case not found")

    update_data = data.model_dump(exclude_unset=True)
    field_map = {
        "title": "title", "priority": "priority", "precondition": "precondition",
        "steps": "steps", "testData": "test_data", "expectedResult": "expected_result",
        "automation": "automation", "reviewStatus": "review_status", "remark": "remark",
    }
    for schema_key, db_key in field_map.items():
        if schema_key in update_data:
            setattr(tc, db_key, update_data[schema_key])

    await db.commit()
    await db.refresh(tc)
    return model_to_dict(tc)


@router.delete("/test-cases/{tc_id}")
async def delete_test_case(tc_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(TestCase).where(TestCase.id == tc_id))
    tc = result.scalar_one_or_none()
    if not tc:
        raise HTTPException(status_code=404, detail="Test case not found")
    await db.delete(tc)
    await db.commit()
    return {"ok": True}
