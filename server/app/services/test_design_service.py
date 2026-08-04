from __future__ import annotations

import uuid
import re
import json

from sqlalchemy import select, func, update, or_

from app.models.test_point import TestPoint
from app.models.test_case import TestCase
from app.models.requirement import Requirement
from app.services.base import BaseService
from app.services.ai_service import AIService
from app.services.ai_input_builder import (
    requirement_batches,
    test_point_batches,
    validate_case_environment,
    validate_reference_values,
    validate_references,
)
from app.services.data_lineage_service import INVALID, REVIEW_INVALIDATED, VALID, cascade_delete_test_case, cascade_delete_test_point
from app.services.environment_service import EnvironmentService
from app.services.script_generation_quality import review_generated_case_automation
from app.services.ui_recognition_service import UIRecognitionService
from app.contracts.test_design import TestPointUpdate, TestCaseUpdate


class TestDesignService(BaseService):
    """测试设计服务 - 管理测试点和测试用例"""

    def __init__(self, db):
        super().__init__(db)
        self.ai_service = AIService()

    # ── Test Points ──────────────────────────────────────────────────

    async def generate_test_points(self, project_id: str, requirement_ids: list[str], user_id: str) -> list[dict]:
        # 获取需求
        result = await self.db.execute(select(Requirement).where(
            Requirement.project_id == project_id,
            Requirement.id.in_(requirement_ids),
        ))
        requirements = result.scalars().all()
        if not requirements or {item.id for item in requirements} != set(requirement_ids):
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail="未找到需求数据")
        invalid_count = sum(1 for item in requirements if (item.validity_status or VALID) != VALID)
        if invalid_count:
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail=f"还有 {invalid_count} 条需求已失效，请先重新解析需求")
        unreviewed_count = sum(1 for item in requirements if item.review_status != "已通过")
        if unreviewed_count:
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail=f"还有 {unreviewed_count} 条需求未评审通过，请先完成需求评审")

        generated: list[dict] = []
        for payload in requirement_batches(requirements):
            batch_items = await self.ai_service.generate_test_points(payload, user_id)
            payload_items = json.loads(payload)
            allowed_ids = {item["requirementId"] for item in payload_items}
            validate_references(batch_items, "requirementId", allowed_ids)
            validate_reference_values(
                batch_items,
                "requirementId",
                {item["requirementId"]: item for item in payload_items},
                ("module",),
            )
            generated.extend(batch_items)
        if not generated:
            from fastapi import HTTPException
            raise HTTPException(status_code=500, detail="AI 生成测试点失败")

        # 批量创建
        test_points = []
        for point_code, item in zip(self._generate_point_codes(generated), generated):
            tp = TestPoint(
                id=str(uuid.uuid4()),
                point_code=point_code,
                project_id=project_id,
                requirement_id=item["requirementId"],
                module=item["module"],
                type=item["type"],
                title=item["title"],
                description=item.get("description", ""),
                priority=item.get("priority", "P1"),
                automatable=bool(item.get("automatable", False)),
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

        # 已失效的测试点不允许改为"已通过"——数据失效后需重新生成，
        # 不能在旧数据上恢复评审状态。与 test_case 守卫保持一致。
        new_review = update_data.get("review_status")
        is_invalid = tp.validity_status == INVALID or tp.review_status == REVIEW_INVALIDATED
        if new_review == "已通过" and is_invalid:
            from fastapi import HTTPException
            raise HTTPException(
                status_code=400,
                detail="该测试点已失效，无法再次评审。请重新生成测试点",
            )
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
        if not await cascade_delete_test_point(self.db, point_id):
            return False
        await self.db.commit()
        return True

    async def batch_update_test_point_review(self, point_ids: list[str], status: str) -> int:
        ids = [str(item) for item in point_ids if str(item).strip()]
        if not ids:
            return 0
        # 已失效（作废）的测试点不允许改为已通过
        if status == "已通过":
            result = await self.db.execute(
                select(TestPoint).where(
                    TestPoint.id.in_(ids),
                    or_(
                        TestPoint.review_status == REVIEW_INVALIDATED,
                        TestPoint.validity_status == INVALID,
                    ),
                )
            )
            invalidated = result.scalars().all()
            if invalidated:
                from fastapi import HTTPException
                raise HTTPException(
                    status_code=400,
                    detail=f"已作废的测试点不能改为已通过，请先重新生成测试点",
                )
        result = await self.db.execute(
            update(TestPoint)
            .where(TestPoint.id.in_(ids))
            .values(review_status=status, updated_at=self._now())
        )
        await self.db.commit()
        return result.rowcount or 0

    # ── Test Cases ───────────────────────────────────────────────────

    async def generate_test_cases(self, project_id: str, test_point_ids: list[str], user_id: str) -> list[dict]:
        # 获取测试点
        result = await self.db.execute(select(TestPoint).where(
            TestPoint.project_id == project_id,
            TestPoint.id.in_(test_point_ids),
        ))
        test_points = result.scalars().all()
        if not test_points or {item.id for item in test_points} != set(test_point_ids):
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail="未找到测试点数据")
        invalid_count = sum(1 for item in test_points if (item.validity_status or VALID) != VALID)
        if invalid_count:
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail=f"还有 {invalid_count} 个测试点已失效，请先重新生成测试点")
        unreviewed_count = sum(1 for item in test_points if item.review_status != "已通过")
        if unreviewed_count:
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail=f"还有 {unreviewed_count} 个测试点未评审通过，请先完成测试点评审")

        if any(not item.requirement_id for item in test_points):
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail="存在未关联需求的旧测试点，请先重新生成测试点")

        requirement_result = await self.db.execute(select(Requirement).where(
            Requirement.project_id == project_id,
        ))
        requirements_by_id = {item.id: item for item in requirement_result.scalars().all()}
        environment_context = await EnvironmentService(self.db).get_generation_context(project_id, user_id)
        # 取系统识别结果，让用例生成能引用真实页面/字段/菜单
        ui_context_by_environment = await UIRecognitionService(self.db).latest_context_by_project(project_id, user_id)

        generated: list[dict] = []
        point_payloads_by_id: dict[str, dict] = {}
        for payload in test_point_batches(test_points, requirements_by_id, environment_context, ui_context_by_environment):
            batch_items = await self.ai_service.generate_test_cases(payload, user_id)
            payload_items = json.loads(payload)
            point_payloads_by_id.update({item["testPointId"]: item for item in payload_items})
            allowed_ids = {item["testPointId"] for item in payload_items}
            validate_references(batch_items, "testPointId", allowed_ids)
            validate_reference_values(
                batch_items,
                "testPointId",
                {item["testPointId"]: item for item in payload_items},
                ("module", "priority"),
            )
            validate_case_environment(batch_items, environment_context)
            generated.extend(batch_items)
        if not generated:
            from fastapi import HTTPException
            raise HTTPException(status_code=500, detail="AI 生成测试用例失败")

        # 批量创建
        test_cases = []
        for item in generated:
            # 生成用例编号
            point = next(value for value in test_points if value.id == item["testPointId"])
            requirement = requirements_by_id.get(point.requirement_id)
            case_code = await self._generate_case_code(project_id, point.module)
            automation_value, automation_reason = review_generated_case_automation(
                item,
                point_payload=point_payloads_by_id.get(item["testPointId"]),
            )

            tc = TestCase(
                id=str(uuid.uuid4()),
                project_id=project_id,
                test_point_id=point.id,
                requirement_id=point.requirement_id,
                environment_id=item["environmentId"],
                case_code=case_code,
                module=point.module,
                feature=requirement.feature if requirement else "",
                title=item["title"],
                priority=item.get("priority", "P1"),
                precondition=item.get("precondition", ""),
                steps=item.get("steps", ""),
                test_data=json.dumps(item.get("testData", ""), ensure_ascii=False) if isinstance(item.get("testData"), (dict, list)) else str(item.get("testData", "")),
                expected_result=item.get("expectedResult", ""),
                target_platform=item["targetPlatform"],
                test_url=item["testUrl"],
                required_role=item["requiredRole"],
                test_type=item.get("testType", "功能测试"),
                automation=automation_value,
                remark=automation_reason,
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

        # 已失效（作废）的用例不允许改为"已通过"——数据失效后需重新生成，
        # 不能在旧数据上恢复评审状态。防止前端绕过或同步逻辑误改。
        new_review = update_data.get("review_status")
        is_invalid = tc.validity_status == INVALID or tc.review_status == REVIEW_INVALIDATED
        if new_review == "已通过" and is_invalid:
            from fastapi import HTTPException
            raise HTTPException(
                status_code=400,
                detail="该用例已失效，无法再次评审。请重新生成测试用例",
            )
        field_map = {
            "title": "title",
            "priority": "priority",
            "precondition": "precondition",
            "steps": "steps",
            "test_data": "test_data",
            "expected_result": "expected_result",
            "environment_id": "environment_id",
            "target_platform": "target_platform",
            "test_url": "test_url",
            "required_role": "required_role",
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
        if not await cascade_delete_test_case(self.db, case_id):
            return False
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

    async def batch_update_test_case_review(self, case_ids: list[str], status: str) -> int:
        ids = [str(item) for item in case_ids if str(item).strip()]
        if not ids:
            return 0
        # 已失效（作废）的测试用例不允许改为已通过
        if status == "已通过":
            result = await self.db.execute(
                select(TestCase).where(
                    TestCase.id.in_(ids),
                    or_(
                        TestCase.review_status == REVIEW_INVALIDATED,
                        TestCase.validity_status == INVALID,
                    ),
                )
            )
            invalidated = result.scalars().all()
            if invalidated:
                from fastapi import HTTPException
                raise HTTPException(
                    status_code=400,
                    detail="已作废的测试用例不能改为已通过，请先重新生成测试用例",
                )
        result = await self.db.execute(
            update(TestCase)
            .where(TestCase.id.in_(ids))
            .values(review_status=status, updated_at=self._now())
        )
        await self.db.commit()
        return result.rowcount or 0

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
                TestCase.automation == "是"
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

    def _generate_point_codes(self, items: list[dict]) -> list[str]:
        """生成测试点编号: TP_XXX_NNN。"""
        counters: dict[str, int] = {}
        codes: list[str] = []
        for item in items:
            prefix = self._module_prefix(str(item.get("module", "")))
            counters[prefix] = counters.get(prefix, 0) + 1
            codes.append(f"TP_{prefix}_{counters[prefix]:03d}")
        return codes

    async def _generate_point_code(self, project_id: str, module: str) -> str:
        """生成单个测试点编号，供人工新增场景使用。"""
        prefix = self._module_prefix(module)
        result = await self.db.execute(
            select(TestPoint.point_code).where(
                TestPoint.project_id == project_id,
                TestPoint.point_code.like(f"TP_{prefix}_%"),
            ).order_by(TestPoint.point_code.desc()).limit(1)
        )
        last_code = result.scalar_one_or_none()
        if last_code:
            match = re.search(r'(\d+)$', last_code)
            number = int(match.group(1)) + 1 if match else 1
        else:
            number = 1
        return f"TP_{prefix}_{number:03d}"

    @staticmethod
    def _module_prefix(module: str) -> str:
        module_map = {
            "用户管理": "USER", "订单处理": "ORDER", "菜单": "MENU",
            "客户管理": "CUST", "登录": "LOGIN", "系统": "SYS",
        }
        return module_map.get(module, re.sub(r'[^A-Z]', '', module.upper())[:4] or "GEN")
