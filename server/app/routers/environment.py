import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from typing import Literal

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session, get_db
from app.models.ai_task import AITask
from app.models.environment_config import EnvironmentConfig, TestAccount
from app.routers.auth import get_current_user
from app.schemas.environment_config import (
    EnvironmentConfigCreate, EnvironmentConfigUpdate,
    TestAccountCreate, TestAccountUpdate
)
from app.services.ai_service import check_config_for_task
from app.services.ai_task_support import update_task_status as _update_task_status
from app.services.environment_service import EnvironmentService
from app.services.ui_recognition_service import UIRecognitionService
from app.utils import model_to_dict, verify_project_owner

logger = logging.getLogger(__name__)

router = APIRouter()


class RecognizeUIRequest(BaseModel):
    accountId: str | None = None
    headed: bool = False
    scopeMode: Literal["full", "incremental"] = "full"
    requirementIds: list[str] = []
    requirementText: str = ""


async def run_recognize_ui(
    task_id: str,
    environment_id: str,
    user_id: str,
    account_id: str | None,
    headed: bool,
    scope_mode: str,
    requirement_ids: list[str],
    requirement_text: str,
) -> None:
    """后台执行系统识别：用独立 session 调用 recognize，完成后更新任务状态。

    recognize 方法内部已自包含（写 UISnapshot 表），这里只负责包裹成异步任务
    并在结束时更新 AITask 状态，供前端轮询。
    """
    async with async_session() as db:
        try:
            service = UIRecognitionService(db)
            result = await service.recognize(
                environment_id,
                user_id,
                account_id,
                headed=headed,
                scope_mode=scope_mode,
                requirement_ids=requirement_ids or [],
                requirement_text=requirement_text,
            )
            # recognize 返回 ok:False 表示前置校验未通过（如未配置识别账号）
            if isinstance(result, dict) and result.get("ok") is False:
                await _update_task_status(db, task_id, "失败", result.get("message") or "系统识别未执行")
                return
            await _update_task_status(db, task_id, "成功")
        except Exception as exc:
            logger.exception("run_recognize_ui failed: task_id=%s", task_id)
            friendly = str(exc)[:2000] or "系统识别失败"
            await _update_task_status(db, task_id, "失败", friendly)


@router.get("/projects/{project_id}/environments")
async def list_environments(
    project_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取项目的所有环境配置"""
    service = EnvironmentService(db)
    return await service.list_by_project(project_id, user["sub"])


@router.post("/projects/{project_id}/environments")
async def create_environment(
    project_id: str,
    data: EnvironmentConfigCreate,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """创建环境配置"""
    service = EnvironmentService(db)
    return await service.create(project_id, data, user["sub"])


@router.put("/environments/{config_id}")
async def update_environment(
    config_id: str,
    data: EnvironmentConfigUpdate,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """更新环境配置"""
    service = EnvironmentService(db)
    try:
        result = await service.update(config_id, data, user["sub"])
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not result:
        raise HTTPException(status_code=404, detail="环境配置不存在")
    return result


@router.delete("/environments/{config_id}")
async def delete_environment(
    config_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """删除环境配置"""
    service = EnvironmentService(db)
    success = await service.delete(config_id, user["sub"])
    if not success:
        raise HTTPException(status_code=404, detail="环境配置不存在")
    return {"ok": True}


@router.post("/environments/{environment_id}/accounts")
async def create_account(
    environment_id: str,
    data: TestAccountCreate,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """创建测试账号"""
    data.environmentId = environment_id
    service = EnvironmentService(db)
    result = await service.create_account(data, user["sub"])
    if not result:
        raise HTTPException(status_code=404, detail="环境配置不存在或无权访问")
    return result


@router.put("/accounts/{account_id}")
async def update_account(
    account_id: str,
    data: TestAccountUpdate,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """更新测试账号"""
    service = EnvironmentService(db)
    result = await service.update_account(account_id, data, user["sub"])
    if not result:
        raise HTTPException(status_code=404, detail="测试账号不存在")
    return result


@router.delete("/accounts/{account_id}")
async def delete_account(
    account_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """删除测试账号"""
    service = EnvironmentService(db)
    success = await service.delete_account(account_id, user["sub"])
    if not success:
        raise HTTPException(status_code=404, detail="测试账号不存在")
    return {"ok": True}


@router.get("/environments/{environment_id}/ui-snapshot")
async def get_ui_snapshot(
    environment_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取环境最近一次系统识别结果"""
    service = UIRecognitionService(db)
    try:
        result = await service.latest_snapshot(environment_id, user["sub"])
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return result or {"ok": False, "message": "暂无识别结果"}


@router.post("/environments/{environment_id}/ui-snapshot/recognize")
async def recognize_ui_snapshot(
    environment_id: str,
    data: RecognizeUIRequest,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """登录目标系统并识别页面结构，用于后续生成更稳定的自动化脚本。

    改为异步任务模式：立即返回 AITask（status=执行中），识别在后台进行，
    前端通过 /ai/tasks 轮询任务状态，完成后拉取 /ui-snapshot 获取结果。
    这样切换页面不会丢失"识别中"状态。
    """
    # 校验环境存在并拿到 project_id
    environment = (await db.execute(
        select(EnvironmentConfig).where(EnvironmentConfig.id == environment_id)
    )).scalar_one_or_none()
    if not environment:
        raise HTTPException(status_code=404, detail="环境不存在")
    # 通过项目归属校验权限
    await verify_project_owner(db, environment.project_id, user["sub"])
    if environment.environment_type == "APP":
        raise HTTPException(status_code=400, detail="APP 环境暂不支持系统识别")
    if not environment.web_url:
        raise HTTPException(status_code=400, detail="请先配置 Web 地址")

    # 校验模型配置（系统识别节点）
    config_check = await check_config_for_task("系统识别", user["sub"])
    if not config_check["configured"]:
        raise HTTPException(status_code=400, detail=config_check["message"])

    # 校验识别账号：未手动指定账号时，必须存在识别账号（is_admin=True），
    # 否则不创建任务、直接提示用户先配置识别账号。
    if not data.accountId:
        admin_account = (await db.execute(
            select(TestAccount).where(
                TestAccount.environment_id == environment_id,
                TestAccount.is_admin.is_(True),
            ).limit(1)
        )).scalar_one_or_none()
        if not admin_account:
            raise HTTPException(
                status_code=400,
                detail="该环境尚未配置识别账号。请在「环境配置 → 账号管理」中标记一个识别账号（优先选能看到完整菜单的角色），再执行系统识别。",
            )

    # 创建任务记录
    task = AITask(
        id=str(uuid.uuid4()),
        project_id=environment.project_id,
        type="系统识别",
        status="执行中",
        model_name="AI",
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)

    # 派发后台任务，立即返回
    background_tasks.add_task(
        run_recognize_ui,
        task.id,
        environment_id,
        user["sub"],
        data.accountId,
        data.headed,
        data.scopeMode,
        data.requirementIds,
        data.requirementText,
    )
    return model_to_dict(task)
