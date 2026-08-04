import uuid
import logging
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.automation_script import AutomationScript
from app.models.test_case import TestCase
from app.models.execution_run import ExecutionRun
from app.models.environment_config import TestAccount
from app.models.defect import Defect
from app.routers.deps import get_current_user, get_automation_service, get_project_service
from app.routers.defects import _next_defect_code
from app.services.automation_service import AutomationService
from app.services.project_service import ProjectService
from app.services.ai_service import AIService, check_config_for_task
from app.services.ai_input_builder import test_case_batches, validate_case_runtime_fields, validate_persisted_traceability, validate_references
from app.services.environment_service import EnvironmentService
from app.services.script_runner import LocalScriptRunner
from app.services.script_generation_quality import assert_cases_script_ready, generated_script_error_message
from app.services.script_quality import validate_script_covers_test_case
from app.services.ui_recognition_service import UIRecognitionService
from app.services.data_lineage_service import VALID, invalidate_after_scripts
from app.services.export_format import format_api_datetime
from app.utils import model_to_dict

logger = logging.getLogger(__name__)
router = APIRouter()
ai_service = AIService()
script_runner = LocalScriptRunner()


class ExecuteScriptRequest(BaseModel):
    environmentId: str
    accountId: str | None = None
    headed: bool = False
    slowMo: int | None = None


def _execution_result(run: ExecutionRun, script: AutomationScript, defect_code: str | None = None) -> dict:
    return {
        "executionRunId": run.id,
        "scriptId": script.id,
        "status": run.status,
        "output": run.output or "",
        "error": run.error or None,
        "autoCreatedDefectCode": defect_code,
        "executedAt": format_api_datetime(run.finished_at),
        "startedAt": format_api_datetime(run.started_at) or None,
        "finishedAt": format_api_datetime(run.finished_at) or None,
        "durationSeconds": _duration_seconds(run),
    }


def _duration_seconds(run: ExecutionRun) -> float | None:
    if not run.started_at or not run.finished_at:
        return None
    return round((run.finished_at - run.started_at).total_seconds(), 3)


def _timeout_seconds(snapshot: dict) -> int:
    try:
        return int(snapshot.get("timeoutSeconds") or 30)
    except (TypeError, ValueError):
        return 30


async def _maybe_create_defect_for_failure(
    *,
    db: AsyncSession,
    project_id: str,
    script: AutomationScript,
    test_case: TestCase,
    run: ExecutionRun,
    snapshot: dict,
    reporter: str,
    screenshot_url: str = "",
) -> str | None:
    """脚本执行失败后自动创建一条缺陷，返回缺陷编号；已存在未关闭缺陷时跳过。

    去重：同一脚本若已存在一条「未关闭/未验证/未修复」状态的缺陷，则不重复
    创建，避免反复执行失败刷屏。字段对齐：module / steps_to_reproduce /
    expected_result 直接取自测试用例，确保缺陷页展示的字段与用例数据一致。
    screenshot_url 写入执行失败那一刻的截图（若有）。
    """
    existing = await db.execute(
        select(Defect.id).where(
            Defect.script_id == script.id,
            Defect.status.notin_(["已关闭", "已验证", "已修复"]),
        ).limit(1)
    )
    if existing.scalar_one_or_none():
        return None

    # 从环境快照里提取环境名 + 测试地址，写入 environment_info 便于复现
    env_parts: list[str] = []
    if snapshot.get("environmentName"):
        env_parts.append(str(snapshot["environmentName"]))
    base_url = snapshot.get("WEB_BASE_URL") or snapshot.get("APP_BASE_URL") or snapshot.get("BASE_URL")
    if base_url:
        env_parts.append(str(base_url))
    environment_info = " | ".join(env_parts)

    case_title = (test_case.title or "未命名用例").strip()
    title = f"脚本执行失败：{case_title}"[:200]
    error_text = (run.error or "执行失败，未捕获到具体错误信息。").strip()

    # 字段对齐：从测试用例补齐 module / 复现步骤 / 期望结果，让缺陷数据与页面字段一致
    module_name = (test_case.module or "").strip()
    reproduce_parts = []
    if (test_case.precondition or "").strip():
        reproduce_parts.append("前置条件：" + test_case.precondition.strip())
    if (test_case.steps or "").strip():
        reproduce_parts.append("测试步骤：" + test_case.steps.strip())
    if environment_info:
        reproduce_parts.append("执行环境：" + environment_info)
    steps_to_reproduce = "\n".join(reproduce_parts)
    expected_result = (test_case.expected_result or "").strip()

    defect_code = await _next_defect_code(project_id, db)
    defect = Defect(
        project_id=project_id,
        defect_code=defect_code,
        title=title,
        severity="一般",
        priority="P1",
        status="新建",
        module=module_name,
        category="功能缺陷",
        source="自动化",
        test_case_id=test_case.id,
        script_id=script.id,
        execution_run_id=run.id,
        steps_to_reproduce=steps_to_reproduce,
        expected_result=expected_result,
        actual_result=error_text,
        environment_info=environment_info,
        reporter=reporter or "系统",
        description=f"由脚本执行自动创建。执行记录 {run.id}。",
        screenshot_url=screenshot_url,
        found_at=run.finished_at or datetime.now(timezone.utc),
    )
    db.add(defect)
    await db.commit()
    return defect_code


