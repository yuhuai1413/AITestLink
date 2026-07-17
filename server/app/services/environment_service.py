import json
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session
from app.models.environment_config import EnvironmentConfig, TestAccount
from app.schemas.environment_config import (
    EnvironmentConfigCreate, EnvironmentConfigUpdate,
    TestAccountCreate, TestAccountUpdate
)
from app.utils import decrypt_value, encrypt_value, verify_project_owner


def _captcha_required(environment: EnvironmentConfig) -> bool:
    """Default legacy rows to requiring captcha unless explicitly disabled."""
    return environment.captcha_required is not False


def _environment_type(environment: EnvironmentConfig) -> str:
    value = (getattr(environment, "environment_type", "") or "").strip()
    if value in {"Web", "APP"}:
        return value
    return "APP" if (environment.app_url and not environment.web_url) else "Web"


def _target_url(environment: EnvironmentConfig) -> str:
    return (environment.app_url if _environment_type(environment) == "APP" else environment.web_url) or ""


def _normalize_target_fields(environment_type: str, web_url: str = "", app_url: str = "") -> tuple[str, str]:
    if environment_type == "APP":
        return "", app_url
    return web_url, ""


class EnvironmentService:
    """环境配置服务"""

    def __init__(self, db: AsyncSession | None = None):
        self._db = db

    @asynccontextmanager
    async def _session(self):
        """Reuse the request transaction when provided; own only fallback sessions."""
        if self._db is not None:
            yield self._db
            return
        async with async_session() as db:
            yield db

    async def list_by_project(self, project_id: str, user_id: str) -> list[dict]:
        """获取项目的所有环境配置"""
        async with self._session() as db:
            await verify_project_owner(db, project_id, user_id)
            result = await db.execute(
                select(EnvironmentConfig).where(
                    EnvironmentConfig.project_id == project_id
                ).order_by(EnvironmentConfig.created_at)
            )
            configs = result.scalars().all()

            items = []
            for config in configs:
                # 获取该环境下的测试账号
                account_result = await db.execute(
                    select(TestAccount).where(
                        TestAccount.environment_id == config.id
                    ).order_by(TestAccount.created_at)
                )
                accounts = account_result.scalars().all()
                # 兼容旧数据：首次读取时将历史明文密码迁移为带版本标记的密文。
                migrated = False
                for account in accounts:
                    if account.password and not account.password.startswith("enc:"):
                        account.password = f"enc:{encrypt_value(account.password)}"
                        migrated = True
                if migrated:
                    await db.commit()

                items.append({
                    "id": config.id,
                    "projectId": config.project_id,
                    "name": config.name,
                    "environmentType": _environment_type(config),
                    "webUrl": config.web_url or "",
                    "appUrl": config.app_url or "",
                    "targetUrl": _target_url(config),
                    "otherUrls": config.other_urls or "",
                    "timeout": config.timeout or "30",
                    "retryCount": config.retry_count or "3",
                    "captchaRequired": _captcha_required(config),
                    "captchaCode": config.captcha_code or "",
                    "notes": config.notes or "",
                    "isDefault": bool(config.is_default),
                    "createdAt": config.created_at.isoformat() if config.created_at else "",
                    "updatedAt": config.updated_at.isoformat() if config.updated_at else "",
                    "accounts": [
                        {
                            "id": acc.id,
                            "environmentId": acc.environment_id,
                            "name": acc.name,
                            "username": acc.username,
                            "department": acc.department or "",
                            "password": "",
                            "hasPassword": bool(acc.password),
                            "role": acc.role or "",
                            "notes": acc.notes or "",
                            "createdAt": acc.created_at.isoformat() if acc.created_at else "",
                            "updatedAt": acc.updated_at.isoformat() if acc.updated_at else "",
                        }
                        for acc in accounts
                    ],
                })
            return items

    async def create(self, project_id: str, data: EnvironmentConfigCreate, user_id: str) -> dict:
        """创建环境配置"""
        async with self._session() as db:
            await verify_project_owner(db, project_id, user_id)
            existing_result = await db.execute(select(EnvironmentConfig.id).where(
                EnvironmentConfig.project_id == project_id,
                EnvironmentConfig.environment_type == data.environmentType,
            ).limit(1))
            make_default = data.isDefault or existing_result.scalar_one_or_none() is None
            if make_default:
                for item in (await db.execute(select(EnvironmentConfig).where(
                    EnvironmentConfig.project_id == project_id,
                    EnvironmentConfig.environment_type == data.environmentType,
                ))).scalars().all():
                    item.is_default = False
            web_url, app_url = _normalize_target_fields(data.environmentType, data.webUrl, data.appUrl)
            config = EnvironmentConfig(
                id=str(__import__("uuid").uuid4()),
                project_id=project_id,
                name=data.name,
                environment_type=data.environmentType,
                web_url=web_url,
                app_url=app_url,
                other_urls=data.otherUrls,
                timeout=data.timeout,
                retry_count=data.retryCount,
                captcha_required=data.captchaRequired,
                captcha_code=data.captchaCode,
                notes=data.notes,
                is_default=make_default,
            )
            db.add(config)
            await db.commit()
            await db.refresh(config)

            return {
                "id": config.id,
                "projectId": config.project_id,
                "name": config.name,
                "environmentType": _environment_type(config),
                "webUrl": config.web_url or "",
                "appUrl": config.app_url or "",
                "targetUrl": _target_url(config),
                "otherUrls": config.other_urls or "",
                "timeout": config.timeout or "30",
                "retryCount": config.retry_count or "3",
                "captchaRequired": _captcha_required(config),
                "captchaCode": config.captcha_code or "",
                "notes": config.notes or "",
                "isDefault": bool(config.is_default),
                "accounts": [],
                "createdAt": config.created_at.isoformat() if config.created_at else "",
                "updatedAt": config.updated_at.isoformat() if config.updated_at else "",
            }

    async def update(self, config_id: str, data: EnvironmentConfigUpdate, user_id: str) -> dict | None:
        """更新环境配置"""
        async with self._session() as db:
            result = await db.execute(
                select(EnvironmentConfig).where(EnvironmentConfig.id == config_id)
            )
            config = result.scalar_one_or_none()
            if not config:
                return None
            await verify_project_owner(db, config.project_id, user_id)

            if data.name is not None:
                config.name = data.name
            target_type = data.environmentType or _environment_type(config)
            if data.environmentType is not None:
                config.environment_type = data.environmentType
            if data.webUrl is not None:
                config.web_url = data.webUrl
            if data.appUrl is not None:
                config.app_url = data.appUrl
            if data.environmentType is not None or data.webUrl is not None or data.appUrl is not None:
                if target_type == "Web":
                    config.app_url = ""
                    if not (config.web_url or "").strip():
                        raise ValueError("Web 环境必须配置 Web 地址")
                else:
                    config.web_url = ""
                    if not (config.app_url or "").strip():
                        raise ValueError("APP 环境必须配置 APP 地址")
            if data.otherUrls is not None:
                config.other_urls = data.otherUrls
            if data.timeout is not None:
                config.timeout = data.timeout
            if data.retryCount is not None:
                config.retry_count = data.retryCount
            if data.captchaRequired is not None:
                config.captcha_required = data.captchaRequired
            if data.captchaCode is not None:
                config.captcha_code = data.captchaCode
            if data.notes is not None:
                config.notes = data.notes
            if data.isDefault is True:
                for item in (await db.execute(select(EnvironmentConfig).where(
                    EnvironmentConfig.project_id == config.project_id,
                    EnvironmentConfig.environment_type == _environment_type(config),
                    EnvironmentConfig.id != config.id,
                ))).scalars().all():
                    item.is_default = False
                config.is_default = True
            elif data.isDefault is False and config.is_default:
                config.is_default = False

            await db.commit()
            await db.refresh(config)

            # 重新获取完整数据（包含账号）
            configs = await self.list_by_project(config.project_id, user_id)
            return next((item for item in configs if item["id"] == config_id), None)

    async def delete(self, config_id: str, user_id: str) -> bool:
        """删除环境配置"""
        async with self._session() as db:
            result = await db.execute(
                select(EnvironmentConfig).where(EnvironmentConfig.id == config_id)
            )
            config = result.scalar_one_or_none()
            if not config:
                return False
            await verify_project_owner(db, config.project_id, user_id)

            # 删除关联的测试账号
            account_result = await db.execute(
                select(TestAccount).where(TestAccount.environment_id == config_id)
            )
            for acc in account_result.scalars().all():
                await db.delete(acc)

            await db.delete(config)
            await db.commit()
            return True

    async def get_generation_context(self, project_id: str, user_id: str) -> dict:
        """Return the default environment without usernames or passwords."""
        async with self._session() as db:
            await verify_project_owner(db, project_id, user_id)
            result = await db.execute(
                select(EnvironmentConfig)
                .where(EnvironmentConfig.project_id == project_id)
                .order_by(EnvironmentConfig.is_default.desc(), EnvironmentConfig.created_at.asc())
            )
            environments = list(result.scalars().all())
            if not environments:
                raise ValueError("尚未配置测试环境，请先填写 Web 地址或 APP 地址")
            web_environment = self._pick_default_environment(environments, "Web")
            app_environment = self._pick_default_environment(environments, "APP")
            if not web_environment and not app_environment:
                raise ValueError("尚未配置有效的 Web 或 APP 测试入口")

            targets = []
            role_set: set[str] = set()
            for platform, environment in (("PC", web_environment), ("APP", app_environment)):
                if not environment:
                    continue
                url = _target_url(environment)
                if not url:
                    continue
                accounts = list((await db.execute(
                    select(TestAccount).where(TestAccount.environment_id == environment.id)
                    .order_by(TestAccount.created_at.asc())
                )).scalars().all())
                roles = sorted({(item.role or item.name).strip() for item in accounts if (item.role or item.name).strip()})
                role_set.update(roles)
                targets.append({
                    "platform": platform,
                    "environmentId": environment.id,
                    "environmentName": environment.name,
                    "url": url,
                    "availableRoles": roles,
                })
            primary = web_environment or app_environment
            return {
                "environmentId": primary.id,
                "environmentName": primary.name,
                "targets": targets,
                "availableRoles": sorted(role_set),
                "loginCaptcha": {
                    "required": _captcha_required(web_environment) if web_environment else False,
                    "codeEnv": "TEST_LOGIN_CAPTCHA_CODE",
                    "requiredEnv": "TEST_LOGIN_CAPTCHA_REQUIRED",
                    "hasFixedCode": bool(web_environment and web_environment.captcha_code),
                },
                "timeoutSeconds": int(primary.timeout or 30),
                "retryCount": int(primary.retry_count or 0),
            }

    async def build_runtime_variables(
        self,
        environment_id: str,
        user_id: str,
        account_id: str | None = None,
    ) -> tuple[dict[str, str], dict]:
        """Resolve secrets for an isolated worker and return a safe audit snapshot."""
        async with self._session() as db:
            environment = (await db.execute(select(EnvironmentConfig).where(
                EnvironmentConfig.id == environment_id
            ))).scalar_one_or_none()
            if not environment:
                raise ValueError("测试环境不存在")
            await verify_project_owner(db, environment.project_id, user_id)

            account = None
            if account_id:
                account = (await db.execute(select(TestAccount).where(
                    TestAccount.id == account_id,
                    TestAccount.environment_id == environment.id,
                ))).scalar_one_or_none()
                if not account:
                    raise ValueError("所选账号不属于当前测试环境")

            variables = {
                "WEB_BASE_URL": environment.web_url if _environment_type(environment) == "Web" else "",
                "APP_BASE_URL": environment.app_url if _environment_type(environment) == "APP" else "",
                "TEST_TIMEOUT": environment.timeout or "30",
                "TEST_RETRY_COUNT": environment.retry_count or "0",
                "TEST_LOGIN_CAPTCHA_REQUIRED": "true" if _captcha_required(environment) else "false",
                "LOGIN_CAPTCHA_REQUIRED": "true" if _captcha_required(environment) else "false",
                "TEST_LOGIN_CAPTCHA_CODE": environment.captcha_code or "",
                "LOGIN_CAPTCHA_CODE": environment.captcha_code or "",
            }
            if account:
                encrypted = account.password or ""
                variables["TEST_USERNAME"] = account.username
                variables["TEST_PASSWORD"] = decrypt_value(encrypted[4:] if encrypted.startswith("enc:") else encrypted)
                variables["TEST_ACCOUNT_ROLE"] = account.role or account.name

            snapshot = {
                "environmentId": environment.id,
                "environmentName": environment.name,
                "environmentType": _environment_type(environment),
                "webUrl": environment.web_url or "",
                "appUrl": environment.app_url or "",
                "targetUrl": _target_url(environment),
                "timeoutSeconds": int(environment.timeout or 30),
                "retryCount": int(environment.retry_count or 0),
                "captchaRequired": _captcha_required(environment),
                "hasCaptchaCode": bool(environment.captcha_code),
                "accountId": account.id if account else None,
                "accountRole": (account.role or account.name) if account else "无",
            }
            return variables, snapshot

    def _pick_default_environment(self, environments: list[EnvironmentConfig], environment_type: str) -> EnvironmentConfig | None:
        typed = [item for item in environments if _environment_type(item) == environment_type and _target_url(item)]
        if not typed:
            return None
        return next((item for item in typed if item.is_default), typed[0])

    async def create_account(self, data: TestAccountCreate, user_id: str) -> dict:
        """创建测试账号"""
        async with self._session() as db:
            environment_result = await db.execute(
                select(EnvironmentConfig).where(EnvironmentConfig.id == data.environmentId)
            )
            environment = environment_result.scalar_one_or_none()
            if not environment:
                return None
            await verify_project_owner(db, environment.project_id, user_id)
            account = TestAccount(
                id=str(__import__("uuid").uuid4()),
                environment_id=data.environmentId,
                name=data.name,
                username=data.username,
                department=data.department,
                password=f"enc:{encrypt_value(data.password)}",
                role=data.role,
                notes=data.notes,
            )
            db.add(account)
            await db.commit()
            await db.refresh(account)

            return {
                "id": account.id,
                "environmentId": account.environment_id,
                "name": account.name,
                "username": account.username,
                "department": account.department or "",
                "password": "",
                "hasPassword": True,
                "role": account.role or "",
                "notes": account.notes or "",
                "createdAt": account.created_at.isoformat() if account.created_at else "",
                "updatedAt": account.updated_at.isoformat() if account.updated_at else "",
            }

    async def update_account(self, account_id: str, data: TestAccountUpdate, user_id: str) -> dict | None:
        """更新测试账号"""
        async with self._session() as db:
            result = await db.execute(
                select(TestAccount).where(TestAccount.id == account_id)
            )
            account = result.scalar_one_or_none()
            if not account:
                return None
            environment_result = await db.execute(
                select(EnvironmentConfig).where(EnvironmentConfig.id == account.environment_id)
            )
            environment = environment_result.scalar_one_or_none()
            if not environment:
                return None
            await verify_project_owner(db, environment.project_id, user_id)

            if data.name is not None:
                account.name = data.name
            if data.username is not None:
                account.username = data.username
            if data.department is not None:
                account.department = data.department
            if data.password:
                account.password = f"enc:{encrypt_value(data.password)}"
            if data.role is not None:
                account.role = data.role
            if data.notes is not None:
                account.notes = data.notes

            await db.commit()
            await db.refresh(account)

            return {
                "id": account.id,
                "environmentId": account.environment_id,
                "name": account.name,
                "username": account.username,
                "department": account.department or "",
                "password": "",
                "hasPassword": bool(account.password),
                "role": account.role or "",
                "notes": account.notes or "",
                "createdAt": account.created_at.isoformat() if account.created_at else "",
                "updatedAt": account.updated_at.isoformat() if account.updated_at else "",
            }

    async def delete_account(self, account_id: str, user_id: str) -> bool:
        """删除测试账号"""
        async with self._session() as db:
            result = await db.execute(
                select(TestAccount).where(TestAccount.id == account_id)
            )
            account = result.scalar_one_or_none()
            if not account:
                return False
            environment_result = await db.execute(
                select(EnvironmentConfig).where(EnvironmentConfig.id == account.environment_id)
            )
            environment = environment_result.scalar_one_or_none()
            if not environment:
                return False
            await verify_project_owner(db, environment.project_id, user_id)

            await db.delete(account)
            await db.commit()
            return True
