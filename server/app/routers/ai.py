import uuid
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.ai_task import AITask
from app.models.file_asset import FileAsset
from app.models.project import Project
from app.models.requirement import Requirement
from app.models.test_case import TestCase
from app.models.test_point import TestPoint
from app.services.ai_service import AIService
from app.utils import model_to_dict

router = APIRouter()
ai_service = AIService()


async def run_parse_requirements(task_id: str, project_id: str, file_content: str):
    from app.database import async_session
    async with async_session() as db:
        try:
            requirements = await ai_service.parse_requirements(file_content)
            for req in requirements:
                r = Requirement(
                    id=str(uuid.uuid4()),
                    project_id=project_id,
                    module=req["module"],
                    feature=req["feature"],
                    source=req.get("source", ""),
                    risk=req.get("risk", "中"),
                    rule=req.get("rule", ""),
                    question=req.get("question", ""),
                )
                db.add(r)

            result = await db.execute(select(AITask).where(AITask.id == task_id))
            task = result.scalar_one()
            task.status = "成功"
            task.finished_at = datetime.utcnow()
            await db.commit()
        except Exception as e:
            result = await db.execute(select(AITask).where(AITask.id == task_id))
            task = result.scalar_one()
            task.status = "失败"
            task.error_message = str(e)
            task.finished_at = datetime.utcnow()
            await db.commit()


async def run_generate_test_points(task_id: str, project_id: str):
    from app.database import async_session
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

            for pt in points:
                tp = TestPoint(
                    id=str(uuid.uuid4()),
                    project_id=project_id,
                    module=pt["module"],
                    type=pt["type"],
                    title=pt["title"],
                    description=pt.get("description", ""),
                    priority=pt.get("priority", "P1"),
                    automatable=pt.get("automatable", False),
                )
                db.add(tp)

            result = await db.execute(select(AITask).where(AITask.id == task_id))
            task = result.scalar_one()
            task.status = "成功"
            task.finished_at = datetime.utcnow()
            await db.commit()
        except Exception as e:
            result = await db.execute(select(AITask).where(AITask.id == task_id))
            task = result.scalar_one()
            task.status = "失败"
            task.error_message = str(e)
            task.finished_at = datetime.utcnow()
            await db.commit()


async def run_generate_test_cases(task_id: str, project_id: str):
    from app.database import async_session
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

            for c in cases:
                tc = TestCase(
                    id=str(uuid.uuid4()),
                    project_id=project_id,
                    case_code=c.get("caseCode", f"TC-{uuid.uuid4().hex[:6].upper()}"),
                    module=c["module"],
                    feature=c.get("feature", ""),
                    title=c["title"],
                    priority=c.get("priority", "P1"),
                    precondition=c.get("precondition", ""),
                    steps=c.get("steps", ""),
                    test_data=c.get("testData", ""),
                    expected_result=c.get("expectedResult", ""),
                    automation=c.get("automation", "待评估"),
                )
                db.add(tc)

            # Update project case count
            count_result = await db.execute(
                select(TestCase).where(TestCase.project_id == project_id)
            )
            project_result = await db.execute(select(Project).where(Project.id == project_id))
            project = project_result.scalar_one()
            project.case_count = len(count_result.scalars().all())

            result = await db.execute(select(AITask).where(AITask.id == task_id))
            task = result.scalar_one()
            task.status = "成功"
            task.finished_at = datetime.utcnow()
            await db.commit()
        except Exception as e:
            result = await db.execute(select(AITask).where(AITask.id == task_id))
            task = result.scalar_one()
            task.status = "失败"
            task.error_message = str(e)
            task.finished_at = datetime.utcnow()
            await db.commit()


@router.get("/projects/{project_id}/ai/tasks")
async def list_ai_tasks(project_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(AITask).where(AITask.project_id == project_id).order_by(AITask.created_at.desc())
    )
    return [model_to_dict(t) for t in result.scalars().all()]


@router.post("/projects/{project_id}/ai/parse-requirements")
async def parse_requirements(project_id: str, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    # Get project files content
    file_result = await db.execute(
        select(FileAsset).where(FileAsset.project_id == project_id)
    )
    files = file_result.scalars().all()
    if not files:
        return {"error": "No files found. Please upload files first."}

    # Read file contents
    content_parts = []
    for f in files:
        if f.storage_path and __import__("os").path.exists(f.storage_path):
            with open(f.storage_path, "r", errors="ignore") as fh:
                content_parts.append(fh.read()[:5000])

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
async def generate_test_points(project_id: str, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
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
async def generate_test_cases(project_id: str, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
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
