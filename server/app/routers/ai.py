import json
import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session, get_db
from app.models.ai_task import AITask
from app.models.file_asset import FileAsset
from app.models.status_log import StatusLog
from app.models.project import Project
from app.models.requirement import Requirement
from app.models.test_point import TestPoint
from app.models.test_case import TestCase
from app.models.environment_config import EnvironmentConfig, TestAccount
from app.models.ui_snapshot import UISnapshot
from app.routers.auth import get_current_user
from app.routers.ai_documents import router as documents_router
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
    read_file_content as _read_file_content,
    to_eng_abbr as _to_eng_abbr,
    update_task_status as _update_task_status,
)
from app.services.data_lineage_service import (
    VALID,
    invalidate_after_requirements,
    invalidate_after_scripts,
    invalidate_after_test_cases,
    invalidate_after_test_points,
)
from app.services.document_vision_service import describe_requirement_images
from app.services.environment_service import EnvironmentService
from app.services.requirement_clarification import default_clarification_status, is_clarification_resolved
from app.services.script_generation_quality import assert_cases_script_ready, generated_script_error_message, review_generated_case_automation
from app.services.ui_recognition_service import UIRecognitionService
from app.utils import model_to_dict
from app.utils import verify_project_owner

logger = logging.getLogger(__name__)


router = APIRouter()
router.include_router(documents_router)
ai_service = AIService()


class ReverseRequirementsRequest(BaseModel):
    scope: str = Field(default="recognized")
    testTarget: str = Field(default="冒烟测试")
    writeMode: str = Field(default="append")
    maxPages: int = Field(default=20, ge=1, le=100)
    maxRequirements: int = Field(default=30, ge=1, le=100)
    keywords: str = ""


# ─── 后台任务 ───

