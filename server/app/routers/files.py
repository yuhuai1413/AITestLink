import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.file_asset import FileAsset
from app.routers.auth import get_current_user
from app.utils import model_to_dict

router = APIRouter()

ALLOWED_EXTENSIONS = {
    "docx", "doc", "pdf", "md", "txt", "json", "yaml", "yml", "csv",
    "xlsx", "xls", "png", "jpg", "jpeg",
}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB


def _validate_file(filename: str) -> str:
    if "." not in filename:
        raise HTTPException(status_code=400, detail="文件必须包含扩展名")
    ext = filename.rsplit(".", 1)[-1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的文件格式: .{ext}，支持: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )
    return ext


@router.get("/projects/{project_id}/files")
async def list_files(
    project_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(FileAsset).where(FileAsset.project_id == project_id).order_by(FileAsset.uploaded_at.desc())
    )
    return [model_to_dict(f) for f in result.scalars().all()]


@router.post("/projects/{project_id}/files", status_code=201)
async def upload_file(
    project_id: str,
    file: UploadFile,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ext = _validate_file(file.filename)

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail=f"文件大小不能超过 {MAX_FILE_SIZE // (1024*1024)}MB")

    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

    file_id = str(uuid.uuid4())
    storage_name = f"{file_id}.{ext}"
    storage_path = os.path.join(settings.UPLOAD_DIR, storage_name)

    with open(storage_path, "wb") as f:
        f.write(content)

    size = len(content)
    if size < 1024:
        size_str = f"{size} B"
    elif size < 1024 * 1024:
        size_str = f"{size / 1024:.0f} KB"
    else:
        size_str = f"{size / (1024 * 1024):.1f} MB"

    file_type_map = {
        "docx": "需求文档", "doc": "需求文档", "pdf": "需求文档", "md": "需求文档",
        "json": "接口文档", "yaml": "接口文档", "yml": "接口文档",
        "xlsx": "数据文件", "xls": "数据文件",
        "png": "图片", "jpg": "图片", "jpeg": "图片",
    }

    asset = FileAsset(
        id=file_id,
        project_id=project_id,
        name=file.filename,
        file_type=file_type_map.get(ext, "其他"),
        size=size_str,
        storage_path=storage_path,
        parse_status="待解析",
    )
    db.add(asset)
    await db.commit()
    await db.refresh(asset)
    return model_to_dict(asset)


@router.delete("/files/{file_id}")
async def delete_file(
    file_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(FileAsset).where(FileAsset.id == file_id))
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="File not found")

    if asset.storage_path and os.path.exists(asset.storage_path):
        os.remove(asset.storage_path)

    await db.delete(asset)
    await db.commit()
    return {"ok": True}
