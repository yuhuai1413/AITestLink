import uuid
import logging
import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.automation_script import AutomationScript
from app.models.test_case import TestCase
from app.models.execution_run import ExecutionRun
from app.models.environment_config import TestAccount
from app.routers.deps import get_current_user, get_automation_service, get_project_service
from app.services.automation_service import AutomationService
from app.services.project_service import ProjectService
from app.services.ai_service import AIService, check_config_for_task
from app.services.ai_input_builder import test_case_batches, validate_case_runtime_fields, validate_persisted_traceability, validate_references
from app.services.environment_service import EnvironmentService
from app.utils import model_to_dict

logger = logging.getLogger(__name__)
router = APIRouter()
ai_service = AIService()


class ExecuteScriptRequest(BaseModel):
    environmentId: str
    accountId: str | None = None


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
    success = await service.delete_script(script_id)
    if not success:
        raise HTTPException(status_code=404, detail="Script not found")
    return {"ok": True}


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
    if test_case.environment_id and data.environmentId != test_case.environment_id:
        raise HTTPException(status_code=400, detail="所选环境与测试用例中记录的测试地址不一致")
    required_role = test_case.required_role or "无"
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

    _, snapshot = await EnvironmentService(db).build_runtime_variables(
        data.environmentId, user["sub"], data.accountId
    )
    run = ExecutionRun(
        id=str(uuid.uuid4()),
        project_id=script.project_id,
        script_id=script.id,
        test_case_id=test_case.id,
        environment_id=data.environmentId,
        account_id=data.accountId,
        status="未启动",
        environment_snapshot=json.dumps(snapshot, ensure_ascii=False),
        error="隔离执行 Worker 尚未配置",
    )
    db.add(run)
    await db.commit()
    raise HTTPException(
        status_code=501,
        detail={"message": "隔离执行 Worker 尚未配置，未运行脚本", "executionRunId": run.id},
    )


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
    try:
        validate_persisted_traceability(cases=test_cases)
        validate_case_runtime_fields(test_cases, for_automation=True)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    # 检查模型配置
    config_check = await check_config_for_task("脚本生成", user["sub"])
    if not config_check["configured"]:
        raise HTTPException(status_code=400, detail=config_check["message"])

    try:
        ai_scripts = []
        for payload in test_case_batches(test_cases):
            batch_scripts = await ai_service.generate_automation_scripts(payload, user["sub"])
            allowed_ids = {item["testCaseId"] for item in json.loads(payload)}
            validate_references(batch_scripts, "testCaseId", allowed_ids)
            ai_scripts.extend(batch_scripts)

        await db.execute(delete(AutomationScript).where(AutomationScript.project_id == project_id))
        test_cases_by_id = {item.id: item for item in test_cases}
        scripts = []
        for ai_script in ai_scripts:
            matched_tc = test_cases_by_id[ai_script["testCaseId"]]
            script = AutomationScript(
                id=str(uuid.uuid4()),
                project_id=project_id,
                test_case_id=matched_tc.id,
                script_code=_script_code_for_tc(matched_tc, len(scripts) + 1),
                script_type=ai_script.get("scriptType", "UI"),
                framework=ai_script.get("framework", "Playwright"),
                language=ai_script.get("language", "Python"),
                code=ai_script["code"],
                status="待执行",
                generated_by_ai=True,
            )
            db.add(script)
            scripts.append(script)
        await db.commit()
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
            status="待执行",
            generated_by_ai=False,
        )
        db.add(script)
        scripts.append(script)
    return scripts


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
