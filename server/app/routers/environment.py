from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.routers.auth import get_current_user
from app.schemas.environment_config import (
    EnvironmentConfigCreate, EnvironmentConfigUpdate,
    TestAccountCreate, TestAccountUpdate
)
from app.services.environment_service import EnvironmentService

router = APIRouter()


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
    result = await service.update(config_id, data, user["sub"])
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