def _to_eng_abbr(module: str) -> str:
    """模块名转英文缩写"""
    mapping = {
        "用户管理": "USER", "订单处理": "ORDER", "菜单": "MENU",
        "客户管理": "CUST", "登录": "LOGIN", "系统": "SYS",
        "权限": "PERM", "配置": "CONF", "报表": "RPT",
        "通知": "NOTI", "审批": "APPR", "数据": "DATA",
    }
    return mapping.get(module, "".join(c for c in module if c.isalpha())[:4].upper() or "MISC")


def _script_code_for_tc(tc, counter: int) -> str:
    module = getattr(tc, "module", "") or ""
    abbr = _to_eng_abbr(module)
    return f"SC_{abbr}_{counter:03d}"


@router.get("/projects/{project_id}/scripts")
async def list_scripts(
    project_id: str,
    user: dict = Depends(get_current_user),
    service: AutomationService = Depends(get_automation_service),
    project_service: ProjectService = Depends(get_project_service),
):
    await project_service._verify_project_owner(project_id, user["sub"])
    return await service.list_scripts(project_id)


@router.get("/scripts/{script_id}")
async def get_script(
    script_id: str,
    user: dict = Depends(get_current_user),
    service: AutomationService = Depends(get_automation_service),
):
    script = await service.get_script(script_id)
    if not script:
        raise HTTPException(status_code=404, detail="Script not found")
    return script


@router.put("/scripts/{script_id}")
async def update_script(
    script_id: str,
    data: dict,
    user: dict = Depends(get_current_user),
    service: AutomationService = Depends(get_automation_service),
):
    script = await service.get_script(script_id)
    if not script:
        raise HTTPException(status_code=404, detail="Script not found")

    # 更新 code
    if "code" in data:
        script = await service.update_script(script_id, data["code"])

    # 更新 reviewStatus
    if "reviewStatus" in data:
        script = await service.review_script(script_id, data["reviewStatus"])

    return script


@router.delete("/scripts/{script_id}")
async def delete_script(
    script_id: str,
    user: dict = Depends(get_current_user),
    service: AutomationService = Depends(get_automation_service),
):
    raise HTTPException(
        status_code=400,
        detail="自动化脚本属于测试链路中间产物，不允许单独删除；如需调整，请修改评审状态或重新生成脚本。",
    )


async def _execution_subject(db: AsyncSession, script_id: str, user_id: str):
    script = (await db.execute(select(AutomationScript).where(
        AutomationScript.id == script_id
    ))).scalar_one_or_none()
    if not script:
        raise HTTPException(status_code=404, detail="脚本不存在")
    project_service = ProjectService(db)
    await project_service._verify_project_owner(script.project_id, user_id)
    test_case = (await db.execute(select(TestCase).where(
        TestCase.id == script.test_case_id
    ))).scalar_one_or_none()
    if not test_case:
        raise HTTPException(status_code=400, detail="脚本未关联有效测试用例")
    return script, test_case


