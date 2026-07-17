import json
import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session, get_db
from app.models.ai_task import AITask
from app.models.file_asset import FileAsset
from app.models.status_log import StatusLog
from app.models.project import Project
from app.models.requirement import Requirement
from app.models.test_point import TestPoint
from app.models.test_case import TestCase
from app.routers.auth import get_current_user
from app.routers.ai_documents import router as documents_router
from app.routers.ai_streaming import router as streaming_router
from app.routers.deps import get_current_user_sse
from app.services.ai_service import AIService, check_config_for_task
from app.services.ai_input_builder import (
    requirement_batches,
    test_case_batches,
    test_point_batches,
    validate_case_environment,
    validate_case_runtime_fields,
    validate_persisted_traceability,
    validate_reference_values,
    validate_references,
)
from app.services.ai_task_support import (
    friendly_error as _friendly_error,
    module_counter as _module_counter,
    normalize_automation as _normalize_automation,
    read_file_content as _read_file_content,
    to_eng_abbr as _to_eng_abbr,
    update_task_status as _update_task_status,
)
from app.services.environment_service import EnvironmentService
from app.services.ui_recognition_service import UIRecognitionService
from app.utils import model_to_dict
from app.utils import verify_project_owner

logger = logging.getLogger(__name__)


router = APIRouter()
router.include_router(documents_router)
router.include_router(streaming_router)
ai_service = AIService()


# ─── 后台任务 ───

