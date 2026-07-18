"""Server-sent-event endpoints for incremental AI generation."""

import json
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session, get_db
from app.models.file_asset import FileAsset
from app.models.requirement import Requirement
from app.models.test_point import TestPoint
from app.models.test_case import TestCase
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
    to_eng_abbr as _to_eng_abbr,
)
from app.services.environment_service import EnvironmentService
from app.services.requirement_clarification import default_clarification_status, is_clarification_resolved
from app.services.ui_recognition_service import UIRecognitionService
from app.schemas.ai_output import validate_ai_output
from app.utils import verify_project_owner

logger = logging.getLogger(__name__)
router = APIRouter()

# ─── 流式生成（SSE） ───────────────────────────────────────────────

from fastapi.responses import StreamingResponse


async def _stream_generate_test_points(task_id: str, project_id: str, user_id: str):
    """流式生成测试点，每批写库后通过 SSE 推送。"""
    ai_service = AIService()
    async with async_session() as db:
        try:
            result = await db.execute(
                select(Requirement).where(Requirement.project_id == project_id)
            )
            requirements = result.scalars().all()
            if not requirements:
                yield f"data: {json.dumps({'event': 'error', 'message': '需求列表为空'})}\n\n"
                return
            unreviewed_count = sum(1 for item in requirements if item.review_status != "已通过")
            if unreviewed_count:
                yield f"data: {json.dumps({'event': 'error', 'message': f'还有 {unreviewed_count} 条需求未评审通过，请先完成需求评审'}, ensure_ascii=False)}\n\n"
                return
            unresolved_count = sum(1 for item in requirements if not is_clarification_resolved(item.question, item.clarification_status, item.clarification_answer))
            if unresolved_count:
                yield f"data: {json.dumps({'event': 'error', 'message': f'还有 {unresolved_count} 条需求存在待确认问题，请先处理确认结论'}, ensure_ascii=False)}\n\n"
                return

            all_items: list[dict] = []
            for payload in requirement_batches(requirements):
                batch_items: list[dict] = []
                async for batch in ai_service.generate_stream(payload, "测试点生成", user_id, batch_size=5):
                    if not batch:
                        yield f"data: {json.dumps({'event': 'receiving'}, ensure_ascii=False)}\n\n"
                        continue
                    batch_items.extend(batch)
                payload_items = json.loads(payload)
                allowed_ids = {item["requirementId"] for item in payload_items}
                validate_references(batch_items, "requirementId", allowed_ids)
                validate_reference_values(
                    batch_items,
                    "requirementId",
                    {item["requirementId"]: item for item in payload_items},
                    ("module",),
                )
                all_items.extend(batch_items)

            from sqlalchemy import delete
            await db.execute(delete(TestPoint).where(TestPoint.project_id == project_id))
            for (point_code, _), pt in zip(_module_counter(all_items, "TP"), all_items):
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

            total_saved = 0
            for index in range(0, len(all_items), 5):
                batch_count = len(all_items[index:index + 5])
                total_saved += batch_count
                yield f"data: {json.dumps({'event': 'progress', 'count': total_saved, 'batch': batch_count}, ensure_ascii=False)}\n\n"

            yield f"data: {json.dumps({'event': 'done', 'total': total_saved}, ensure_ascii=False)}\n\n"

        except Exception as e:
            await db.rollback()
            logger.exception(f"stream_generate_test_points failed: task_id={task_id}")
            yield f"data: {json.dumps({'event': 'error', 'message': _friendly_error(e, '测试点生成')}, ensure_ascii=False)}\n\n"


