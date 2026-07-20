from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.doc_gen_status import DocGenStatus
from app.models.project import Project
from app.routers.auth import get_current_user
from app.services.export_format import format_api_datetime
from app.utils import verify_project_owner

router = APIRouter()


class DocGenStatusUpdate(BaseModel):
    template_id: str
    status: str  # 待生成 / 数据不足 / 已生成


@router.get("/projects/{project_id}/doc-gen-status")
async def get_doc_gen_status(
    project_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await verify_project_owner(db, project_id, user["sub"])
    result = await db.execute(
        select(DocGenStatus).where(DocGenStatus.project_id == project_id)
    )
    statuses = result.scalars().all()
    return {
        s.template_id: {
            "status": s.status,
            "generatedAt": format_api_datetime(s.generated_at) or None,
        }
        for s in statuses
    }


@router.put("/projects/{project_id}/doc-gen-status")
async def update_doc_gen_status(
    project_id: str,
    body: DocGenStatusUpdate,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await verify_project_owner(db, project_id, user["sub"])
    record_id = f"{project_id}_{body.template_id}"
    result = await db.execute(
        select(DocGenStatus).where(DocGenStatus.id == record_id)
    )
    status = result.scalar_one_or_none()

    now = datetime.now(timezone.utc)
    if status:
        status.status = body.status
        status.updated_at = now
        if body.status == "已生成":
            status.generated_at = now
    else:
        status = DocGenStatus(
            id=record_id,
            project_id=project_id,
            template_id=body.template_id,
            status=body.status,
            generated_at=now if body.status == "已生成" else None,
            created_at=now,
            updated_at=now,
        )
        db.add(status)

    # 同步更新项目的 doc_status
    proj_result = await db.execute(select(Project).where(Project.id == project_id))
    project = proj_result.scalar_one_or_none()
    if project:
        if body.status == "生成中":
            project.doc_status = "生成中"
        elif body.status == "已生成":
            # 检查是否所有模板都已生成
            all_status = await db.execute(
                select(DocGenStatus).where(DocGenStatus.project_id == project_id)
            )
            all_gen = all(s.status == "已生成" for s in all_status.scalars().all())
            project.doc_status = "已完成" if all_gen else "部分生成"
        elif body.status == "待生成":
            project.doc_status = "待生成"

    await db.commit()
    return {"ok": True, "status": status.status}
