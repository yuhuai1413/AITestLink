from fastapi import APIRouter, Depends, HTTPException
from typing import Literal

from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.routers.auth import get_current_user
from app.schemas.environment_config import (
    EnvironmentConfigCreate, EnvironmentConfigUpdate,
    TestAccountCreate, TestAccountUpdate
)
from app.services.environment_service import EnvironmentService
from app.services.ui_recognition_service import UIRecognitionService

router = APIRouter()


class RecognizeUIRequest(BaseModel):
    accountId: str | None = None
    headed: bool = False
    scopeMode: Literal["full", "incremental"] = "full"
    requirementIds: list[str] = []
    requirementText: str = ""


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
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """登录目标系统并识别页面结构，用于后续生成更稳定的自动化脚本。"""
    service = UIRecognitionService(db)
    try:
        return await service.recognize(
            environment_id,
            user["sub"],
            data.accountId,
            headed=data.headed,
            scope_mode=data.scopeMode,
            requirement_ids=data.requirementIds,
            requirement_text=data.requirementText,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
