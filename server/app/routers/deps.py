from __future__ import annotations

from typing import Optional

from fastapi import Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.project_service import ProjectService
from app.services.document_service import DocumentService
from app.services.test_design_service import TestDesignService
from app.services.automation_service import AutomationService
from app.services.auth_service import AuthService, decode_token
from app.services.model_config_service import ModelConfigService
from app.services.doc_template_service import DocTemplateService
from app.services.status_log_service import StatusLogService


# ── 认证依赖 ────────────────────────────────────────────────────────

async def get_current_user(
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="未登录")
    token = authorization.removeprefix("Bearer ")
    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="登录已过期，请重新登录")

    # 检查用户是否仍激活
    from sqlalchemy import select
    from app.models.user import User
    user_id = payload.get("sub")
    if user_id:
        result = await db.execute(select(User).where(User.id == user_id))
        db_user = result.scalar_one_or_none()
        if not db_user or not db_user.is_active:
            raise HTTPException(status_code=401, detail="账号已被禁用，请联系管理员")

    return payload


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="需要管理员权限")
    return user


# ── Service 依赖注入 ────────────────────────────────────────────────

async def get_project_service(db: AsyncSession = Depends(get_db)) -> ProjectService:
    return ProjectService(db)


async def get_document_service(db: AsyncSession = Depends(get_db)) -> DocumentService:
    return DocumentService(db)


async def get_test_design_service(db: AsyncSession = Depends(get_db)) -> TestDesignService:
    return TestDesignService(db)


async def get_automation_service(db: AsyncSession = Depends(get_db)) -> AutomationService:
    return AutomationService(db)


async def get_auth_service(db: AsyncSession = Depends(get_db)) -> AuthService:
    return AuthService(db)


async def get_model_config_service(db: AsyncSession = Depends(get_db)) -> ModelConfigService:
    return ModelConfigService(db)


async def get_doc_template_service(db: AsyncSession = Depends(get_db)) -> DocTemplateService:
    return DocTemplateService(db)


async def get_status_log_service(db: AsyncSession = Depends(get_db)) -> StatusLogService:
    return StatusLogService(db)