@router.get("/projects/{project_id}/ai/stream-test-points")
async def stream_test_points(
    project_id: str,
    user: dict = Depends(get_current_user_sse),
    db: AsyncSession = Depends(get_db),
):
    await verify_project_owner(db, project_id, user["sub"])

    # 检查需求数据
    req_result = await db.execute(
        select(Requirement).where(Requirement.project_id == project_id)
    )
    if not req_result.scalars().first():
        raise HTTPException(status_code=400, detail="需求列表为空，请先在「需求列表」页面完成需求解析")

    # 检查配置
    config_check = await check_config_for_task("测试点生成", user["sub"])
    if not config_check["configured"]:
        raise HTTPException(status_code=400, detail=config_check["message"])

    return StreamingResponse(
        _stream_generate_test_points("", project_id, user["sub"]),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


async def _stream_generate_test_cases(task_id: str, project_id: str, user_id: str):
    """生成测试用例：非流式调用 LLM，完成后分批写库并通过 SSE 推送进度。"""
    ai_service = AIService()
    async with async_session() as db:
        try:
            tp_result = await db.execute(
                select(TestPoint).where(TestPoint.project_id == project_id)
            )
            points = tp_result.scalars().all()
            if not points:
                yield f"data: {json.dumps({'event': 'error', 'message': '测试点列表为空，请先生成测试点'})}\n\n"
                return

            if any(not point.requirement_id for point in points):
                yield f"data: {json.dumps({'event': 'error', 'message': '存在未关联需求的旧测试点，请先重新生成测试点'}, ensure_ascii=False)}\n\n"
                return
            requirement_result = await db.execute(
                select(Requirement).where(Requirement.project_id == project_id)
            )
            requirements_by_id = {item.id: item for item in requirement_result.scalars().all()}
            environment_context = await EnvironmentService(db).get_generation_context(project_id, user_id)

            # 通知前端：正在接收 LLM 响应
            yield f"data: {json.dumps({'event': 'receiving'}, ensure_ascii=False)}\n\n"

            items: list[dict] = []
            for payload in test_point_batches(points, requirements_by_id, environment_context):
                response_text = await ai_service._call_llm(payload, "用例生成", user_id, max_tokens=16000)
                batch_items = validate_ai_output("用例生成", ai_service._parse_json_response(response_text))
                payload_items = json.loads(payload)
                allowed_ids = {item["testPointId"] for item in payload_items}
                validate_references(batch_items, "testPointId", allowed_ids)
                validate_reference_values(
                    batch_items,
                    "testPointId",
                    {item["testPointId"]: item for item in payload_items},
                    ("module", "priority"),
                )
                validate_case_environment(batch_items, environment_context)
                items.extend(batch_items)

            if not items:
                yield f"data: {json.dumps({'event': 'error', 'message': 'AI 未返回有效的测试用例数据'}, ensure_ascii=False)}\n\n"
                return

            # 全量校验已经完成，删除与重建在一个事务中提交。
            from sqlalchemy import delete
            await db.execute(delete(TestCase).where(TestCase.project_id == project_id))
            module_counter: dict[str, int] = {}
            module_map = {
                "用户管理": "USER", "订单处理": "ORDER", "菜单": "MENU",
                "客户管理": "CUST", "登录": "LOGIN", "系统": "SYS",
                "权限控制": "AUTH", "数据查询": "DATA", "系统配置": "CFG",
                "消息通知": "MSG", "文件管理": "FILE", "报表统计": "RPT",
                "接口交互": "API", "数据导入导出": "IMP", "促销活动": "PROMO",
            }
            points_by_id = {item.id: item for item in points}
            for c in items:
                matched_point = points_by_id[c["testPointId"]]
                requirement = requirements_by_id.get(matched_point.requirement_id)
                mod = matched_point.module
                module_counter[mod] = module_counter.get(mod, 0) + 1
                prefix = module_map.get(mod)
                if not prefix:
                    import re as _re
                    prefix = _re.sub(r'[^A-Z]', '', mod.upper())[:4] or "TC"
                db.add(TestCase(
                    id=str(uuid.uuid4()),
                    project_id=project_id,
                    case_code=f"TC_{prefix}_{module_counter[mod]:03d}",
                    test_point_id=matched_point.id,
                    requirement_id=matched_point.requirement_id,
                    environment_id=c["environmentId"],
                    module=mod,
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

            total_saved = 0
            batch_size = 5
            for i in range(0, len(items), batch_size):
                batch_count = len(items[i:i + batch_size])
                total_saved += batch_count
                yield f"data: {json.dumps({'event': 'progress', 'count': total_saved, 'batch': batch_count}, ensure_ascii=False)}\n\n"

            logger.info(f"stream_test_cases: done, total_saved={total_saved}")
            yield f"data: {json.dumps({'event': 'done', 'total': total_saved}, ensure_ascii=False)}\n\n"

        except Exception as e:
            await db.rollback()
            logger.error(f"stream_test_cases: ERROR {e}")
            logger.exception(f"stream_generate_test_cases failed: task_id={task_id}")
            yield f"data: {json.dumps({'event': 'error', 'message': _friendly_error(e, '用例生成')}, ensure_ascii=False)}\n\n"


@router.get("/projects/{project_id}/ai/stream-test-cases")
async def stream_test_cases(
    project_id: str,
    user: dict = Depends(get_current_user_sse),
    db: AsyncSession = Depends(get_db),
):
    await verify_project_owner(db, project_id, user["sub"])

    # 检查测试点数据
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

    return StreamingResponse(
        _stream_generate_test_cases("", project_id, user["sub"]),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ─── 需求解析流式 ──────────────────────────────────────────────────

async def _stream_parse_requirements(project_id: str, user_id: str):
    """流式需求解析，每批写库后通过 SSE 推送。"""
    logger.info(f"stream_parse_requirements: project_id={project_id}, user_id={user_id}")
    ai_service = AIService()
    async with async_session() as db:
        try:
            # 读取文件内容
            file_result = await db.execute(
                select(FileAsset).where(FileAsset.project_id == project_id)
            )
            files = file_result.scalars().all()
            if not files:
                logger.warning("stream_parse_requirements: no files found")
                yield f"data: {json.dumps({'event': 'error', 'message': '没有上传文件'})}\n\n"
                return

            logger.info(f"stream_parse_requirements: found {len(files)} files")

            # 标记文件为解析中
            for f in files:
                f.parse_status = "解析中"
            await db.commit()

            # 读取所有文件内容
            content_parts = []
            for f in files:
                try:
                    from app.services.document_service import DocumentService
                    doc_service = DocumentService(db)
                    text = await doc_service.get_content(f.id)
                    if text:
                        content_parts.append(f"=== 文件: {f.name} ===\n{text}")
                except Exception as e:
                    logger.warning(f"Failed to read file {f.name}: {e}")

            if not content_parts:
                for f in files:
                    f.parse_status = "失败"
                    f.parse_error = "无法读取文件内容"
                await db.commit()
                yield f"data: {json.dumps({'event': 'error', 'message': '无法读取文件内容'})}\n\n"
                return

            file_content = "\n\n".join(content_parts)
            logger.info(f"stream_parse_requirements: file_content length={len(file_content)}")

            user_prompt = f"请对以下文档内容进行专业的需求分析。\n\n文档内容：\n\n{file_content}"
            logger.info(f"stream_parse_requirements: starting LLM stream...")

            all_items: list[dict] = []
            async for batch in ai_service.generate_stream(user_prompt, "需求解析", user_id, batch_size=5):
                if not batch:
                    # 空 batch = LLM 仍在生成中
                    yield f"data: {json.dumps({'event': 'receiving'}, ensure_ascii=False)}\n\n"
                    continue
                logger.info(f"stream_parse_requirements: received batch of {len(batch)} items")
                all_items.extend(batch)

            from sqlalchemy import delete
            await db.execute(delete(Requirement).where(Requirement.project_id == project_id))
            for index, req in enumerate(all_items, 1):
                question = req.get("question", "")
                db.add(Requirement(
                    id=str(uuid.uuid4()),
                    req_id=f"REQ_{index:03d}",
                    project_id=project_id,
                    module=req.get("module", ""),
                    feature=req.get("feature", ""),
                    source=req.get("source", ""),
                    risk=req.get("risk", "中"),
                    rule=req.get("rule", ""),
                    question=question,
                    clarification_status=default_clarification_status(question),
                ))
            # 标记文件为已完成
            for f in files:
                f.parse_status = "已完成"
                f.parse_error = ""
            await db.commit()

            total_saved = 0
            for index in range(0, len(all_items), 5):
                batch_count = len(all_items[index:index + 5])
                total_saved += batch_count
                yield f"data: {json.dumps({'event': 'progress', 'count': total_saved, 'batch': batch_count}, ensure_ascii=False)}\n\n"

            yield f"data: {json.dumps({'event': 'done', 'total': total_saved}, ensure_ascii=False)}\n\n"

        except Exception as e:
            await db.rollback()
            logger.exception(f"stream_parse_requirements failed: project_id={project_id}")
            yield f"data: {json.dumps({'event': 'error', 'message': _friendly_error(e, '需求解析')}, ensure_ascii=False)}\n\n"


@router.get("/projects/{project_id}/ai/stream-parse-requirements")
async def stream_parse_requirements(
    project_id: str,
    user: dict = Depends(get_current_user_sse),
    db: AsyncSession = Depends(get_db),
):
    await verify_project_owner(db, project_id, user["sub"])

    # 检查文件
    file_result = await db.execute(
        select(FileAsset).where(FileAsset.project_id == project_id)
    )
    if not file_result.scalars().first():
        raise HTTPException(status_code=400, detail="没有上传文件，请先在「输入资料」页面上传文件")

    # 检查配置
    config_check = await check_config_for_task("需求解析", user["sub"])
    if not config_check["configured"]:
        raise HTTPException(status_code=400, detail=config_check["message"])

    return StreamingResponse(
        _stream_parse_requirements(project_id, user["sub"]),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ─── 脚本生成流式 ──────────────────────────────────────────────────

async def _stream_generate_scripts(project_id: str, user_id: str):
    """流式生成自动化脚本，每批写库后通过 SSE 推送。"""
    from app.models.automation_script import AutomationScript
    ai_service = AIService()
    async with async_session() as db:
        try:
            # 获取适合自动化的测试用例
            result = await db.execute(
                select(TestCase).where(
                    TestCase.project_id == project_id,
                    TestCase.automation == "是"
                )
            )
            test_cases = result.scalars().all()
            if not test_cases:
                yield f"data: {json.dumps({'event': 'error', 'message': '没有适合自动化的测试用例'})}\n\n"
                return
            validate_persisted_traceability(cases=test_cases)
            validate_case_runtime_fields(test_cases, for_automation=True)

            ui_context = await UIRecognitionService(db).latest_context_by_project(project_id, user_id)
            all_items: list[dict] = []
            for payload in test_case_batches(test_cases, ui_context):
                batch_items: list[dict] = []
                async for batch in ai_service.generate_stream(payload, "脚本生成", user_id, batch_size=3):
                    if not batch:
                        yield f"data: {json.dumps({'event': 'receiving'}, ensure_ascii=False)}\n\n"
                        continue
                    batch_items.extend(batch)
                allowed_ids = {item["testCaseId"] for item in json.loads(payload)}
                validate_references(batch_items, "testCaseId", allowed_ids)
                all_items.extend(batch_items)

            from sqlalchemy import delete
            await db.execute(delete(AutomationScript).where(AutomationScript.project_id == project_id))
            for index, ai_script in enumerate(all_items, 1):
                tc_id = ai_script["testCaseId"]
                matched_tc = next(tc for tc in test_cases if tc.id == tc_id)
                abbr = _to_eng_abbr(matched_tc.module or "")
                db.add(AutomationScript(
                    id=str(uuid.uuid4()),
                    project_id=project_id,
                    test_case_id=matched_tc.id,
                    script_code=f"SC_{abbr}_{index:03d}",
                    script_type=ai_script.get("scriptType", "UI"),
                    framework=ai_script.get("framework", "Playwright"),
                    language=ai_script.get("language", "Python"),
                    code=ai_script["code"],
                    status="未测试",
                    generated_by_ai=True,
                ))
            await db.commit()

            total_saved = 0
            for index in range(0, len(all_items), 3):
                batch_count = len(all_items[index:index + 3])
                total_saved += batch_count
                yield f"data: {json.dumps({'event': 'progress', 'count': total_saved, 'batch': batch_count}, ensure_ascii=False)}\n\n"

            yield f"data: {json.dumps({'event': 'done', 'total': total_saved}, ensure_ascii=False)}\n\n"

        except Exception as e:
            await db.rollback()
            logger.exception(f"stream_generate_scripts failed: project_id={project_id}")
            yield f"data: {json.dumps({'event': 'error', 'message': _friendly_error(e, '脚本生成')}, ensure_ascii=False)}\n\n"


@router.get("/projects/{project_id}/ai/stream-scripts")
async def stream_scripts(
    project_id: str,
    user: dict = Depends(get_current_user_sse),
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

    return StreamingResponse(
        _stream_generate_scripts(project_id, user["sub"]),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
