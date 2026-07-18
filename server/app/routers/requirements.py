from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.routers.deps import get_current_user, get_document_service, get_project_service
from app.services.document_service import DocumentService
from app.services.project_service import ProjectService
from app.schemas.requirement import RequirementUpdate

router = APIRouter()


@router.get("/projects/{project_id}/requirements")
async def list_requirements(
    project_id: str,
    user: dict = Depends(get_current_user),
    service: DocumentService = Depends(get_document_service),
    project_service: ProjectService = Depends(get_project_service),
):
    await project_service._verify_project_owner(project_id, user["sub"])
    return await service.get_requirements(project_id)


@router.get("/projects/{project_id}/requirements/search")
async def search_requirements(
    project_id: str,
    q: str,
    user: dict = Depends(get_current_user),
    service: DocumentService = Depends(get_document_service),
    project_service: ProjectService = Depends(get_project_service),
):
    await project_service._verify_project_owner(project_id, user["sub"])
    return await service.search_requirements(project_id, q)


@router.put("/requirements/{req_id}")
async def update_requirement(
    req_id: str,
    data: RequirementUpdate,
    user: dict = Depends(get_current_user),
    service: DocumentService = Depends(get_document_service),
):
    req = await service.update_requirement(req_id, data)
    if not req:
        raise HTTPException(status_code=404, detail="Requirement not found")
    return req


@router.delete("/requirements/{req_id}")
async def delete_requirement(
    req_id: str,
    user: dict = Depends(get_current_user),
    service: DocumentService = Depends(get_document_service),
):
    raise HTTPException(
        status_code=400,
        detail="需求属于测试链路中间产物，不允许单独删除；如需调整，请修改评审状态或重新解析输入资料。",
    )


class BatchConfirmRequest(BaseModel):
    ids: list[str]
    confirmed: bool


@router.post("/requirements/batch-confirm")
async def batch_confirm_requirements(
    data: BatchConfirmRequest,
    user: dict = Depends(get_current_user),
    service: DocumentService = Depends(get_document_service),
):
    count = await service.batch_confirm(data.ids, data.confirmed)
    return {"ok": True, "updated": count}
