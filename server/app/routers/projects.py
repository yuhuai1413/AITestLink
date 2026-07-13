from fastapi import APIRouter, Depends, HTTPException

from app.routers.deps import get_current_user, get_project_service
from app.services.project_service import ProjectService
from app.schemas.project import ProjectCreate, ProjectUpdate

router = APIRouter()


@router.get("")
async def list_projects(
    user: dict = Depends(get_current_user),
    service: ProjectService = Depends(get_project_service),
):
    return await service.list_by_user(user["sub"])


@router.post("", status_code=201)
async def create_project(
    data: ProjectCreate,
    user: dict = Depends(get_current_user),
    service: ProjectService = Depends(get_project_service),
):
    return await service.create(data, user["sub"])


@router.get("/{project_id}")
async def get_project(
    project_id: str,
    user: dict = Depends(get_current_user),
    service: ProjectService = Depends(get_project_service),
):
    project = await service.get_by_id(project_id, user["sub"])
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.put("/{project_id}")
async def update_project(
    project_id: str,
    data: ProjectUpdate,
    user: dict = Depends(get_current_user),
    service: ProjectService = Depends(get_project_service),
):
    project = await service.update(project_id, data, user["sub"])
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.delete("/{project_id}")
async def delete_project(
    project_id: str,
    user: dict = Depends(get_current_user),
    service: ProjectService = Depends(get_project_service),
):
    success = await service.delete(project_id, user["sub"])
    if not success:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"ok": True}