async def _update_task_progress(db: AsyncSession, task_id: str, payload: dict) -> None:
    result = await db.execute(select(AITask).where(AITask.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        return
    task.result = json.dumps(payload, ensure_ascii=False)
    await db.commit()


def _next_code(counters: dict[str, int], module: str, prefix: str) -> str:
    abbr = _to_eng_abbr(module)
    counters[abbr] = counters.get(abbr, 0) + 1
    return f"{prefix}_{abbr}_{counters[abbr]:03d}"


def _target_url(environment: EnvironmentConfig) -> str:
    env_type = (environment.environment_type or "Web").strip()
    return (environment.app_url if env_type == "APP" else environment.web_url) or ""


def _compact_reverse_snapshot(snapshot: dict, max_pages: int) -> dict:
    app_page = snapshot.get("appPage") if isinstance(snapshot.get("appPage"), dict) else {}
    login_page = snapshot.get("loginPage") if isinstance(snapshot.get("loginPage"), dict) else {}
    ai_analysis = snapshot.get("aiAnalysis") if isinstance(snapshot.get("aiAnalysis"), dict) else {}
    page_objects = ai_analysis.get("pageObjects") if isinstance(ai_analysis.get("pageObjects"), list) else []
    menus = app_page.get("menus") if isinstance(app_page.get("menus"), list) else []
    buttons = app_page.get("buttons") if isinstance(app_page.get("buttons"), list) else []
    forms = app_page.get("forms") if isinstance(app_page.get("forms"), list) else []
    return {
        "environment": snapshot.get("environment") or {},
        "loginResult": snapshot.get("loginResult") or {},
        "currentPage": {
            "url": app_page.get("url") or login_page.get("url") or "",
            "title": app_page.get("title") or login_page.get("title") or "",
        },
        "menus": menus[:max_pages],
        "buttons": buttons[:80],
        "forms": forms[:40],
        "pageObjects": page_objects[:max_pages],
        "scope": snapshot.get("scope") or {},
        "summary": snapshot.get("summary") or "",
    }


async def run_reverse_requirements(
    task_id: str,
    project_id: str,
    user_id: str,
    options: dict,
):
    async with async_session() as db:
        try:
            await _update_task_progress(db, task_id, {"stage": "checking", "message": "正在检查环境配置和系统识别结果"})

            environments = list((await db.execute(
                select(EnvironmentConfig)
                .where(EnvironmentConfig.project_id == project_id)
                .order_by(EnvironmentConfig.is_default.desc(), EnvironmentConfig.created_at.asc())
            )).scalars().all())
            if not environments:
                await _update_task_status(db, task_id, "失败", "尚未配置测试环境，请先在「环境配置」添加环境和账号")
                return

            env_context = []
            valid_environment_ids: set[str] = set()
            for env in environments:
                target_url = _target_url(env)
                if not target_url:
                    continue
                accounts = list((await db.execute(
                    select(TestAccount)
                    .where(TestAccount.environment_id == env.id)
                    .order_by(TestAccount.created_at.asc())
                )).scalars().all())
                if not accounts:
                    continue
                valid_environment_ids.add(env.id)
                env_context.append({
                    "environmentId": env.id,
                    "environmentName": env.name,
                    "environmentType": env.environment_type or "Web",
                    "targetUrl": target_url,
                    "roles": sorted({(item.role or item.name or "未命名角色").strip() for item in accounts}),
                    "accountCount": len(accounts),
                    "notes": env.notes or "",
                })

            if not env_context:
                await _update_task_status(db, task_id, "失败", "没有可用于反推需求的环境账号，请确保环境配置有访问地址且至少绑定一个账号")
                return

            snapshot_rows = list((await db.execute(
                select(UISnapshot)
                .where(UISnapshot.project_id == project_id, UISnapshot.status == "成功")
                .order_by(UISnapshot.created_at.desc())
            )).scalars().all())
            snapshot_row = next((item for item in snapshot_rows if item.environment_id in valid_environment_ids), None)
            if not snapshot_row:
                await _update_task_status(db, task_id, "失败", "暂无成功的系统识别结果，请先在「环境配置」执行识别系统后再反推需求")
                return

            try:
                snapshot = json.loads(snapshot_row.snapshot_json or "{}")
            except json.JSONDecodeError:
                snapshot = {}

            context = {
                "reverseOptions": {
                    "scope": options.get("scope") or "recognized",
                    "testTarget": options.get("testTarget") or "冒烟测试",
                    "writeMode": options.get("writeMode") or "append",
                    "maxPages": int(options.get("maxPages") or 20),
                    "maxRequirements": int(options.get("maxRequirements") or 30),
                    "keywords": options.get("keywords") or "",
                },
                "environmentGate": env_context,
                "recognitionEvidence": _compact_reverse_snapshot(snapshot, int(options.get("maxPages") or 20)),
            }

            await _update_task_progress(db, task_id, {"stage": "generating", "message": "AI 正在基于系统识别结果反推候选需求"})
            requirements = await AIService().reverse_requirements(
                json.dumps(context, ensure_ascii=False),
                user_id,
            )
            max_requirements = int(options.get("maxRequirements") or 30)
            requirements = requirements[:max_requirements]
            if not requirements:
                await _update_task_status(db, task_id, "失败", "AI 未返回有效的反推需求，请检查系统识别结果是否包含菜单、页面或元素信息")
                return

            write_mode = options.get("writeMode") or "append"
            await invalidate_after_requirements(db, project_id, "AI 反推需求已写入，后续数据需重新生成")
            existing = list((await db.execute(select(Requirement).where(Requirement.project_id == project_id))).scalars().all())
            if write_mode == "overwrite":
                await db.execute(delete(Requirement).where(Requirement.project_id == project_id))
                start_index = 1
            else:
                start_index = len(existing) + 1

            for idx, req in enumerate(requirements, start_index):
                question = req.get("question", "")
                db.add(Requirement(
                    id=str(uuid.uuid4()),
                    req_id=f"REQ_{idx:03d}",
                    project_id=project_id,
                    module=req.get("module", ""),
                    feature=req.get("feature", ""),
                    source="系统识别反推",
                    risk=req.get("risk", "中"),
                    rule=req.get("rule", ""),
                    question=question,
                    clarification_status=default_clarification_status(question),
                    review_status="待评审",
                ))
            await db.commit()
            await _update_task_progress(db, task_id, {
                "stage": "done",
                "message": f"已反推 {len(requirements)} 条候选需求",
                "count": len(requirements),
                "writeMode": write_mode,
            })
            await _update_task_status(db, task_id, "成功")
        except Exception as e:
            await db.rollback()
            logger.exception("run_reverse_requirements failed")
            await _update_task_status(db, task_id, "失败", _friendly_error(e, "AI反推需求"))

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

            image_content = await describe_requirement_images(list(files), user_id)
            if image_content:
                file_content = f"{file_content}\n---\n{image_content}"

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

            await invalidate_after_requirements(db, project_id, "需求已重新解析，下游数据已失效")
            await db.execute(delete(Requirement).where(Requirement.project_id == project_id))

            # 重新编号，确保 req_id 唯一
            for idx, req in enumerate(requirements):
                question = req.get("question", "")
                db.add(Requirement(
                    id=str(uuid.uuid4()),
                    req_id=f"REQ_{idx + 1:03d}",
                    project_id=project_id,
                    module=req["module"],
                    feature=req["feature"],
                    source=req.get("source", ""),
                    risk=req.get("risk", "中"),
                    rule=req.get("rule", ""),
                    question=question,
                    clarification_status=default_clarification_status(question),
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
                select(Requirement).where(
                    Requirement.project_id == project_id,
                    Requirement.review_status == "已通过",
                    Requirement.validity_status == VALID,
                )
            )
            requirements = result.scalars().all()
            if not requirements:
                await _update_task_status(db, task_id, "失败", "没有已评审通过的需求，无法生成测试点。请先在「需求列表」完成需求评审")
                return
            unresolved_count = sum(1 for item in requirements if not is_clarification_resolved(item.question, item.clarification_status, item.clarification_answer))
            if unresolved_count:
                await _update_task_status(db, task_id, "失败", f"还有 {unresolved_count} 条需求存在待确认问题，请先处理确认结论")
                return
            payload_batches = requirement_batches(requirements)
            await _update_task_progress(db, task_id, {
                "stage": "generating",
                "message": f"正在生成测试点：共 {len(requirements)} 条已评审需求，拆分为 {len(payload_batches)} 批",
                "totalRequirements": len(requirements),
                "totalBatches": len(payload_batches),
                "finishedBatches": 0,
                "generatedItems": 0,
            })
            points = []
            counters: dict[str, int] = {}
            replaced_old_points = False
            for batch_index, payload in enumerate(payload_batches, start=1):
                payload_items = json.loads(payload)
                await _update_task_progress(db, task_id, {
                    "stage": "generating",
                    "message": f"正在生成第 {batch_index}/{len(payload_batches)} 批测试点",
                    "totalRequirements": len(requirements),
                    "totalBatches": len(payload_batches),
                    "finishedBatches": batch_index - 1,
                    "currentBatchItems": len(payload_items),
                    "generatedItems": len(points),
                })
                batch_points = await ai_service.generate_test_points(payload, user_id)
                batch_requirement_ids = {item["requirementId"] for item in payload_items}
                validate_references(batch_points, "requirementId", batch_requirement_ids)
                validate_reference_values(
                    batch_points,
                    "requirementId",
                    {item["requirementId"]: item for item in payload_items},
                    ("module",),
                )
                points.extend(batch_points)
                if not replaced_old_points:
                    await invalidate_after_test_points(db, project_id, "测试点已重新生成，下游数据已失效")
                    await db.execute(delete(TestPoint).where(TestPoint.project_id == project_id))
                    await db.commit()
                    replaced_old_points = True
                for pt in batch_points:
                    db.add(TestPoint(
                        id=str(uuid.uuid4()),
                        point_code=_next_code(counters, pt["module"], "TP"),
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
                await _update_task_progress(db, task_id, {
                    "stage": "generating",
                    "message": f"第 {batch_index}/{len(payload_batches)} 批测试点已生成",
                    "totalRequirements": len(requirements),
                    "totalBatches": len(payload_batches),
                    "finishedBatches": batch_index,
                    "generatedItems": len(points),
                })
            logger.info(f"generate_test_points: type={type(points).__name__}, len={len(points) if isinstance(points, (list, dict)) else 'N/A'}")

            if not points:
                logger.error(f"generate_test_points: invalid result, type={type(points).__name__}, preview={str(points)[:500]}")
                await _update_task_status(db, task_id, "失败", "AI 未返回有效的测试点数据，请检查模型配置或需求数据后重试")
                return

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
                select(TestPoint).where(
                    TestPoint.project_id == project_id,
                    TestPoint.review_status == "已通过",
                    TestPoint.validity_status == VALID,
                )
            )
            points = tp_result.scalars().all()
            if not points:
                await _update_task_status(db, task_id, "失败", "没有已评审通过的测试点，无法生成测试用例。请先在「测试点」完成测试点评审")
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
            payload_batches = test_point_batches(points, requirements_by_id, environment_context)
            await _update_task_progress(db, task_id, {
                "stage": "generating",
                "message": f"正在生成测试用例：共 {len(points)} 个已评审测试点，拆分为 {len(payload_batches)} 批",
                "totalPoints": len(points),
                "totalBatches": len(payload_batches),
                "finishedBatches": 0,
                "generatedItems": 0,
            })
            case_counters: dict[str, int] = {}
            replaced_old_cases = False
            for batch_index, payload in enumerate(payload_batches, start=1):
                payload_items = json.loads(payload)
                await _update_task_progress(db, task_id, {
                    "stage": "generating",
                    "message": f"正在生成第 {batch_index}/{len(payload_batches)} 批测试用例",
                    "totalPoints": len(points),
                    "totalBatches": len(payload_batches),
                    "finishedBatches": batch_index - 1,
                    "currentBatchItems": len(payload_items),
                    "generatedItems": len(cases),
                })
                batch_cases = await ai_service.generate_test_cases(payload, user_id)
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
                if not replaced_old_cases:
                    await invalidate_after_test_cases(db, project_id, "测试用例已重新生成，下游数据已失效")
                    await db.execute(delete(TestCase).where(TestCase.project_id == project_id))
                    await db.commit()
                    replaced_old_cases = True
                for c in batch_cases:
                    tp_id = c["testPointId"]
                    matched_point = next(tp for tp in points if tp.id == tp_id)
                    requirement = requirements_by_id.get(matched_point.requirement_id)
                    point_payload = next((item for item in payload_items if item["testPointId"] == tp_id), None)
                    automation_value, automation_reason = review_generated_case_automation(c, point_payload=point_payload)

                    db.add(TestCase(
                        id=str(uuid.uuid4()),
                        project_id=project_id,
                        case_code=_next_code(case_counters, matched_point.module, "TC"),
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
                        automation=automation_value,
                        remark=automation_reason,
                    ))
                await db.commit()
                await _update_task_progress(db, task_id, {
                    "stage": "generating",
                    "message": f"第 {batch_index}/{len(payload_batches)} 批测试用例已生成",
                    "totalPoints": len(points),
                    "totalBatches": len(payload_batches),
                    "finishedBatches": batch_index,
                    "generatedItems": len(cases),
                })
            logger.info(f"generate_test_cases: type={type(cases).__name__}, len={len(cases) if isinstance(cases, (list, dict)) else 'N/A'}")

            if not cases:
                logger.error(f"generate_test_cases: invalid result, type={type(cases).__name__}, preview={str(cases)[:500]}")
                await _update_task_status(db, task_id, "失败", "AI 未返回有效的测试用例数据，请检查模型配置或测试点数据后重试")
                return

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
                    TestCase.automation == "是",
                    TestCase.review_status == "已通过",
                    TestCase.validity_status == VALID,
                ).order_by(TestCase.created_at.asc())
            )
            test_cases = tc_result.scalars().all()
            if not test_cases:
                await _update_task_status(db, task_id, "失败", "没有已评审通过且适合自动化的测试用例，无法生成脚本。请先在「测试用例」完成用例评审")
                return
            validate_persisted_traceability(cases=test_cases)
            validate_case_runtime_fields(test_cases, for_automation=True)
            assert_cases_script_ready(test_cases)

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
                batch_cases_by_id = {item.id: item for item in test_cases if item.id in batch_case_ids}
                for item in batch_scripts:
                    quality_error = generated_script_error_message(item.get("code", ""), batch_cases_by_id[item["testCaseId"]])
                    if quality_error:
                        raise ValueError(quality_error)
                scripts.extend(batch_scripts)
                if batch_index == 1:
                    await invalidate_after_scripts(db, project_id, "自动化脚本已重新生成，执行结果已失效")
                    await db.execute(delete(AutomationScript).where(AutomationScript.project_id == project_id))
                    await db.commit()
                for s in batch_scripts:
                    tc_id = s.get("testCaseId", "")
                    matched_tc = next(tc for tc in test_cases if tc.id == tc_id)
                    abbr = _to_eng_abbr(matched_tc.module)
                    db.add(AutomationScript(
                        id=str(uuid.uuid4()),
                        project_id=project_id,
                        test_case_id=matched_tc.id,
                        script_code=f"SC_{abbr}_{len(scripts):03d}",
                        script_type=s.get("scriptType", "UI"),
                        framework=s.get("framework", "Playwright"),
                        language=s.get("language", "Python"),
                        code=s.get("code", ""),
                        status="未测试",
                        generated_by_ai=True,
                    ))
                await db.commit()
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


@router.post("/projects/{project_id}/ai/reverse-requirements")
async def reverse_requirements(
    project_id: str,
    data: ReverseRequirementsRequest,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await verify_project_owner(db, project_id, user["sub"])
    config_check = await check_config_for_task("AI反推需求", user["sub"])
    if not config_check["configured"]:
        raise HTTPException(status_code=400, detail=config_check["message"])

    if data.writeMode not in {"append", "overwrite"}:
        raise HTTPException(status_code=400, detail="写入规则无效，只能选择追加或覆盖")
    if data.scope not in {"recognized", "default", "all", "keywords"}:
        raise HTTPException(status_code=400, detail="反推范围无效")

    task = AITask(
        id=str(uuid.uuid4()),
        project_id=project_id,
        type="AI反推需求",
        status="执行中",
        model_name="AI",
    )
    db.add(task)
    await db.commit()

    background_tasks.add_task(
        run_reverse_requirements,
        task.id,
        project_id,
        user["sub"],
        data.model_dump(),
    )
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
    requirements = req_result.scalars().all()
    if not requirements:
        raise HTTPException(status_code=400, detail="需求列表为空，请先在「需求列表」页面完成需求解析")
    invalid_count = sum(1 for item in requirements if (item.validity_status or VALID) != VALID)
    if invalid_count:
        raise HTTPException(status_code=400, detail=f"还有 {invalid_count} 条需求已失效，请先重新解析需求")
    unreviewed_count = sum(1 for item in requirements if item.review_status != "已通过")
    if unreviewed_count:
        raise HTTPException(status_code=400, detail=f"还有 {unreviewed_count} 条需求未评审通过，请先完成需求评审")
    unresolved_count = sum(1 for item in requirements if not is_clarification_resolved(item.question, item.clarification_status, item.clarification_answer))
    if unresolved_count:
        raise HTTPException(status_code=400, detail=f"还有 {unresolved_count} 条需求存在待确认问题，请先处理确认结论")

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
    test_points = tp_result.scalars().all()
    if not test_points:
        raise HTTPException(status_code=400, detail="测试点列表为空，请先在「测试点」页面生成测试点")
    invalid_count = sum(1 for item in test_points if (item.validity_status or VALID) != VALID)
    if invalid_count:
        raise HTTPException(status_code=400, detail=f"还有 {invalid_count} 个测试点已失效，请先重新生成测试点")
    unreviewed_count = sum(1 for item in test_points if item.review_status != "已通过")
    if unreviewed_count:
        raise HTTPException(status_code=400, detail=f"还有 {unreviewed_count} 个测试点未评审通过，请先完成测试点评审")
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
    automatable_cases = tc_result.scalars().all()
    if not automatable_cases:
        raise HTTPException(status_code=400, detail="没有适合自动化的测试用例")
    invalid_count = sum(1 for item in automatable_cases if (item.validity_status or VALID) != VALID)
    if invalid_count:
        raise HTTPException(status_code=400, detail=f"还有 {invalid_count} 条适合自动化的用例已失效，请先重新生成测试用例")
    unreviewed_count = sum(1 for item in automatable_cases if item.review_status != "已通过")
    if unreviewed_count:
        raise HTTPException(status_code=400, detail=f"还有 {unreviewed_count} 条适合自动化的用例未评审通过，请先完成用例评审")
    try:
        validate_persisted_traceability(cases=automatable_cases)
        validate_case_runtime_fields(automatable_cases, for_automation=True)
        assert_cases_script_ready(automatable_cases)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
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
