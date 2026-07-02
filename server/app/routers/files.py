import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.file_asset import FileAsset
from app.utils import model_to_dict

router = APIRouter()


@router.get("/projects/{project_id}/files")
async def list_files(project_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(FileAsset).where(FileAsset.project_id == project_id).order_by(FileAsset.uploaded_at.desc())
    )
    return [model_to_dict(f) for f in result.scalars().all()]


@router.post("/projects/{project_id}/files", status_code=201)
async def upload_file(project_id: str, file: UploadFile, db: AsyncSession = Depends(get_db)):
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

    file_id = str(uuid.uuid4())
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    storage_name = f"{file_id}.{ext}"
    storage_path = os.path.join(settings.UPLOAD_DIR, storage_name)

    content = await file.read()
    with open(storage_path, "wb") as f:
        f.write(content)

    size_str = f"{len(content) / 1024:.0f} KB" if len(content) < 1024 * 1024 else f"{len(content) / (1024 * 1024):.1f} MB"

    file_type_map = {
        "docx": "需求文档", "doc": "需求文档", "pdf": "需求文档", "md": "需求文档",
        "json": "接口文档", "yaml": "接口文档", "yml": "接口文档",
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
async def delete_file(file_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(FileAsset).where(FileAsset.id == file_id))
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="File not found")

    if asset.storage_path and os.path.exists(asset.storage_path):
        os.remove(asset.storage_path)

    await db.delete(asset)
    await db.commit()
    return {"ok": True}
