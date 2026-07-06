import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.automation_script import AutomationScript
from app.models.test_case import TestCase
from app.routers.auth import get_current_user
from app.utils import model_to_dict

router = APIRouter()


@router.get("/projects/{project_id}/scripts")
async def list_scripts(
    project_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
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

    for key, value in data.items():
        if hasattr(script, key):
            setattr(script, key, value)

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
    await db.delete(script)
    await db.commit()
    return {"ok": True}


@router.post("/projects/{project_id}/scripts/generate")
async def generate_scripts(
    project_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # 获取适合自动化的测试用例
    result = await db.execute(
        select(TestCase).where(
            TestCase.project_id == project_id,
            TestCase.automation == "适合"
        )
    )
    test_cases = result.scalars().all()

    if not test_cases:
        raise HTTPException(status_code=400, detail="没有适合自动化的测试用例")

    scripts = []
    for tc in test_cases:
        # 生成 Playwright Python 脚本
        code = _generate_playwright_script(tc)

        script = AutomationScript(
            id=str(uuid.uuid4()),
            project_id=project_id,
            test_case_id=tc.id,
            script_type="UI",
            framework="Playwright",
            language="Python",
            code=code,
            status="待执行",
            generated_by_ai=True,
        )
        db.add(script)
        scripts.append(script)

    await db.commit()

    return {
        "ok": True,
        "count": len(scripts),
        "scripts": [model_to_dict(s) for s in scripts],
    }


def _generate_playwright_script(tc: TestCase) -> str:
    """根据测试用例生成 Playwright Python 脚本"""
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
