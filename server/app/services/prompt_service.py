"""集中管理管理员提示词版本、发布与回滚。"""

from datetime import datetime, timezone

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.model_config import ModelConfig
from app.models.prompt_version import PromptVersion
from app.models.user import User


async def get_published_prompt(db: AsyncSession, config_key: str | None) -> str:
    if not config_key:
        return ""

    result = await db.execute(
        select(PromptVersion.content)
        .where(
            PromptVersion.config_key == config_key,
            PromptVersion.status == "published",
        )
        .order_by(PromptVersion.version.desc())
        .limit(1)
    )
    content = result.scalar_one_or_none()
    if content:
        return content

    # 兼容升级前存储在管理员 ModelConfig 中的数据；新写入不再依赖此副本。
    legacy = await db.execute(
        select(ModelConfig.prompt)
        .join(User, ModelConfig.user_id == User.id)
        .where(
            User.is_admin.is_(True),
            ModelConfig.config_key == config_key,
            ModelConfig.prompt != "",
        )
        .order_by(ModelConfig.updated_at.desc())
        .limit(1)
    )
    return legacy.scalar_one_or_none() or ""


async def _next_version(db: AsyncSession, config_key: str) -> int:
    result = await db.execute(
        select(func.max(PromptVersion.version)).where(PromptVersion.config_key == config_key)
    )
    return (result.scalar_one_or_none() or 0) + 1


async def create_prompt_version(
    db: AsyncSession,
    config_key: str,
    content: str,
    user_id: str,
    *,
    publish: bool = False,
) -> PromptVersion:
    content = content.strip()
    if not content:
        raise ValueError("提示词不能为空")

    if publish:
        await db.execute(
            update(PromptVersion)
            .where(
                PromptVersion.config_key == config_key,
                PromptVersion.status == "published",
            )
            .values(status="archived")
        )

    version = PromptVersion(
        config_key=config_key,
        version=await _next_version(db, config_key),
        content=content,
        status="published" if publish else "draft",
        created_by=user_id,
        published_at=datetime.now(timezone.utc) if publish else None,
    )
    db.add(version)
    await db.flush()
    return version


async def publish_prompt_version(
    db: AsyncSession,
    config_key: str,
    version_id: str,
) -> PromptVersion | None:
    result = await db.execute(
        select(PromptVersion).where(
            PromptVersion.id == version_id,
            PromptVersion.config_key == config_key,
        )
    )
    version = result.scalar_one_or_none()
    if not version:
        return None

    await db.execute(
        update(PromptVersion)
        .where(
            PromptVersion.config_key == config_key,
            PromptVersion.status == "published",
            PromptVersion.id != version_id,
        )
        .values(status="archived")
    )
    version.status = "published"
    version.published_at = datetime.now(timezone.utc)
    await db.flush()
    return version


async def list_prompt_versions(db: AsyncSession, config_key: str) -> list[PromptVersion]:
    result = await db.execute(
        select(PromptVersion)
        .where(PromptVersion.config_key == config_key)
        .order_by(PromptVersion.version.desc())
    )
    return list(result.scalars().all())
