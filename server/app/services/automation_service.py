from __future__ import annotations

import uuid

from sqlalchemy import select

from app.models.automation_script import AutomationScript
from app.services.export_format import format_api_datetime
from app.models.test_case import TestCase
from app.services.base import BaseService
from app.services.ai_service import AIService
from app.services.data_lineage_service import INVALID, REVIEW_INVALIDATED, VALID, cascade_delete_script


class AutomationService(BaseService):
    """自动化脚本管理服务"""

    def __init__(self, db):
        super().__init__(db)
        self.ai_service = AIService()

    async def generate_scripts(self, project_id: str, case_ids: list[str], user_id: str) -> list[dict]:
        # 获取测试用例
        result = await self.db.execute(
            select(TestCase).where(TestCase.id.in_(case_ids))
        )
        cases = result.scalars().all()
        if not cases:
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail="未找到测试用例数据")
        invalid_count = sum(1 for item in cases if (item.validity_status or VALID) != VALID)
        if invalid_count:
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail=f"还有 {invalid_count} 条测试用例已失效，请先重新生成测试用例")

        # 构建用例文本
        cases_text = "\n".join([
            f"- 编号: {c.case_code}, 模块: {c.module}, 标题: {c.title}, 步骤: {c.steps}, 预期: {c.expected_result}"
            for c in cases
        ])

        # AI 生成脚本
        generated = await self.ai_service.generate_automation_scripts(cases_text, user_id)
        if not generated:
            from fastapi import HTTPException
            raise HTTPException(status_code=500, detail="AI 生成脚本失败")

        # 批量创建
        scripts = []
        for item in generated:
            # 规范化脚本元数据：不信任 AI 随意填写的值
            raw_platform = (item.get("targetPlatform") or "PC").upper()
            script = AutomationScript(
                id=str(uuid.uuid4()),
                project_id=project_id,
                test_case_id=item.get("testCaseId"),
                script_type="APP" if raw_platform == "APP" else "UI",
                framework="Appium" if raw_platform == "APP" else "Playwright",
                language="Python",
                code=item.get("code", ""),
                status="未测试",
                script_code=item.get("scriptCode", ""),
            )
            self.db.add(script)
            scripts.append(script)

        await self.db.commit()
        for s in scripts:
            await self.db.refresh(s)

        return [self._to_dict(s) for s in scripts]

    async def get_script(self, script_id: str) -> dict | None:
        result = await self.db.execute(select(AutomationScript).where(AutomationScript.id == script_id))
        script = result.scalar_one_or_none()
        return self._to_dict(script) if script else None

    async def list_scripts(self, project_id: str, skip: int = 0, limit: int = 100) -> list[dict]:
        result = await self.db.execute(
            select(AutomationScript).where(AutomationScript.project_id == project_id)
            .offset(skip).limit(limit)
        )
        return [self._to_dict(s) for s in result.scalars().all()]

    async def list_scripts_by_case(self, test_case_id: str) -> list[dict]:
        result = await self.db.execute(
            select(AutomationScript).where(AutomationScript.test_case_id == test_case_id)
        )
        return [self._to_dict(s) for s in result.scalars().all()]

    async def update_script(self, script_id: str, code: str) -> dict | None:
        result = await self.db.execute(select(AutomationScript).where(AutomationScript.id == script_id))
        script = result.scalar_one_or_none()
        if not script:
            return None

        script.code = code
        script.updated_at = self._now()
        await self.db.commit()
        await self.db.refresh(script)
        return self._to_dict(script)

    async def delete_script(self, script_id: str) -> bool:
        if not await cascade_delete_script(self.db, script_id):
            return False
        await self.db.commit()
        return True

    async def review_script(self, script_id: str, status: str) -> dict | None:
        result = await self.db.execute(select(AutomationScript).where(AutomationScript.id == script_id))
        script = result.scalar_one_or_none()
        if not script:
            return None
        # 已失效（作废）的脚本不允许改为已通过——数据失效后需重新生成
        if status == "已通过" and (script.review_status == REVIEW_INVALIDATED or script.validity_status == INVALID):
            from fastapi import HTTPException
            raise HTTPException(
                status_code=400,
                detail="该脚本已失效，无法再次评审。请重新生成脚本",
            )
        script.review_status = status
        script.updated_at = self._now()
        await self.db.commit()
        await self.db.refresh(script)
        return self._to_dict(script)

    async def execute_script(self, script_id: str) -> dict:
        """模拟脚本执行（实际执行需要沙箱环境）"""
        result = await self.db.execute(select(AutomationScript).where(AutomationScript.id == script_id))
        script = result.scalar_one_or_none()
        if not script:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="脚本不存在")

        script.status = "通过"
        script.executed_at = self._now()
        await self.db.commit()

        # TODO: 实际执行脚本（集成 Playwright 等）
        # 这里返回模拟结果
        return {
            "scriptId": script_id,
            "status": "通过",
            "output": "脚本执行通过",
            "error": None,
            "executedAt": format_api_datetime(self._now()),
        }

    async def get_execution_history(self, script_id: str) -> list[dict]:
        # 当前版本只返回基本信息，后续可扩展执行日志表
        result = await self.db.execute(
            select(AutomationScript).where(AutomationScript.id == script_id)
        )
        script = result.scalar_one_or_none()
        if not script:
            return []

        if script.executed_at:
            return [{
                "scriptId": script_id,
                "status": script.status,
                "executedAt": format_api_datetime(script.executed_at),
            }]
        return []
