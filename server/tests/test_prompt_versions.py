import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.model_config import ModelConfig
from app.models.prompt_version import PromptVersion
from app.models.user import User
from app.routers.auth import create_token
from app.services.prompt_service import get_published_prompt


@pytest.fixture()
def admin_headers(async_engine, event_loop):
    session_factory = async_sessionmaker(async_engine, class_=AsyncSession, expire_on_commit=False)
    admin = User(
        id="api-admin-001",
        phone="13500135000",
        password_hash="hashed",
        nickname="API管理员",
        is_admin=True,
    )

    async def create_admin():
        async with session_factory() as session:
            session.add(admin)
            await session.commit()

    event_loop.run_until_complete(create_admin())
    token = create_token(admin.id, admin.phone, admin.nickname, True)
    return {"Authorization": f"Bearer {token}"}


def test_admin_can_publish_draft_and_rollback_prompt(client, admin_headers):
    published = client.put(
        "/api/model-configs/admin-prompts",
        json={"prompts": [{"configKey": "parse-requirements", "prompt": "版本一"}]},
        headers=admin_headers,
    )
    assert published.status_code == 200
    assert published.json()["updated"] == 1

    draft = client.post(
        "/api/model-configs/admin-prompts/parse-requirements/draft",
        json={"prompt": "版本二草稿"},
        headers=admin_headers,
    )
    assert draft.status_code == 200
    draft_id = draft.json()["version"]["id"]
    assert draft.json()["version"]["status"] == "draft"

    publish_draft = client.post(
        f"/api/model-configs/admin-prompts/parse-requirements/publish/{draft_id}",
        headers=admin_headers,
    )
    assert publish_draft.status_code == 200
    assert publish_draft.json()["version"]["status"] == "published"

    versions = client.get(
        "/api/model-configs/admin-prompts/parse-requirements/versions",
        headers=admin_headers,
    ).json()
    version_one = next(item for item in versions if item["prompt"] == "版本一")
    assert version_one["status"] == "archived"

    rollback = client.post(
        f"/api/model-configs/admin-prompts/parse-requirements/rollback/{version_one['id']}",
        headers=admin_headers,
    )
    assert rollback.status_code == 200
    assert rollback.json()["version"]["prompt"] == "版本一"
    assert rollback.json()["version"]["version"] == 3


def test_runtime_prefers_published_version_over_legacy_copy(async_engine, event_loop):
    session_factory = async_sessionmaker(async_engine, class_=AsyncSession, expire_on_commit=False)

    async def run():
        async with session_factory() as session:
            admin = User(
                id="version-admin",
                phone="13400134000",
                password_hash="hashed",
                nickname="版本管理员",
                is_admin=True,
            )
            session.add(admin)
            session.add(ModelConfig(
                id="legacy-admin-config",
                user_id=admin.id,
                config_key="parse-requirements",
                name="需求解析",
                ai_node="[]",
                provider="provider",
                model_name="model",
                prompt="旧提示词副本",
            ))
            session.add(PromptVersion(
                id="published-version",
                config_key="parse-requirements",
                version=1,
                content="集中发布提示词",
                status="published",
                created_by=admin.id,
            ))
            await session.commit()
            assert await get_published_prompt(session, "parse-requirements") == "集中发布提示词"

    event_loop.run_until_complete(run())
