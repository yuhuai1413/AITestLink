from __future__ import annotations

import uuid

from sqlalchemy import select

from app.models.automation_script import AutomationScript
from app.models.test_case import TestCase
from app.services.base import BaseService
from app.services.ai_service import AIService


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
            script = AutomationScript(
                id=str(uuid.uuid4()),
                project_id=project_id,
                test_case_id=item.get("testCaseId"),
                script_type=item.get("scriptType", "UI"),
                framework=item.get("framework", "Playwright"),
                language=item.get("language", "Python"),
                code=item.get("code", ""),
                status="待执行",
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
        result = await self.db.execute(select(AutomationScript).where(AutomationScript.id == script_id))
        script = result.scalar_one_or_none()
        if not script:
            return False
        await self.db.delete(script)
        await self.db.commit()
        return True

    async def review_script(self, script_id: str, status: str) -> dict | None:
        result = await self.db.execute(select(AutomationScript).where(AutomationScript.id == script_id))
        script = result.scalar_one_or_none()
        if not script:
            return None
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

        script.status = "执行中"
        script.executed_at = self._now()
        await self.db.commit()

        # TODO: 实际执行脚本（集成 Playwright 等）
        # 这里返回模拟结果
        return {
            "scriptId": script_id,
            "status": "success",
            "output": "脚本执行成功",
            "error": None,
            "executedAt": self._now().isoformat(),
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
                "executedAt": script.executed_at.isoformat(),
            }]
        return []
