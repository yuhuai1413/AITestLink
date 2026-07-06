import logging
import os
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session, get_db
from app.models.ai_task import AITask
from app.models.file_asset import FileAsset
from app.models.requirement import Requirement
from app.models.test_point import TestPoint
from app.models.test_case import TestCase
from app.services.ai_service import AIService
from app.utils import model_to_dict

logger = logging.getLogger(__name__)

router = APIRouter()
ai_service = AIService()


# ─── 工具函数 ───

async def _update_task_status(db: AsyncSession, task_id: str, status: str, error: str | None = None):
    result = await db.execute(select(AITask).where(AITask.id == task_id))
    task = result.scalar_one_or_none()
    if task:
        task.status = status
        task.finished_at = datetime.now(timezone.utc)
        if error:
            task.error_message = error[:2000]  # 截断过长的错误信息
        await db.commit()


def _module_counter(items: list[dict], prefix: str) -> list[tuple[str, str]]:
    """为按模块分组的项目生成编号。返回 [(id, module), ...]"""
    counters: dict[str, int] = {}
    result = []
    for item in items:
        module = item["module"]
        counters[module] = counters.get(module, 0) + 1
        short = module[:4] if len(module) >= 4 else module
        result.append((f"{prefix}_{short}_{counters[module]:03d}", module))
    return result


def _read_file_content(file_obj: FileAsset) -> str:
    """读取单个文件的内容，返回文本。"""
    if not file_obj.storage_path or not os.path.exists(file_obj.storage_path):
        return ""

    ext = file_obj.name.rsplit(".", 1)[-1].lower() if "." in file_obj.name else ""

    try:
        if ext in ("docx", "doc"):
            from docx import Document
            doc = Document(file_obj.storage_path)
            text = "\n".join(p.text for p in doc.paragraphs if p.text.strip())
            return text[:5000]

        if ext in ("xlsx", "xls"):
            import openpyxl
            wb = openpyxl.load_workbook(file_obj.storage_path, read_only=True, data_only=True)
            parts = []
            for sheet in wb.sheetnames:
                ws = wb[sheet]
                rows = [
                    " | ".join(str(c) if c is not None else "" for c in row)
                    for row in ws.iter_rows(values_only=True)
                ]
                rows = [r for r in rows if r.strip()]
                if rows:
                    parts.append(f"Sheet: {sheet}\n" + "\n".join(rows[:100]))
            wb.close()
            return "\n".join(parts)[:5000]

        if ext == "pdf":
            import PyPDF2
            reader = PyPDF2.PdfReader(file_obj.storage_path)
            text = "\n".join(page.extract_text() or "" for page in reader.pages[:20])
            return text[:5000]

        if ext in ("md", "txt", "json", "yaml", "yml", "csv"):
            with open(file_obj.storage_path, "r", errors="ignore") as fh:
                return fh.read()[:5000]

        return f"(不支持的格式: {ext})"

    except Exception as e:
        return f"(读取失败: {str(e)[:100]})"


# ─── 后台任务 ───

async def run_parse_requirements(task_id: str, project_id: str, file_content: str):
    async with async_session() as db:
        try:
            # 查询文件列表
            file_result = await db.execute(
                select(FileAsset).where(FileAsset.project_id == project_id)
            )
            files = file_result.scalars().all()

            # 更新文件状态为"解析中"
            for f in files:
                f.parse_status = "解析中"
            await db.commit()

            requirements = await ai_service.parse_requirements(file_content)
            for req in requirements:
                db.add(Requirement(
                    id=str(uuid.uuid4()),
                    project_id=project_id,
                    module=req["module"],
                    feature=req["feature"],
                    source=req.get("source", ""),
                    risk=req.get("risk", "中"),
                    rule=req.get("rule", ""),
                    question=req.get("question", ""),
                ))

            # 更新文件状态为"已完成"
            for f in files:
                f.parse_status = "已完成"

            await _update_task_status(db, task_id, "成功")

        except Exception as e:
            logger.exception("run_parse_requirements failed")
            try:
                file_result = await db.execute(
                    select(FileAsset).where(FileAsset.project_id == project_id)
                )
                for f in file_result.scalars().all():
                    f.parse_status = "失败"
                await db.commit()
            except Exception:
                logger.exception("Failed to update file status on error")
            await _update_task_status(db, task_id, "失败", str(e))


