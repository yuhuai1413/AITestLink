import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.file_asset import FileAsset
from app.models.project import Project
from app.models.requirement import Requirement
from app.models.test_point import TestPoint
from app.models.test_case import TestCase
from app.models.automation_script import AutomationScript
from app.models.status_log import StatusLog
from app.routers.auth import get_current_user
from app.utils import model_to_dict
from app.utils import verify_project_owner

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
    await verify_project_owner(db, project_id, user["sub"])
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
    await verify_project_owner(db, project_id, user["sub"])

    if not file.filename:
        raise HTTPException(status_code=400, detail="文件名不能为空")

    ext = _validate_file(file.filename)

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="文件大小超过 50MB 限制")

    # 保存文件
    upload_dir = os.path.join(settings.UPLOAD_DIR, project_id)
    os.makedirs(upload_dir, exist_ok=True)

    file_id = str(uuid.uuid4())
    filename = f"{file_id}.{ext}"
    filepath = os.path.join(upload_dir, filename)

    with open(filepath, "wb") as f:
        f.write(content)

    # 记录文件信息
    file_asset = FileAsset(
        id=file_id,
        project_id=project_id,
        name=file.filename,
        file_type=ext,
        size=f"{len(content) / 1024:.1f} KB",
        storage_path=filepath,
    )
    db.add(file_asset)

    # 上传文件后，若项目测试状态为「待测试」则自动变为「测试中」
    proj_result = await db.execute(select(Project).where(Project.id == project_id))
    project = proj_result.scalar_one_or_none()
    if project and project.test_status == "待测试":
        project.test_status = "测试中"
        db.add(StatusLog(
            project_id=project_id,
            user_id=user["sub"],
            field_name="test_status",
            old_value="待测试",
            new_value="测试中",
            change_type="auto",
            reason="上传了输入资料，进入测试流程",
        ))

    await db.commit()
    await db.refresh(file_asset)

    return model_to_dict(file_asset)


@router.delete("/files/{file_id}")
async def delete_file(
    file_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(FileAsset).where(FileAsset.id == file_id))
    file_asset = result.scalar_one_or_none()
    if not file_asset:
        raise HTTPException(status_code=404, detail="文件不存在")

    await verify_project_owner(db, file_asset.project_id, user["sub"])

    project_id = file_asset.project_id

    # 删除物理文件
    if file_asset.storage_path and os.path.exists(file_asset.storage_path):
        os.remove(file_asset.storage_path)

    # 级联删除该项目的所有下游数据
    # 删除自动化脚本
    scripts = (await db.execute(select(AutomationScript).where(AutomationScript.project_id == project_id))).scalars().all()
    for s in scripts:
        await db.delete(s)

    # 删除测试用例
    cases = (await db.execute(select(TestCase).where(TestCase.project_id == project_id))).scalars().all()
    for c in cases:
        await db.delete(c)

    # 删除测试点
    points = (await db.execute(select(TestPoint).where(TestPoint.project_id == project_id))).scalars().all()
    for p in points:
        await db.delete(p)

    # 删除需求
    reqs = (await db.execute(select(Requirement).where(Requirement.project_id == project_id))).scalars().all()
    for r in reqs:
        await db.delete(r)

    # 删除文件
    await db.delete(file_asset)
    await db.flush()

    # 删除后检查项目是否还有剩余文件，若无则测试状态回退为「待测试」
    remaining = await db.execute(
        select(FileAsset.id).where(FileAsset.project_id == project_id).limit(1)
    )
    if remaining.scalar_one_or_none() is None:
        proj_result = await db.execute(select(Project).where(Project.id == project_id))
        project = proj_result.scalar_one_or_none()
        if project and project.test_status != "待测试":
            old_status = project.test_status
            project.test_status = "待测试"
            db.add(StatusLog(
                project_id=project_id,
                user_id=user["sub"],
                field_name="test_status",
                old_value=old_status,
                new_value="待测试",
                change_type="auto",
                reason="输入资料已全部删除，回退至待测试状态",
            ))

    await db.commit()
    return {"ok": True, "deleted": {"files": 1, "requirements": len(reqs), "testPoints": len(points), "testCases": len(cases), "scripts": len(scripts)}}