@router.get("/scripts/{script_id}/execution-options")
async def get_execution_options(
    script_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _, test_case = await _execution_subject(db, script_id, user["sub"])
    environments = await EnvironmentService(db).list_by_project(test_case.project_id, user["sub"])
    required_role = test_case.required_role or "无"
    for environment in environments:
        environment["accounts"] = [
            account for account in environment["accounts"]
            if required_role == "无" or (account["role"] or account["name"]) == required_role
        ]
    return {
        "boundEnvironmentId": test_case.environment_id,
        "targetPlatform": test_case.target_platform,
        "testUrl": test_case.test_url,
        "requiredRole": required_role,
        "environments": environments,
    }


@router.post("/scripts/{script_id}/execute")
async def execute_script(
    script_id: str,
    data: ExecuteScriptRequest,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    script, test_case = await _execution_subject(db, script_id, user["sub"])
    if (script.validity_status or VALID) != VALID:
        raise HTTPException(status_code=400, detail=script.invalid_reason or "脚本已失效，请重新生成脚本")
    if (test_case.validity_status or VALID) != VALID:
        raise HTTPException(status_code=400, detail=test_case.invalid_reason or "测试用例已失效，请重新生成测试用例")
    if (script.review_status or "待评审") != "已通过":
        raise HTTPException(status_code=400, detail="脚本未评审通过，不能执行")
    if test_case.environment_id and data.environmentId != test_case.environment_id:
        raise HTTPException(status_code=400, detail="所选环境与测试用例中记录的测试地址不一致")
    required_role = test_case.required_role or "无"
    if required_role == "待配置":
        raise HTTPException(status_code=400, detail="该用例的执行角色仍为待配置，请先重新生成或编辑测试用例")
    if required_role != "无" and not data.accountId:
        raise HTTPException(status_code=400, detail=f"该用例需要选择“{required_role}”角色账号")
    if data.accountId:
        account = (await db.execute(select(TestAccount).where(
            TestAccount.id == data.accountId,
            TestAccount.environment_id == data.environmentId,
        ))).scalar_one_or_none()
        if not account:
            raise HTTPException(status_code=400, detail="所选账号不属于当前测试环境")
        if required_role != "无" and (account.role or account.name) != required_role:
            raise HTTPException(status_code=400, detail=f"所选账号不是“{required_role}”角色")

    variables, snapshot = await EnvironmentService(db).build_runtime_variables(
        data.environmentId, user["sub"], data.accountId
    )
    if variables.get("WEB_BASE_URL"):
        variables.setdefault("TEST_BASE_URL", variables["WEB_BASE_URL"])
        variables.setdefault("BASE_URL", variables["WEB_BASE_URL"])
    elif variables.get("APP_BASE_URL"):
        variables.setdefault("TEST_BASE_URL", variables["APP_BASE_URL"])
        variables.setdefault("BASE_URL", variables["APP_BASE_URL"])
    if (script.language or "").lower() not in {"python", "py"}:
        raise HTTPException(status_code=400, detail="当前执行器只支持 Python 脚本")

    now = datetime.now(timezone.utc)
    run = ExecutionRun(
        id=str(uuid.uuid4()),
        project_id=script.project_id,
        script_id=script.id,
        test_case_id=test_case.id,
        environment_id=data.environmentId,
        account_id=data.accountId,
        status="执行中",
        environment_snapshot=json.dumps(snapshot, ensure_ascii=False),
        started_at=now,
    )
    script.status = "未测试"
    db.add(run)
    await db.commit()
    script_code = script.code or ""
    quality_error = generated_script_error_message(script_code, test_case) if script.generated_by_ai and _is_ui_automation_code(script_code) else ""
    screenshot_path: str | None = None
    if quality_error:
        result_status = "失败"
        output = ""
        error = quality_error
    else:
        result_status = ""
        output = ""
        error = ""
    coverage = validate_script_covers_test_case(script.code or "", test_case)
    if not result_status and script.generated_by_ai and not coverage.ok:
        result_status = "失败"
        output = ""
        error = f"脚本覆盖校验失败：{coverage.error}"
    elif not result_status:
        try:
            result = await script_runner.run_python(
                code=script.code or "",
                variables=variables,
                timeout_seconds=_timeout_seconds(snapshot),
                headed=data.headed,
                slow_mo_ms=data.slowMo or 0,
            )
        except Exception as exc:
            logger.exception("Local script execution crashed")
            result_status = "失败"
            output = ""
            error = f"执行器异常：{str(exc)[:500]}"
        else:
            result_status = result.status
            output = result.output
            error = result.error
            screenshot_path = result.screenshot_path
            if result_status == "通过":
                output = output or f"脚本进程正常结束，并通过用例覆盖校验。{coverage.evidence}".strip()

    run.status = result_status
    run.output = output
    run.error = error
    run.finished_at = datetime.now(timezone.utc)
    script.status = "通过" if result_status == "通过" else "失败"
    script.executed_at = run.finished_at
    await db.commit()
    await db.refresh(run)
    await db.refresh(script)

    # 执行失败时自动创建缺陷，把脚本执行和缺陷统计连贯起来。
    auto_defect_code: str | None = None
    if result_status == "失败":
        # 把截图绝对路径转成可访问的相对 URL（/uploads/script-screenshots/xxx.png）
        screenshot_url = ""
        if screenshot_path:
            try:
                from pathlib import Path as _Path
                from app.config import settings as _settings
                rel = _Path(screenshot_path).relative_to(_Path(_settings.UPLOAD_DIR).resolve())
                screenshot_url = "/uploads/" + str(rel).replace("\\", "/")
            except Exception:
                screenshot_url = ""
        try:
            auto_defect_code = await _maybe_create_defect_for_failure(
                db=db,
                project_id=script.project_id,
                script=script,
                test_case=test_case,
                run=run,
                snapshot=snapshot,
                reporter=(user.get("nickname") or user.get("phone") or ""),
                screenshot_url=screenshot_url,
            )
        except Exception:
            # 自动建缺陷是辅助流程，绝不能因为它让执行接口报错。
            logger.exception("Auto-create defect after script failure failed")

    return _execution_result(run, script, auto_defect_code)


@router.get("/scripts/{script_id}/executions")
async def list_script_executions(
    script_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _execution_subject(db, script_id, user["sub"])
    result = await db.execute(select(ExecutionRun).where(
        ExecutionRun.script_id == script_id
    ).order_by(ExecutionRun.created_at.desc()))
    return [model_to_dict(item) for item in result.scalars().all()]


@router.post("/projects/{project_id}/scripts/generate")
async def generate_scripts(
    project_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    project_service: ProjectService = Depends(get_project_service),
):
    """AI 生成自动化脚本"""
    await project_service._verify_project_owner(project_id, user["sub"])

    result = await db.execute(
        select(TestCase).where(
            TestCase.project_id == project_id,
            TestCase.automation == "是"
        )
    )
    test_cases = result.scalars().all()

    if not test_cases:
        raise HTTPException(status_code=400, detail="没有适合自动化的测试用例")
    invalid_count = sum(1 for item in test_cases if (item.validity_status or VALID) != VALID)
    if invalid_count:
        raise HTTPException(status_code=400, detail=f"还有 {invalid_count} 条适合自动化的用例已失效，请先重新生成测试用例")
    unreviewed_count = sum(1 for item in test_cases if (item.review_status or "待评审") != "已通过")
    if unreviewed_count:
        raise HTTPException(status_code=400, detail=f"还有 {unreviewed_count} 条适合自动化的用例未评审通过，请先完成用例评审")
    try:
        validate_persisted_traceability(cases=test_cases)
        validate_case_runtime_fields(test_cases, for_automation=True)
        assert_cases_script_ready(test_cases)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    # 检查模型配置
    config_check = await check_config_for_task("脚本生成", user["sub"])
    if not config_check["configured"]:
        raise HTTPException(status_code=400, detail=config_check["message"])

    try:
        ui_context = await UIRecognitionService(db).latest_context_by_project(project_id, user["sub"])
        ai_scripts = []
        for payload in test_case_batches(test_cases, ui_context):
            batch_scripts = await ai_service.generate_automation_scripts(payload, user["sub"])
            allowed_ids = {item["testCaseId"] for item in json.loads(payload)}
            validate_references(batch_scripts, "testCaseId", allowed_ids)
            batch_cases_by_id = {item.id: item for item in test_cases if item.id in allowed_ids}
            for item in batch_scripts:
                quality_error = generated_script_error_message(item.get("code", ""), batch_cases_by_id[item["testCaseId"]])
                if quality_error:
                    raise ValueError(quality_error)
            ai_scripts.extend(batch_scripts)

        await invalidate_after_scripts(db, project_id, "自动化脚本已重新生成，执行结果已失效")
        await db.execute(delete(AutomationScript).where(AutomationScript.project_id == project_id))
        test_cases_by_id = {item.id: item for item in test_cases}
        scripts = []
        for ai_script in ai_scripts:
            matched_tc = test_cases_by_id[ai_script["testCaseId"]]
            # 规范化脚本元数据：不信任 AI 随意填写的值，按用例平台推导
            tc_platform = (getattr(matched_tc, "target_platform", "") or "PC").upper()
            script = AutomationScript(
                id=str(uuid.uuid4()),
                project_id=project_id,
                test_case_id=matched_tc.id,
                script_code=_script_code_for_tc(matched_tc, len(scripts) + 1),
                script_type="APP" if tc_platform == "APP" else "UI",
                framework="Appium" if tc_platform == "APP" else "Playwright",
                language="Python",
                code=ai_script["code"],
                status="未测试",
                generated_by_ai=True,
            )
            db.add(script)
            scripts.append(script)
        await db.commit()
    except ValueError as exc:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        await db.rollback()
        logger.exception("AI script generation failed")
        raise HTTPException(status_code=502, detail=f"脚本生成失败：{str(exc)[:200]}") from exc

    return {
        "ok": True,
        "count": len(scripts),
        "scripts": [model_to_dict(s) for s in scripts],
    }


def _generate_template_scripts(project_id: str, test_cases: list, db: AsyncSession) -> list:
    """模板生成脚本（AI 失败时的回退方案）"""
    scripts = []
    for tc in test_cases:
        code = _generate_playwright_script(tc)
        script = AutomationScript(
            id=str(uuid.uuid4()),
            project_id=project_id,
            test_case_id=tc.id,
            script_code=_script_code_for_tc(tc, len(scripts) + 1),
            script_type="UI",
            framework="Playwright",
            language="Python",
            code=code,
            status="未测试",
            generated_by_ai=False,
        )
        db.add(script)
        scripts.append(script)
    return scripts


def _is_ui_automation_code(code: str) -> bool:
    lowered = code.lower()
    return "playwright" in lowered or "appium" in lowered or "page." in lowered or "driver." in lowered


def _generate_playwright_script(tc: TestCase) -> str:
    steps = tc.steps.replace("\n", "\n        ") if tc.steps else "# 无步骤"
    return f'''import asyncio
from playwright.async_api import async_playwright


async def test_{tc.case_code.lower()}():
    """
    测试用例: {tc.title}
    编号: {tc.case_code}
    优先级: {tc.priority}
    模块: {tc.module}
    """
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        context = await browser.new_context()
        page = await context.new_page()

        try:
            # 前置条件
            {tc.precondition if tc.precondition else "# 无特殊前置条件"}

            # 测试步骤
            {steps}

            # 预期结果验证
            # TODO: 根据预期结果添加断言
            # {tc.expected_result}

            print("✅ 测试通过")

        except Exception as e:
            print(f"❌ 测试失败: {{e}}")
            raise

        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(test_{tc.case_code.lower()}())
'''
