from fastapi import APIRouter, Depends, HTTPException, UploadFile

from app.routers.deps import get_current_user, get_document_service, get_project_service
from app.services.document_service import DocumentService
from app.services.project_service import ProjectService

router = APIRouter()


@router.get("/projects/{project_id}/files")
async def list_files(
    project_id: str,
    user: dict = Depends(get_current_user),
    service: DocumentService = Depends(get_document_service),
    project_service: ProjectService = Depends(get_project_service),
):
    await project_service._verify_project_owner(project_id, user["sub"])
    return await service.list_by_project(project_id)


@router.post("/projects/{project_id}/files", status_code=201)
async def upload_file(
    project_id: str,
    file: UploadFile,
    user: dict = Depends(get_current_user),
    service: DocumentService = Depends(get_document_service),
    project_service: ProjectService = Depends(get_project_service),
):
    await project_service._verify_project_owner(project_id, user["sub"])

    if not file.filename:
        raise HTTPException(status_code=400, detail="文件名不能为空")

    content = await file.read()
    return await service.upload(content, file.filename, project_id)


@router.get("/files/{doc_id}")
async def get_file(
    doc_id: str,
    user: dict = Depends(get_current_user),
    service: DocumentService = Depends(get_document_service),
):
    file = await service.get_by_id(doc_id)
    if not file:
        raise HTTPException(status_code=404, detail="文件不存在")
    return file


@router.delete("/files/{file_id}")
async def delete_file(
    file_id: str,
    user: dict = Depends(get_current_user),
    service: DocumentService = Depends(get_document_service),
):
    success = await service.delete(file_id)
    if not success:
        raise HTTPException(status_code=404, detail="文件不存在")
    return {"ok": True}
