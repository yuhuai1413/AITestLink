from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.automation_script import AutomationScript
from app.models.execution_run import ExecutionRun
from app.models.requirement import Requirement
from app.models.test_case import TestCase
from app.models.test_point import TestPoint


VALID = "有效"
INVALID = "已失效"
REVIEW_INVALIDATED = "已作废"


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def valid_filter(model):
    return model.validity_status == VALID


async def invalidate_requirements(db: AsyncSession, project_id: str, reason: str) -> None:
    timestamp = now_utc()
    await db.execute(update(Requirement).where(Requirement.project_id == project_id).values(
        validity_status=INVALID, invalid_reason=reason, invalidated_at=timestamp, updated_at=timestamp,
    ))
    await invalidate_after_requirements(db, project_id, reason, timestamp)


async def invalidate_after_requirements(
    db: AsyncSession,
    project_id: str,
    reason: str,
    timestamp: datetime | None = None,
) -> None:
    timestamp = timestamp or now_utc()
    await db.execute(update(TestPoint).where(TestPoint.project_id == project_id).values(
        validity_status=INVALID, review_status=REVIEW_INVALIDATED,
        invalid_reason=reason, invalidated_at=timestamp, updated_at=timestamp,
    ))
    await invalidate_after_test_points(db, project_id, reason, timestamp)


async def invalidate_after_test_points(
    db: AsyncSession,
    project_id: str,
    reason: str,
    timestamp: datetime | None = None,
) -> None:
    timestamp = timestamp or now_utc()
    await db.execute(update(TestCase).where(TestCase.project_id == project_id).values(
        validity_status=INVALID, review_status=REVIEW_INVALIDATED,
        invalid_reason=reason, invalidated_at=timestamp, updated_at=timestamp,
    ))
    await invalidate_after_test_cases(db, project_id, reason, timestamp)


async def invalidate_after_test_cases(
    db: AsyncSession,
    project_id: str,
    reason: str,
    timestamp: datetime | None = None,
) -> None:
    timestamp = timestamp or now_utc()
    await db.execute(update(AutomationScript).where(AutomationScript.project_id == project_id).values(
        validity_status=INVALID, review_status=REVIEW_INVALIDATED,
        invalid_reason=reason, invalidated_at=timestamp, updated_at=timestamp,
    ))
    await invalidate_after_scripts(db, project_id, reason, timestamp)


async def invalidate_after_scripts(
    db: AsyncSession,
    project_id: str,
    reason: str,
    timestamp: datetime | None = None,
) -> None:
    timestamp = timestamp or now_utc()
    await db.execute(update(ExecutionRun).where(ExecutionRun.project_id == project_id).values(
        validity_status=INVALID, invalid_reason=reason, invalidated_at=timestamp,
    ))


async def cascade_delete_test_point(db: AsyncSession, point_id: str) -> bool:
    point = (await db.execute(select(TestPoint).where(TestPoint.id == point_id))).scalar_one_or_none()
    if not point:
        return False
    await _delete_points_by_ids(db, [point_id])
    return True


async def cascade_delete_requirement(db: AsyncSession, requirement_id: str) -> bool:
    requirement = (await db.execute(
        select(Requirement).where(Requirement.id == requirement_id)
    )).scalar_one_or_none()
    if not requirement:
        return False

    point_ids = (await db.execute(
        select(TestPoint.id).where(TestPoint.requirement_id == requirement_id)
    )).scalars().all()
    await _delete_points_by_ids(db, point_ids)

    direct_case_ids = (await db.execute(
        select(TestCase.id).where(TestCase.requirement_id == requirement_id)
    )).scalars().all()
    await _delete_cases_by_ids(db, direct_case_ids)

    await db.execute(delete(Requirement).where(Requirement.id == requirement_id))
    return True


async def cascade_delete_test_case(db: AsyncSession, case_id: str) -> bool:
    case = (await db.execute(select(TestCase).where(TestCase.id == case_id))).scalar_one_or_none()
    if not case:
        return False
    await _delete_cases_by_ids(db, [case_id])
    return True


async def cascade_delete_script(db: AsyncSession, script_id: str) -> bool:
    script = (await db.execute(select(AutomationScript).where(AutomationScript.id == script_id))).scalar_one_or_none()
    if not script:
        return False
    await db.execute(delete(ExecutionRun).where(ExecutionRun.script_id == script_id))
    await db.execute(delete(AutomationScript).where(AutomationScript.id == script_id))
    return True


async def _delete_points_by_ids(db: AsyncSession, point_ids: list[str]) -> None:
    if not point_ids:
        return
    case_ids = (await db.execute(
        select(TestCase.id).where(TestCase.test_point_id.in_(point_ids))
    )).scalars().all()
    await _delete_cases_by_ids(db, case_ids)
    await db.execute(delete(TestPoint).where(TestPoint.id.in_(point_ids)))


async def _delete_cases_by_ids(db: AsyncSession, case_ids: list[str]) -> None:
    if not case_ids:
        return
    script_ids = (await db.execute(
        select(AutomationScript.id).where(AutomationScript.test_case_id.in_(case_ids))
    )).scalars().all()
    if script_ids:
        await db.execute(delete(ExecutionRun).where(ExecutionRun.script_id.in_(script_ids)))
        await db.execute(delete(AutomationScript).where(AutomationScript.id.in_(script_ids)))
    await db.execute(delete(ExecutionRun).where(ExecutionRun.test_case_id.in_(case_ids)))
    await db.execute(delete(TestCase).where(TestCase.id.in_(case_ids)))
