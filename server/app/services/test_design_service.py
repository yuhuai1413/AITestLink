from __future__ import annotations

import uuid
import re

from sqlalchemy import select, func

from app.models.test_point import TestPoint
from app.models.test_case import TestCase
from app.models.requirement import Requirement
from app.services.base import BaseService
from app.services.ai_service import AIService
from app.contracts.test_design import TestPointUpdate, TestCaseUpdate


class TestDesignService(BaseService):
    """测试设计服务 - 管理测试点和测试用例"""

    def __init__(self, db):
        super().__init__(db)
        self.ai_service = AIService()

    # ── Test Points ──────────────────────────────────────────────────

    async def generate_test_points(self, project_id: str, requirement_ids: list[str], user_id: str) -> list[dict]:
        # 获取需求
        result = await self.db.execute(
            select(Requirement).where(Requirement.id.in_(requirement_ids))
        )
        requirements = result.scalars().all()
        if not requirements:
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail="未找到需求数据")

        # 构建需求文本
        req_text = "\n".join([
            f"- 模块: {r.module}, 功能: {r.feature}, 规则: {r.rule}"
            for r in requirements
        ])

        # AI 生成测试点
        generated = await self.ai_service.generate_test_points(req_text, user_id)
        if not generated:
            from fastapi import HTTPException
            raise HTTPException(status_code=500, detail="AI 生成测试点失败")

        # 批量创建
        test_points = []
        for item in generated:
            tp = TestPoint(
                id=str(uuid.uuid4()),
                project_id=project_id,
                requirement_id=requirement_ids[0] if len(requirement_ids) == 1 else None,
                module=item.get("module", ""),
                type=item.get("type", "正常流程"),
                title=item.get("title", ""),
                description=item.get("description", ""),
                priority=item.get("priority", "P1"),
                automatable=item.get("automatable", False),
            )
            self.db.add(tp)
            test_points.append(tp)

        await self.db.commit()
        for tp in test_points:
            await self.db.refresh(tp)

        return [self._to_dict(tp) for tp in test_points]

    async def get_test_point(self, point_id: str) -> dict | None:
        result = await self.db.execute(select(TestPoint).where(TestPoint.id == point_id))
        tp = result.scalar_one_or_none()
        return self._to_dict(tp) if tp else None

    async def list_test_points(self, project_id: str, skip: int = 0, limit: int = 100) -> list[dict]:
        result = await self.db.execute(
            select(TestPoint).where(TestPoint.project_id == project_id)
            .offset(skip).limit(limit)
        )
        return [self._to_dict(tp) for tp in result.scalars().all()]

    async def list_test_points_by_requirement(self, requirement_id: str) -> list[dict]:
        result = await self.db.execute(
            select(TestPoint).where(TestPoint.requirement_id == requirement_id)
        )
        return [self._to_dict(tp) for tp in result.scalars().all()]

    async def update_test_point(self, point_id: str, data: TestPointUpdate) -> dict | None:
        result = await self.db.execute(select(TestPoint).where(TestPoint.id == point_id))
        tp = result.scalar_one_or_none()
        if not tp:
            return None

        update_data = data.model_dump(exclude_unset=True)
        field_map = {
            "title": "title",
            "description": "description",
            "priority": "priority",
            "review_status": "review_status",
        }
        for schema_key, db_key in field_map.items():
            if schema_key in update_data:
                setattr(tp, db_key, update_data[schema_key])

        tp.updated_at = self._now()
        await self.db.commit()
        await self.db.refresh(tp)
        return self._to_dict(tp)

    async def delete_test_point(self, point_id: str) -> bool:
        result = await self.db.execute(select(TestPoint).where(TestPoint.id == point_id))
        tp = result.scalar_one_or_none()
        if not tp:
            return False
        await self.db.delete(tp)
        await self.db.commit()
        return True

    async def batch_update_review(self, point_ids: list[str], status: str) -> int:
        result = await self.db.execute(
            select(TestPoint).where(TestPoint.id.in_(point_ids))
        )
        count = 0
        for tp in result.scalars().all():
            tp.review_status = status
            count += 1
        await self.db.commit()
        return count

    # ── Test Cases ───────────────────────────────────────────────────

    async def generate_test_cases(self, project_id: str, test_point_ids: list[str], user_id: str) -> list[dict]:
        # 获取测试点
        result = await self.db.execute(
            select(TestPoint).where(TestPoint.id.in_(test_point_ids))
        )
        test_points = result.scalars().all()
        if not test_points:
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail="未找到测试点数据")

        # 构建测试点文本
        tp_text = "\n".join([
            f"- 模块: {tp.module}, 类型: {tp.type}, 标题: {tp.title}, 描述: {tp.description}"
            for tp in test_points
        ])

        # AI 生成测试用例
        generated = await self.ai_service.generate_test_cases(tp_text, user_id)
        if not generated:
            from fastapi import HTTPException
            raise HTTPException(status_code=500, detail="AI 生成测试用例失败")

        # 批量创建
        test_cases = []
        for item in generated:
            # 生成用例编号
            case_code = await self._generate_case_code(project_id, item.get("module", ""))

            tc = TestCase(
                id=str(uuid.uuid4()),
                project_id=project_id,
                test_point_id=test_point_ids[0] if len(test_point_ids) == 1 else None,
                case_code=case_code,
                module=item.get("module", ""),
                feature=item.get("feature", ""),
                title=item.get("title", ""),
                priority=item.get("priority", "P1"),
                precondition=item.get("precondition", ""),
                steps=item.get("steps", ""),
                test_data=item.get("testData", ""),
                expected_result=item.get("expectedResult", ""),
                test_type=item.get("testType", "功能测试"),
                automation=item.get("automation", "待评估"),
            )
            self.db.add(tc)
            test_cases.append(tc)

        await self.db.commit()
        for tc in test_cases:
            await self.db.refresh(tc)

        return [self._to_dict(tc) for tc in test_cases]

    async def get_test_case(self, case_id: str) -> dict | None:
        result = await self.db.execute(select(TestCase).where(TestCase.id == case_id))
        tc = result.scalar_one_or_none()
        return self._to_dict(tc) if tc else None

    async def list_test_cases(self, project_id: str, skip: int = 0, limit: int = 100) -> list[dict]:
        result = await self.db.execute(
            select(TestCase).where(TestCase.project_id == project_id)
            .offset(skip).limit(limit)
        )
        return [self._to_dict(tc) for tc in result.scalars().all()]

    async def list_test_cases_by_point(self, test_point_id: str) -> list[dict]:
        result = await self.db.execute(
            select(TestCase).where(TestCase.test_point_id == test_point_id)
        )
        return [self._to_dict(tc) for tc in result.scalars().all()]

    async def update_test_case(self, case_id: str, data: TestCaseUpdate) -> dict | None:
        result = await self.db.execute(select(TestCase).where(TestCase.id == case_id))
        tc = result.scalar_one_or_none()
        if not tc:
            return None

        update_data = data.model_dump(exclude_unset=True)
        field_map = {
            "title": "title",
            "priority": "priority",
            "precondition": "precondition",
            "steps": "steps",
            "test_data": "test_data",
            "expected_result": "expected_result",
            "test_type": "test_type",
            "automation": "automation",
            "review_status": "review_status",
            "actual_result": "actual_result",
            "passed": "passed",
            "tester": "tester",
            "test_date": "test_date",
            "remark": "remark",
        }
        for schema_key, db_key in field_map.items():
            if schema_key in update_data:
                setattr(tc, db_key, update_data[schema_key])

        tc.updated_at = self._now()
        await self.db.commit()
        await self.db.refresh(tc)
        return self._to_dict(tc)

    async def delete_test_case(self, case_id: str) -> bool:
        result = await self.db.execute(select(TestCase).where(TestCase.id == case_id))
        tc = result.scalar_one_or_none()
        if not tc:
            return False
        await self.db.delete(tc)
        await self.db.commit()
        return True

    async def batch_update_status(self, case_ids: list[str], status: str) -> int:
        result = await self.db.execute(
            select(TestCase).where(TestCase.id.in_(case_ids))
        )
        count = 0
        for tc in result.scalars().all():
            tc.passed = status
            count += 1
        await self.db.commit()
        return count

    async def batch_update_review(self, case_ids: list[str], status: str) -> int:
        result = await self.db.execute(
            select(TestCase).where(TestCase.id.in_(case_ids))
        )
        count = 0
        for tc in result.scalars().all():
            tc.review_status = status
            count += 1
        await self.db.commit()
        return count

    async def review_test_cases(self, project_id: str, case_ids: list[str], user_id: str) -> dict:
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
            f"- 编号: {c.case_code}, 模块: {c.module}, 标题: {c.title}, 步骤: {c.steps[:100]}"
            for c in cases
        ])

        return await self.ai_service.review_test_cases(cases_text, user_id)

    # ── Coverage ─────────────────────────────────────────────────────

    async def get_coverage(self, project_id: str) -> dict:
        # 需求数
        req_result = await self.db.execute(
            select(func.count(Requirement.id)).where(Requirement.project_id == project_id)
        )
        total_requirements = req_result.scalar() or 0

        # 已关联测试点的需求数
        covered_result = await self.db.execute(
            select(func.count(func.distinct(TestPoint.requirement_id)))
            .where(TestPoint.project_id == project_id, TestPoint.requirement_id.isnot(None))
        )
        covered_requirements = covered_result.scalar() or 0

        # 测试点数
        tp_result = await self.db.execute(
            select(func.count(TestPoint.id)).where(TestPoint.project_id == project_id)
        )
        total_test_points = tp_result.scalar() or 0

        # 测试用例数
        tc_result = await self.db.execute(
            select(func.count(TestCase.id)).where(TestCase.project_id == project_id)
        )
        total_test_cases = tc_result.scalar() or 0

        # 按类型统计
        type_result = await self.db.execute(
            select(TestPoint.type, func.count(TestPoint.id))
            .where(TestPoint.project_id == project_id)
            .group_by(TestPoint.type)
        )
        by_type = {row[0]: row[1] for row in type_result.all()}

        # 按优先级统计
        priority_result = await self.db.execute(
            select(TestCase.priority, func.count(TestCase.id))
            .where(TestCase.project_id == project_id)
            .group_by(TestCase.priority)
        )
        by_priority = {row[0]: row[1] for row in priority_result.all()}

        # 自动化率
        auto_result = await self.db.execute(
            select(func.count(TestCase.id)).where(
                TestCase.project_id == project_id,
                TestCase.automation == "适合"
            )
        )
        automation_count = auto_result.scalar() or 0
        automation_rate = (automation_count / total_test_cases * 100) if total_test_cases > 0 else 0

        return {
            "totalRequirements": total_requirements,
            "coveredRequirements": covered_requirements,
            "totalTestPoints": total_test_points,
            "totalTestCases": total_test_cases,
            "byType": by_type,
            "byPriority": by_priority,
            "automationRate": round(automation_rate, 1),
        }

    # ── Helpers ──────────────────────────────────────────────────────

    async def _generate_case_code(self, project_id: str, module: str) -> str:
        """生成用例编号: TC_XXX_NNN"""
        # 模块缩写
        module_map = {
            "用户管理": "USER", "订单处理": "ORDER", "菜单": "MENU",
            "客户管理": "CUST", "登录": "LOGIN", "系统": "SYS",
        }
        prefix = module_map.get(module, re.sub(r'[^A-Z]', '', module.upper())[:4] or "TC")

        # 当前最大编号
        result = await self.db.execute(
            select(TestCase.case_code).where(
                TestCase.project_id == project_id,
                TestCase.case_code.like(f"TC_{prefix}_%")
            ).order_by(TestCase.case_code.desc()).limit(1)
        )
        last_code = result.scalar_one_or_none()

        if last_code:
            match = re.search(r'(\d+)$', last_code)
            if match:
                num = int(match.group(1)) + 1
            else:
                num = 1
        else:
            num = 1

        return f"TC_{prefix}_{num:03d}"