async def run_generate_test_points(task_id: str, project_id: str):
    async with async_session() as db:
        try:
            result = await db.execute(
                select(Requirement).where(Requirement.project_id == project_id)
            )
            requirements = result.scalars().all()
            req_text = "\n".join(
                f"- 模块:{r.module} 功能:{r.feature} 规则:{r.rule}" for r in requirements
            )
            points = await ai_service.generate_test_points(req_text)

            for (tp_id, _), pt in zip(_module_counter(points, "TP"), points):
                db.add(TestPoint(
                    id=tp_id,
                    project_id=project_id,
                    module=pt["module"],
                    type=pt["type"],
                    title=pt["title"],
                    description=pt.get("description", ""),
                    priority=pt.get("priority", "P1"),
                    automatable=pt.get("automatable", False),
                ))

            await _update_task_status(db, task_id, "成功")

        except Exception as e:
            logger.exception("run_generate_test_points failed")
            await _update_task_status(db, task_id, "失败", str(e))


async def run_generate_test_cases(task_id: str, project_id: str):
    async with async_session() as db:
        try:
            tp_result = await db.execute(
                select(TestPoint).where(TestPoint.project_id == project_id)
            )
            points = tp_result.scalars().all()
            pt_text = "\n".join(
                f"- 模块:{tp.module} 类型:{tp.type} 标题:{tp.title} 优先级:{tp.priority}"
                for tp in points
            )
            cases = await ai_service.generate_test_cases(pt_text)

            for (case_code, _), c in zip(_module_counter(cases, "TC"), cases):
                db.add(TestCase(
                    id=str(uuid.uuid4()),
                    project_id=project_id,
                    case_code=case_code,
                    module=c["module"],
                    feature=c.get("feature", ""),
                    title=c["title"],
                    priority=c.get("priority", "P1"),
                    precondition=c.get("precondition", ""),
                    steps=c.get("steps", ""),
                    test_data=c.get("testData", ""),
                    expected_result=c.get("expectedResult", ""),
                    automation=c.get("automation", "待评估"),
                ))

            await _update_task_status(db, task_id, "成功")

        except Exception as e:
            logger.exception("run_generate_test_cases failed")
            await _update_task_status(db, task_id, "失败", str(e))


# ─── 路由 ───

@router.get("/projects/{project_id}/ai/tasks")
async def list_ai_tasks(project_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(AITask).where(AITask.project_id == project_id).order_by(AITask.created_at.desc())
    )
    return [model_to_dict(t) for t in result.scalars().all()]


@router.post("/projects/{project_id}/ai/parse-requirements")
async def parse_requirements(
    project_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    file_result = await db.execute(
        select(FileAsset).where(FileAsset.project_id == project_id)
    )
    files = file_result.scalars().all()
    if not files:
        return {"error": "No files found. Please upload files first."}

    content_parts = []
    for f in files:
        text = _read_file_content(f)
        if text:
            content_parts.append(f"[{f.name}]\n{text}")

    file_content = "\n---\n".join(content_parts) if content_parts else "No readable content"

    task = AITask(
        id=str(uuid.uuid4()),
        project_id=project_id,
        type="需求解析",
        status="执行中",
        model_name="AI",
    )
    db.add(task)
    await db.commit()

    background_tasks.add_task(run_parse_requirements, task.id, project_id, file_content)
    return model_to_dict(task)


@router.post("/projects/{project_id}/ai/generate-test-points")
async def generate_test_points(
    project_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    task = AITask(
        id=str(uuid.uuid4()),
        project_id=project_id,
        type="测试点生成",
        status="执行中",
        model_name="AI",
    )
    db.add(task)
    await db.commit()

    background_tasks.add_task(run_generate_test_points, task.id, project_id)
    return model_to_dict(task)


@router.post("/projects/{project_id}/ai/generate-test-cases")
async def generate_test_cases(
    project_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    task = AITask(
        id=str(uuid.uuid4()),
        project_id=project_id,
        type="用例生成",
        status="执行中",
        model_name="AI",
    )
    db.add(task)
    await db.commit()

    background_tasks.add_task(run_generate_test_cases, task.id, project_id)
    return model_to_dict(task)
