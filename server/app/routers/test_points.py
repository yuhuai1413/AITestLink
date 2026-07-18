from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.routers.deps import get_current_user, get_test_design_service, get_project_service
from app.services.test_design_service import TestDesignService
from app.services.project_service import ProjectService
from app.schemas.test_point import TestPointCreate, TestPointUpdate

router = APIRouter()


class GenerateTestPointsRequest(BaseModel):
    requirement_ids: list[str]


@router.get("/projects/{project_id}/test-points")
async def list_test_points(
    project_id: str,
    user: dict = Depends(get_current_user),
    service: TestDesignService = Depends(get_test_design_service),
    project_service: ProjectService = Depends(get_project_service),
):
    await project_service._verify_project_owner(project_id, user["sub"])
    return await service.list_test_points(project_id)


@router.post("/projects/{project_id}/test-points", status_code=201)
async def create_test_point(
    project_id: str,
    data: TestPointCreate,
    user: dict = Depends(get_current_user),
    service: TestDesignService = Depends(get_test_design_service),
    project_service: ProjectService = Depends(get_project_service),
):
    await project_service._verify_project_owner(project_id, user["sub"])
    # 直接创建单个测试点
    from app.models.test_point import TestPoint
    import uuid
    tp = TestPoint(
        id=str(uuid.uuid4()),
        point_code=await service._generate_point_code(project_id, data.module),
        project_id=project_id,
        module=data.module,
        type=data.type,
        title=data.title,
        description=data.description,
        priority=data.priority,
        automatable=data.automatable,
    )
    service.db.add(tp)
    await service.db.commit()
    await service.db.refresh(tp)
    return service._to_dict(tp)


@router.post("/projects/{project_id}/test-points/generate")
async def generate_test_points(
    project_id: str,
    data: GenerateTestPointsRequest,
    user: dict = Depends(get_current_user),
    service: TestDesignService = Depends(get_test_design_service),
    project_service: ProjectService = Depends(get_project_service),
):
    await project_service._verify_project_owner(project_id, user["sub"])
    return await service.generate_test_points(project_id, data.requirement_ids, user["sub"])


@router.put("/test-points/{tp_id}")
async def update_test_point(
    tp_id: str,
    data: TestPointUpdate,
    user: dict = Depends(get_current_user),
    service: TestDesignService = Depends(get_test_design_service),
):
    tp = await service.update_test_point(tp_id, data)
    if not tp:
        raise HTTPException(status_code=404, detail="Test point not found")
    return tp


@router.delete("/test-points/{tp_id}")
async def delete_test_point(
    tp_id: str,
    user: dict = Depends(get_current_user),
    service: TestDesignService = Depends(get_test_design_service),
):
    raise HTTPException(
        status_code=400,
        detail="测试点属于测试链路中间产物，不允许单独删除；如需调整，请修改评审状态或重新生成测试点。",
    )


class BatchReviewRequest(BaseModel):
    ids: list[str]
    status: str


@router.post("/test-points/batch-review")
async def batch_review_test_points(
    data: BatchReviewRequest,
    user: dict = Depends(get_current_user),
    service: TestDesignService = Depends(get_test_design_service),
):
    count = await service.batch_update_review(data.ids, data.status)
    return {"ok": True, "updated": count}
