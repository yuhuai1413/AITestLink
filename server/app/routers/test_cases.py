from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.routers.deps import get_current_user, get_test_design_service, get_project_service
from app.services.test_design_service import TestDesignService
from app.services.project_service import ProjectService
from app.schemas.test_case import TestCaseCreate, TestCaseUpdate

router = APIRouter()


class GenerateTestCasesRequest(BaseModel):
    test_point_ids: list[str]


class BatchStatusRequest(BaseModel):
    ids: list[str]
    status: str


@router.get("/projects/{project_id}/test-cases")
async def list_test_cases(
    project_id: str,
    user: dict = Depends(get_current_user),
    service: TestDesignService = Depends(get_test_design_service),
    project_service: ProjectService = Depends(get_project_service),
):
    await project_service._verify_project_owner(project_id, user["sub"])
    return await service.list_test_cases(project_id)


@router.post("/projects/{project_id}/test-cases", status_code=201)
async def create_test_case(
    project_id: str,
    data: TestCaseCreate,
    user: dict = Depends(get_current_user),
    service: TestDesignService = Depends(get_test_design_service),
    project_service: ProjectService = Depends(get_project_service),
):
    await project_service._verify_project_owner(project_id, user["sub"])
    # 直接创建单个测试用例
    from app.models.test_case import TestCase
    import uuid
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
    service.db.add(tc)
    await service.db.commit()
    await service.db.refresh(tc)
    return service._to_dict(tc)


@router.post("/projects/{project_id}/test-cases/generate")
async def generate_test_cases(
    project_id: str,
    data: GenerateTestCasesRequest,
    user: dict = Depends(get_current_user),
    service: TestDesignService = Depends(get_test_design_service),
    project_service: ProjectService = Depends(get_project_service),
):
    await project_service._verify_project_owner(project_id, user["sub"])
    return await service.generate_test_cases(project_id, data.test_point_ids, user["sub"])


@router.put("/test-cases/{tc_id}")
async def update_test_case(
    tc_id: str,
    data: TestCaseUpdate,
    user: dict = Depends(get_current_user),
    service: TestDesignService = Depends(get_test_design_service),
):
    tc = await service.update_test_case(tc_id, data)
    if not tc:
        raise HTTPException(status_code=404, detail="Test case not found")
    return tc


@router.delete("/test-cases/{tc_id}")
async def delete_test_case(
    tc_id: str,
    user: dict = Depends(get_current_user),
    service: TestDesignService = Depends(get_test_design_service),
):
    success = await service.delete_test_case(tc_id)
    if not success:
        raise HTTPException(status_code=404, detail="Test case not found")
    return {"ok": True}


@router.post("/test-cases/batch-status")
async def batch_update_status(
    data: BatchStatusRequest,
    user: dict = Depends(get_current_user),
    service: TestDesignService = Depends(get_test_design_service),
):
    count = await service.batch_update_status(data.ids, data.status)
    return {"ok": True, "updated": count}


@router.post("/test-cases/batch-review")
async def batch_review_test_cases(
    data: BatchStatusRequest,
    user: dict = Depends(get_current_user),
    service: TestDesignService = Depends(get_test_design_service),
):
    count = await service.batch_update_review(data.ids, data.status)
    return {"ok": True, "updated": count}


@router.get("/projects/{project_id}/coverage")
async def get_coverage(
    project_id: str,
    user: dict = Depends(get_current_user),
    service: TestDesignService = Depends(get_test_design_service),
):
    return await service.get_coverage(project_id)


class ReviewRequest(BaseModel):
    case_ids: list[str]


@router.post("/projects/{project_id}/test-cases/review")
async def review_test_cases(
    project_id: str,
    data: ReviewRequest,
    user: dict = Depends(get_current_user),
    service: TestDesignService = Depends(get_test_design_service),
):
    return await service.review_test_cases(project_id, data.case_ids, user["sub"])
