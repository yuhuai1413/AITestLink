"""Publish the reviewed built-in prompt catalog as immutable administrator versions."""

import asyncio

from sqlalchemy import select

from app.database import async_session
from app.models.user import User
from app.prompts.prompt_catalog import PROMPT_CATALOG
from app.services.prompt_service import create_prompt_version, get_published_prompt


async def main() -> None:
    async with async_session() as db:
        result = await db.execute(
            select(User).where(User.is_admin.is_(True)).order_by(User.created_at.asc()).limit(1)
        )
        admin = result.scalar_one_or_none()
        if not admin:
            raise RuntimeError("没有可用于发布提示词的管理员账号")

        published = 0
        for config_key, content in PROMPT_CATALOG.items():
            if (await get_published_prompt(db, config_key)).strip() == content.strip():
                continue
            await create_prompt_version(db, config_key, content, admin.id, publish=True)
            published += 1
        await db.commit()
        print(f"published={published}")


if __name__ == "__main__":
    asyncio.run(main())
