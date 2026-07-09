import uuid
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.automation_script import AutomationScript
from app.models.test_case import TestCase
from app.routers.ai import _to_eng_abbr
from app.routers.auth import get_current_user
from app.services.ai_service import AIService
from app.utils import model_to_dict
from app.utils import verify_project_owner

logger = logging.getLogger(__name__)
router = APIRouter()
ai_service = AIService()



def _script_code_for_tc(tc, counter: int) -> str:
    """根据测试用例生成脚本编号，格式 SC_XXX_NNN"""
    module = getattr(tc, "module", "") or ""
    abbr = _to_eng_abbr(module)
    return f"SC_{abbr}_{counter:03d}"


@router.get("/projects/{project_id}/scripts")
async def list_scripts(
    project_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await verify_project_owner(db, project_id, user["sub"])
    result = await db.execute(
        select(AutomationScript).where(AutomationScript.project_id == project_id)
        .order_by(AutomationScript.created_at.desc())
    )
    return [model_to_dict(s) for s in result.scalars().all()]


@router.get("/scripts/{script_id}")
async def get_script(
    script_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(AutomationScript).where(AutomationScript.id == script_id))
    script = result.scalar_one_or_none()
    if not script:
        raise HTTPException(status_code=404, detail="Script not found")
    await verify_project_owner(db, script.project_id, user["sub"])
    return model_to_dict(script)


@router.put("/scripts/{script_id}")
async def update_script(
    script_id: str,
    data: dict,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(AutomationScript).where(AutomationScript.id == script_id))
    script = result.scalar_one_or_none()
    if not script:
        raise HTTPException(status_code=404, detail="Script not found")
    await verify_project_owner(db, script.project_id, user["sub"])
    field_map = {"reviewStatus": "review_status"}
    for key, value in data.items():
        db_key = field_map.get(key, key)
        if hasattr(script, db_key):
            setattr(script, db_key, value)
    await db.commit()
    await db.refresh(script)
    return model_to_dict(script)


@router.delete("/scripts/{script_id}")
async def delete_script(
    script_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(AutomationScript).where(AutomationScript.id == script_id))
    script = result.scalar_one_or_none()
    if not script:
        raise HTTPException(status_code=404, detail="Script not found")
    await verify_project_owner(db, script.project_id, user["sub"])
    await db.delete(script)
    await db.commit()
    return {"ok": True}


@router.post("/projects/{project_id}/scripts/generate")
async def generate_scripts(
    project_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """AI 生成自动化脚本"""
    await verify_project_owner(db, project_id, user["sub"])

    result = await db.execute(
        select(TestCase).where(
            TestCase.project_id == project_id,
            TestCase.automation == "适合"
        )
    )
    test_cases = result.scalars().all()

    if not test_cases:
        raise HTTPException(status_code=400, detail="没有适合自动化的测试用例")

    # 检查模型配置
    from app.services.ai_service import check_config_for_task
    config_check = await check_config_for_task("脚本生成", user["sub"])
    if not config_check["configured"]:
        raise HTTPException(status_code=400, detail=config_check["message"])

    # 删除该脚本项目已有的脚本，避免重复生成
    from sqlalchemy import delete
    await db.execute(delete(AutomationScript).where(AutomationScript.project_id == project_id))
    await db.commit()

    # 构建测试用例文本
    tc_text = "\n".join(
        f"- 编号:{tc.case_code} 模块:{tc.module} 标题:{tc.title} 优先级:{tc.priority} "
        f"前置条件:{tc.precondition or '无'} 步骤:{tc.steps or '无'} "
        f"预期结果:{tc.expected_result or '无'}"
        for tc in test_cases
    )

    try:
        # 调用 AI 生成脚本
        ai_scripts = await ai_service.generate_automation_scripts(tc_text, user["sub"])

        # 如果 AI 返回为空或解析失败，回退到模板生成
        if not ai_scripts:
            logger.warning("AI script generation returned empty, falling back to template")
            scripts = _generate_template_scripts(project_id, test_cases, db)
        else:
            scripts = []
            for ai_script in ai_scripts:
                tc_id = ai_script.get("testCaseId", "")
                # 找到匹配的测试用例
                matched_tc = None
                for tc in test_cases:
                    if tc.case_code == tc_id or tc.id == tc_id:
                        matched_tc = tc
                        break

                script = AutomationScript(
                    id=str(uuid.uuid4()),
                    project_id=project_id,
                    test_case_id=matched_tc.id if matched_tc else test_cases[0].id,
                    script_code=_script_code_for_tc(matched_tc or test_cases[0], len(scripts) + 1),
                    script_type=ai_script.get("scriptType", "UI"),
                    framework=ai_script.get("framework", "Playwright"),
                    language=ai_script.get("language", "Python"),
                    code=ai_script.get("code", "# AI generation failed"),
                    status="待执行",
                    generated_by_ai=True,
                )
                db.add(script)
                scripts.append(script)

    except Exception as e:
        logger.exception("AI script generation failed, falling back to template")
        scripts = _generate_template_scripts(project_id, test_cases, db)

    await db.commit()

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
    """根据测试用例生成 Playwright Python 脚本（模板回退）"""
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