async def _update_task_progress(db: AsyncSession, task_id: str, payload: dict) -> None:
    result = await db.execute(select(AITask).where(AITask.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        return
    task.result = json.dumps(payload, ensure_ascii=False)
    await db.commit()

async def run_parse_requirements(task_id: str, project_id: str, file_content: str, user_id: str):
    async with async_session() as db:
        try:
            file_result = await db.execute(
                select(FileAsset).where(FileAsset.project_id == project_id)
            )
            files = file_result.scalars().all()

            for f in files:
                f.parse_status = "解析中"
            await db.commit()

            logger.info(f"run_parse_requirements: file_content_len={len(file_content)}, user_id={user_id}")
            requirements = await ai_service.parse_requirements(file_content, user_id)
            logger.info(f"parse_requirements result: type={type(requirements).__name__}, len={len(requirements) if isinstance(requirements, (list, dict)) else 'N/A'}, preview={str(requirements)[:200]}")

            # 确保返回的是列表；如果 LLM 返回了 dict，尝试从各种常见结构中提取列表
            if isinstance(requirements, dict):
                for v in requirements.values():
                    if isinstance(v, list) and v and isinstance(v[0], dict) and "module" in v[0]:
                        requirements = v
                        break
                if isinstance(requirements, dict):
                    for k, v in requirements.items():
                        if isinstance(v, list) and v and isinstance(v[0], dict):
                            requirements = v
                            logger.info(f"extracted list from dict key '{k}', len={len(v)}")
                            break
            # 如果返回单个 dict（截断响应），尝试包装为列表
            if isinstance(requirements, dict):
                if {"module", "feature"}.issubset(requirements.keys()):
                    requirements = [requirements]
                else:
                    logger.error(f"parse_requirements: invalid result, type={type(requirements).__name__}, preview={str(requirements)[:500]}")
                    for f in files:
                        f.parse_status = "失败"
                        f.parse_error = "AI 未返回有效的解析数据"
                    await db.commit()
                    await _update_task_status(db, task_id, "失败", "AI 未返回有效的解析数据，请检查模型配置或文件内容后重试")
                    return
            if not isinstance(requirements, list) or not requirements:
                logger.error(f"parse_requirements: invalid result, type={type(requirements).__name__}, preview={str(requirements)[:500]}")
                for f in files:
                    f.parse_status = "失败"
                    f.parse_error = "AI 未返回有效的解析数据"
                await db.commit()
                await _update_task_status(db, task_id, "失败", "AI 未返回有效的解析数据，请检查模型配置或文件内容后重试")
                return

            # 校验已通过；删除旧数据与写入新数据在同一事务中原子完成。
            from sqlalchemy import delete
            await db.execute(delete(Requirement).where(Requirement.project_id == project_id))

            # 重新编号，确保 req_id 唯一
            for idx, req in enumerate(requirements):
                db.add(Requirement(
                    id=str(uuid.uuid4()),
                    req_id=f"REQ_{idx + 1:03d}",
                    project_id=project_id,
                    module=req["module"],
                    feature=req["feature"],
                    source=req.get("source", ""),
                    risk=req.get("risk", "中"),
                    rule=req.get("rule", ""),
                    question=req.get("question", ""),
                ))

            for f in files:
                f.parse_status = "已完成"
                f.parse_error = ""

            await db.commit()
            await _update_task_status(db, task_id, "成功")

        except Exception as e:
            await db.rollback()
            error_msg = _friendly_error(e, "需求解析")
            logger.exception("run_parse_requirements failed")
            try:
                file_result = await db.execute(
                    select(FileAsset).where(FileAsset.project_id == project_id)
                )
                for f in file_result.scalars().all():
                    f.parse_status = "失败"
                    f.parse_error = error_msg
                
                # 记录解析失败日志（不改变test_status，保持"测试中"状态）
                
                await db.commit()
            except Exception:
                logger.exception("Failed to update file status on error")
            await _update_task_status(db, task_id, "失败", _friendly_error(e, "需求解析"))


async def run_generate_test_points(task_id: str, project_id: str, user_id: str):
    logger.info(f"run_generate_test_points: task_id={task_id}, project_id={project_id}, user_id={user_id}")
    async with async_session() as db:
        try:
            result = await db.execute(
                select(Requirement).where(Requirement.project_id == project_id)
            )
            requirements = result.scalars().all()
            if not requirements:
                await _update_task_status(db, task_id, "失败", "需求列表为空，无法生成测试点")
                return
            points = []
            for payload in requirement_batches(requirements):
                batch_points = await ai_service.generate_test_points(payload, user_id)
                payload_items = json.loads(payload)
                batch_requirement_ids = {item["requirementId"] for item in payload_items}
                validate_references(batch_points, "requirementId", batch_requirement_ids)
                validate_reference_values(
                    batch_points,
                    "requirementId",
                    {item["requirementId"]: item for item in payload_items},
                    ("module",),
                )
                points.extend(batch_points)
            logger.info(f"generate_test_points: type={type(points).__name__}, len={len(points) if isinstance(points, (list, dict)) else 'N/A'}")

            if not points:
                logger.error(f"generate_test_points: invalid result, type={type(points).__name__}, preview={str(points)[:500]}")
                await _update_task_status(db, task_id, "失败", "AI 未返回有效的测试点数据，请检查模型配置或需求数据后重试")
                return

            # 删除与重建使用同一个事务，任何写入失败都会保留旧数据。
            from sqlalchemy import delete
            await db.execute(delete(TestPoint).where(TestPoint.project_id == project_id))

            for (point_code, _), pt in zip(_module_counter(points, "TP"), points):
                db.add(TestPoint(
                    id=str(uuid.uuid4()),
                    point_code=point_code,
                    project_id=project_id,
                    requirement_id=pt["requirementId"],
                    module=pt["module"],
                    type=pt["type"],
                    title=pt["title"],
                    description=pt.get("description", ""),
                    priority=pt.get("priority", "P1"),
                    automatable=bool(pt.get("automatable", False)),
                ))


            await db.commit()
            logger.info(f"run_generate_test_points: task {task_id} completed successfully, {len(points)} points saved")
            await _update_task_status(db, task_id, "成功")

        except Exception as e:
            await db.rollback()
            logger.exception(f"run_generate_test_points failed: task_id={task_id}")
            await _update_task_status(db, task_id, "失败", _friendly_error(e, "测试点生成"))


async def run_generate_test_cases(task_id: str, project_id: str, user_id: str):
    async with async_session() as db:
        try:
            tp_result = await db.execute(
                select(TestPoint).where(TestPoint.project_id == project_id)
            )
            points = tp_result.scalars().all()
            if not points:
                await _update_task_status(db, task_id, "失败", "测试点列表为空，无法生成测试用例")
                return
            if any(not point.requirement_id for point in points):
                await _update_task_status(db, task_id, "失败", "存在未关联需求的旧测试点，请先重新生成测试点")
                return
            requirement_result = await db.execute(
                select(Requirement).where(Requirement.project_id == project_id)
            )
            requirements_by_id = {item.id: item for item in requirement_result.scalars().all()}
            environment_context = await EnvironmentService(db).get_generation_context(project_id, user_id)

            cases = []
            for payload in test_point_batches(points, requirements_by_id, environment_context):
                batch_cases = await ai_service.generate_test_cases(payload, user_id)
                payload_items = json.loads(payload)
                batch_point_ids = {item["testPointId"] for item in payload_items}
                validate_references(batch_cases, "testPointId", batch_point_ids)
                validate_reference_values(
                    batch_cases,
                    "testPointId",
                    {item["testPointId"]: item for item in payload_items},
                    ("module", "priority"),
                )
                validate_case_environment(batch_cases, environment_context)
                cases.extend(batch_cases)
            logger.info(f"generate_test_cases: type={type(cases).__name__}, len={len(cases) if isinstance(cases, (list, dict)) else 'N/A'}")

            if not cases:
                logger.error(f"generate_test_cases: invalid result, type={type(cases).__name__}, preview={str(cases)[:500]}")
                await _update_task_status(db, task_id, "失败", "AI 未返回有效的测试用例数据，请检查模型配置或测试点数据后重试")
                return

            # 删除与重建使用同一个事务，任何写入失败都会保留旧数据。
            from sqlalchemy import delete
            await db.execute(delete(TestCase).where(TestCase.project_id == project_id))

            for (case_code, _), c in zip(_module_counter(cases, "TC"), cases):
                # 关联测试点
                tp_id = c["testPointId"]
                matched_point = next(tp for tp in points if tp.id == tp_id)
                requirement = requirements_by_id.get(matched_point.requirement_id)

                db.add(TestCase(
                    id=str(uuid.uuid4()),
                    project_id=project_id,
                    case_code=case_code,
                    test_point_id=tp_id,
                    requirement_id=matched_point.requirement_id,
                    environment_id=c["environmentId"],
                    module=matched_point.module,
                    feature=requirement.feature if requirement else c.get("feature", ""),
                    title=c["title"],
                    priority=c.get("priority", "P1"),
                    precondition=c.get("precondition", ""),
                    steps=c.get("steps", ""),
                    test_data=json.dumps(c.get("testData", ""), ensure_ascii=False) if isinstance(c.get("testData"), (dict, list)) else str(c.get("testData", "")),
                    expected_result=c.get("expectedResult", ""),
                    test_type=c.get("testType", "功能测试"),
                    target_platform=c["targetPlatform"],
                    test_url=c["testUrl"],
                    required_role=c["requiredRole"],
                    automation=_normalize_automation(c.get("automation")),
                ))


            await db.commit()
            await _update_task_status(db, task_id, "成功")

        except Exception as e:
            await db.rollback()
            logger.exception("run_generate_test_cases failed")
            friendly = _friendly_error(e, "用例生成")
            await _update_task_status(db, task_id, "失败", friendly)


async def run_generate_scripts(task_id: str, project_id: str, user_id: str):
    """后台任务：生成自动化脚本"""
    from app.models.automation_script import AutomationScript
    async with async_session() as db:
        try:
            # 获取适合自动化的测试用例
            tc_result = await db.execute(
                select(TestCase).where(
                    TestCase.project_id == project_id,
                    TestCase.automation == "是"
                ).order_by(TestCase.created_at.asc())
            )
            test_cases = tc_result.scalars().all()
            if not test_cases:
                await _update_task_status(db, task_id, "失败", "没有适合自动化的测试用例")
                return
            validate_persisted_traceability(cases=test_cases)
            validate_case_runtime_fields(test_cases, for_automation=True)

            ui_context = await UIRecognitionService(db).latest_context_by_project(project_id, user_id)
            scripts = []
            payload_batches = test_case_batches(test_cases, ui_context)
            await _update_task_progress(db, task_id, {
                "stage": "generating",
                "message": f"正在生成自动化脚本：共 {len(test_cases)} 条用例，拆分为 {len(payload_batches)} 批",
                "totalCases": len(test_cases),
                "totalBatches": len(payload_batches),
                "finishedBatches": 0,
            })
            for batch_index, payload in enumerate(payload_batches, start=1):
                batch_case_ids = {item["testCaseId"] for item in json.loads(payload)}
                await _update_task_progress(db, task_id, {
                    "stage": "generating",
                    "message": f"正在生成第 {batch_index}/{len(payload_batches)} 批脚本",
                    "totalCases": len(test_cases),
                    "totalBatches": len(payload_batches),
                    "finishedBatches": batch_index - 1,
                    "currentBatchCases": len(batch_case_ids),
                })
                logger.info(
                    "run_generate_scripts: task_id=%s batch=%s/%s chars=%s cases=%s",
                    task_id,
                    batch_index,
                    len(payload_batches),
                    len(payload),
                    len(batch_case_ids),
                )
                batch_scripts = await ai_service.generate_automation_scripts(payload, user_id)
                validate_references(batch_scripts, "testCaseId", batch_case_ids)
                scripts.extend(batch_scripts)
                await _update_task_progress(db, task_id, {
                    "stage": "generating",
                    "message": f"第 {batch_index}/{len(payload_batches)} 批脚本已生成",
                    "totalCases": len(test_cases),
                    "totalBatches": len(payload_batches),
                    "finishedBatches": batch_index,
                    "generatedScripts": len(scripts),
                })

            if not scripts:
                await _update_task_status(db, task_id, "失败", "AI 未返回有效的脚本数据")
                return

            # 删除与重建使用同一个事务，任何写入失败都会保留旧数据。
            from sqlalchemy import delete
            await db.execute(delete(AutomationScript).where(AutomationScript.project_id == project_id))

            for i, s in enumerate(scripts):
                tc_id = s.get("testCaseId", "")
                # 找到对应的测试用例
                matched_tc = next(tc for tc in test_cases if tc.id == tc_id)

                # 生成脚本编号
                module = matched_tc.module
                abbr = _to_eng_abbr(module)

                db.add(AutomationScript(
                    id=str(uuid.uuid4()),
                    project_id=project_id,
                    test_case_id=matched_tc.id,
                    script_code=f"SC_{abbr}_{i+1:03d}",
                    script_type=s.get("scriptType", "UI"),
                    framework=s.get("framework", "Playwright"),
                    language=s.get("language", "Python"),
                    code=s.get("code", ""),
                    status="未测试",
                    generated_by_ai=True,
                ))

            await db.commit()
            await _update_task_status(db, task_id, "成功")

        except Exception as e:
            await db.rollback()
            logger.exception("run_generate_scripts failed")
            friendly = _friendly_error(e, "脚本生成")
            await _update_task_status(db, task_id, "失败", friendly)


# ─── 路由 ───

@router.get("/projects/{project_id}/ai/tasks")
async def list_ai_tasks(
    project_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await verify_project_owner(db, project_id, user["sub"])
    result = await db.execute(
        select(AITask).where(AITask.project_id == project_id).order_by(AITask.created_at.desc())
    )
    return [model_to_dict(t) for t in result.scalars().all()]


@router.get("/projects/{project_id}/ai/check-config/{task_type}")
async def check_ai_config(
    project_id: str,
    task_type: str,
    user: dict = Depends(get_current_user),
):
    """检查用户是否已配置指定 AI 任务的模型"""
    result = await check_config_for_task(task_type, user["sub"])
    return result


@router.post("/projects/{project_id}/ai/parse-requirements")
async def parse_requirements(
    project_id: str,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await verify_project_owner(db, project_id, user["sub"])
    # 检查配置
    config_check = await check_config_for_task("需求解析", user["sub"])
    if not config_check["configured"]:
        raise HTTPException(status_code=400, detail=config_check["message"])

    file_result = await db.execute(
        select(FileAsset).where(FileAsset.project_id == project_id)
    )
    files = file_result.scalars().all()
    if not files:
        return {"error": "No files found. Please upload files first."}

    content_parts = []
    # 按文件类型排序：需求文档(docx)优先，辅助文档(xlsx/txt等)其次
    def _file_priority(f):
        ext = f.name.rsplit(".", 1)[-1].lower() if "." in f.name else ""
        if ext in ("docx", "doc"):
            return 0  # 需求文档优先
        return 1  # 辅助文档其次

    sorted_files = sorted(files, key=_file_priority)
    for f in sorted_files:
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

    background_tasks.add_task(run_parse_requirements, task.id, project_id, file_content, user["sub"])
    return model_to_dict(task)


@router.post("/projects/{project_id}/ai/generate-test-points")
async def generate_test_points(
    project_id: str,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await verify_project_owner(db, project_id, user["sub"])
    # 检查是否有需求数据
    req_result = await db.execute(
        select(Requirement).where(Requirement.project_id == project_id)
    )
    if not req_result.scalars().first():
        raise HTTPException(status_code=400, detail="需求列表为空，请先在「需求列表」页面完成需求解析")

    # 检查配置
    config_check = await check_config_for_task("测试点生成", user["sub"])
    if not config_check["configured"]:
        raise HTTPException(status_code=400, detail=config_check["message"])

    task = AITask(
        id=str(uuid.uuid4()),
        project_id=project_id,
        type="测试点生成",
        status="执行中",
        model_name="AI",
    )
    db.add(task)
    await db.commit()

    background_tasks.add_task(run_generate_test_points, task.id, project_id, user["sub"])
    return model_to_dict(task)


@router.post("/projects/{project_id}/ai/generate-test-cases")
async def generate_test_cases(
    project_id: str,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await verify_project_owner(db, project_id, user["sub"])
    # 检查测试点是否存在
    tp_result = await db.execute(
        select(TestPoint).where(TestPoint.project_id == project_id)
    )
    if not tp_result.scalars().first():
        raise HTTPException(status_code=400, detail="测试点列表为空，请先在「测试点」页面生成测试点")
    try:
        await EnvironmentService(db).get_generation_context(project_id, user["sub"])
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    # 检查配置
    config_check = await check_config_for_task("用例生成", user["sub"])
    if not config_check["configured"]:
        raise HTTPException(status_code=400, detail=config_check["message"])

    task = AITask(
        id=str(uuid.uuid4()),
        project_id=project_id,
        type="用例生成",
        status="执行中",
        model_name="AI",
    )
    db.add(task)
    await db.commit()

    background_tasks.add_task(run_generate_test_cases, task.id, project_id, user["sub"])
    return model_to_dict(task)


@router.post("/projects/{project_id}/ai/generate-scripts")
async def generate_scripts(
    project_id: str,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await verify_project_owner(db, project_id, user["sub"])
    # 检查测试用例
    tc_result = await db.execute(
        select(TestCase).where(
            TestCase.project_id == project_id,
            TestCase.automation == "是"
        )
    )
    if not tc_result.scalars().first():
        raise HTTPException(status_code=400, detail="没有适合自动化的测试用例")
    # 检查配置
    config_check = await check_config_for_task("脚本生成", user["sub"])
    if not config_check["configured"]:
        raise HTTPException(status_code=400, detail=config_check["message"])

    task = AITask(
        id=str(uuid.uuid4()),
        project_id=project_id,
        type="脚本生成",
        status="执行中",
        model_name="AI",
    )
    db.add(task)
    await db.commit()

    background_tasks.add_task(run_generate_scripts, task.id, project_id, user["sub"])
    return model_to_dict(task)


# ─── 执行脚本分析 ───

@router.post("/projects/{project_id}/ai/execute-scripts")
async def execute_scripts(
    project_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await verify_project_owner(db, project_id, user["sub"])

    # 生成的脚本属于不可信代码，必须在隔离 Worker/容器中执行。当前部署尚未
    # 配置执行器，因此明确拒绝请求，避免把 AI 分析误报为真实测试执行成功。
    raise HTTPException(
        status_code=501,
        detail="自动化执行器尚未配置。请部署隔离的 Playwright/pytest Worker 后再执行脚本",
    )
