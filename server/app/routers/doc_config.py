import json
import os

from fastapi import APIRouter, Depends, HTTPException, File, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.doc_template import DocTemplate
from app.routers.auth import get_current_user, require_admin

router = APIRouter()

TEMPLATE_DIR = os.path.join(os.path.dirname(settings.UPLOAD_DIR), "uploads", "doc-templates")

DEFAULT_TEMPLATES = [
    {
        "config_key": "tpl-plan",
        "name": "软件测试计划",
        "description": "测试范围、策略、资源、进度安排",
        "template_file": "软件测试计划模板.docx",
        "prompt_template": "",
        "output_fields": json.dumps(["封面信息", "测试概述", "测试策略", "测试环境", "测试资源", "风险分析", "准入准出标准", "交付物清单"], ensure_ascii=False),
        "display_order": 1,
    },
    {
        "config_key": "tpl-spec",
        "name": "软件测试说明",
        "description": "测试环境、用例设计、执行方法",
        "template_file": "软件测试说明模板.docx",
        "prompt_template": "",
        "output_fields": json.dumps(["封面信息", "测试说明概述", "测试环境说明", "测试用例设计说明", "测试执行方法", "测试数据准备", "缺陷管理流程", "测试进度安排"], ensure_ascii=False),
        "display_order": 2,
    },
    {
        "config_key": "tpl-report",
        "name": "软件测试报告",
        "description": "执行结果、缺陷统计、风险分析",
        "template_file": "软件测试报告模板.docx",
        "prompt_template": "",
        "output_fields": json.dumps(["封面信息", "测试概述", "测试范围", "测试环境", "测试执行情况", "缺陷统计", "主要风险", "遗留问题", "测试结论", "后续建议"], ensure_ascii=False),
        "display_order": 3,
    },
    {
        "config_key": "tpl-pc",
        "name": "PC端操作手册",
        "description": "系统操作流程、功能说明",
        "template_file": "PC端操作手册模板.docx",
        "prompt_template": "",
        "output_fields": json.dumps(["封面信息", "手册概述", "系统登录与注册", "功能模块操作说明", "常见问题解答", "联系方式"], ensure_ascii=False),
        "display_order": 4,
    },
    {
        "config_key": "tpl-app",
        "name": "APP端操作手册",
        "description": "移动端操作流程、功能说明",
        "template_file": "APP端操作手册模板.docx",
        "prompt_template": "",
        "output_fields": json.dumps(["封面信息", "手册概述", "APP安装与登录", "功能模块操作说明", "常见问题解答", "联系方式"], ensure_ascii=False),
        "display_order": 5,
    },
]


class DocTemplateSchema(BaseModel):
    id: str
    name: str
    description: str
    promptTemplate: str
    outputFields: str


class DocTemplateUpdate(BaseModel):
    configs: list[DocTemplateSchema]


def _to_dict(m: DocTemplate) -> dict:
    return {
        "id": m.id,
        "configKey": m.config_key,
        "name": m.name,
        "description": m.description,
        "templateFile": m.template_file or "",
        "promptTemplate": m.prompt_template or "",
        "outputFields": m.output_fields or "",
        "displayOrder": m.display_order,
        "createdAt": m.created_at.isoformat() if m.created_at else "",
        "updatedAt": m.updated_at.isoformat() if m.updated_at else "",
    }


async def _ensure_user_templates(db: AsyncSession, user_id: str):
    result = await db.execute(
        select(DocTemplate).where(DocTemplate.user_id == user_id)
    )
    existing = {t.config_key for t in result.scalars().all()}

    for tpl in DEFAULT_TEMPLATES:
        if tpl["config_key"] not in existing:
            tpl_id = f"{user_id}_{tpl['config_key']}"
            db.add(DocTemplate(
                id=tpl_id,
                user_id=user_id,
                config_key=tpl["config_key"],
                name=tpl["name"],
                description=tpl["description"],
                template_file=tpl["template_file"],
                prompt_template=tpl["prompt_template"],
                output_fields=tpl["output_fields"],
                display_order=tpl["display_order"],
            ))

    await db.commit()


@router.get("/doc-configs")
async def list_doc_configs(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_id = user["sub"]
    await _ensure_user_templates(db, user_id)

    result = await db.execute(
        select(DocTemplate).where(DocTemplate.user_id == user_id).order_by(DocTemplate.display_order)
    )
    templates = result.scalars().all()
    return [_to_dict(t) for t in templates]


@router.get("/doc-configs/{config_id}")
async def get_doc_config(
    config_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_id = user["sub"]
    result = await db.execute(
        select(DocTemplate).where(DocTemplate.id == config_id, DocTemplate.user_id == user_id)
    )
    tpl = result.scalar_one_or_none()
    if not tpl:
        raise HTTPException(status_code=404, detail="模板不存在")
    return _to_dict(tpl)


@router.get("/doc-configs/{config_id}/download")
async def download_doc_template(
    config_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_id = user["sub"]
    result = await db.execute(
        select(DocTemplate).where(DocTemplate.id == config_id, DocTemplate.user_id == user_id)
    )
    tpl = result.scalar_one_or_none()
    if not tpl:
        raise HTTPException(status_code=404, detail="模板不存在")
    if not tpl.template_file:
        raise HTTPException(status_code=404, detail="模板文件不存在")

    file_path = os.path.join(TEMPLATE_DIR, tpl.template_file)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="模板文件不存在")

    return FileResponse(
        path=file_path,
        filename=tpl.template_file,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )


@router.put("/doc-configs")
async def update_doc_configs(
    data: DocTemplateUpdate,
    user: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    user_id = user["sub"]
    result = await db.execute(
        select(DocTemplate).where(DocTemplate.user_id == user_id)
    )
    existing = {t.id: t for t in result.scalars().all()}

    for cfg in data.configs:
        if cfg.id in existing:
            m = existing[cfg.id]
            m.name = cfg.name
            m.description = cfg.description
            m.prompt_template = cfg.promptTemplate
            m.output_fields = cfg.outputFields

    await db.commit()
    return {"ok": True, "count": len(data.configs)}


@router.post("/doc-configs/{config_id}/upload")
async def upload_template_file(
    config_id: str,
    file: UploadFile = File(...),
    user: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    user_id = user["sub"]
    result = await db.execute(
        select(DocTemplate).where(DocTemplate.id == config_id, DocTemplate.user_id == user_id)
    )
    tpl = result.scalar_one_or_none()
    if not tpl:
        raise HTTPException(status_code=404, detail="模板不存在")

    # Ensure upload directory exists
    os.makedirs(TEMPLATE_DIR, exist_ok=True)

    # 清洗文件名，防止路径遍历攻击
    safe_filename = os.path.basename(file.filename) if file.filename else "template.docx"
    file_path = os.path.join(TEMPLATE_DIR, safe_filename)

    # 验证最终路径在 TEMPLATE_DIR 内
    real_template_dir = os.path.realpath(TEMPLATE_DIR)
    real_file_path = os.path.realpath(file_path)
    if not real_file_path.startswith(real_template_dir + os.sep) and real_file_path != real_template_dir:
        raise HTTPException(status_code=400, detail="非法文件名")

    # Save file
    content_bytes = await file.read()
    with open(file_path, "wb") as f:
        f.write(content_bytes)

    # Update database
    tpl.template_file = safe_filename
    await db.commit()

    return {"ok": True, "templateFile": safe_filename}
