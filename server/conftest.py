"""Shared fixtures for backend tests."""
import os
import asyncio
import sys

_VENV = os.path.join(os.path.dirname(__file__), "venv", "lib", "python3.14", "site-packages")
if _VENV not in sys.path:
    sys.path.insert(0, _VENV)

import pytest
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from fastapi.testclient import TestClient

from app.database import Base, get_db
from app.main import app
from app.models.project import Project
from app.models.requirement import Requirement
from app.models.test_point import TestPoint
from app.models.test_case import TestCase
from app.models.file_asset import FileAsset
from app.models.ai_task import AITask
from app.models.automation_script import AutomationScript
from app.models.environment_config import EnvironmentConfig, TestAccount
from app.models.user import User
from app.routers.auth import create_token

TEST_DATABASE_URL_ASYNC = "sqlite+aiosqlite:///:memory:"
TEST_DATABASE_URL_SYNC = "sqlite:///:memory:"


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


# ─── Sync DB (for model tests + sample data) ─────────────────────────────

@pytest.fixture()
def sync_engine():
    engine = create_engine(TEST_DATABASE_URL_SYNC, connect_args={"check_same_thread": False})

    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


@pytest.fixture()
def db(sync_engine):
    SessionLocal = sessionmaker(bind=sync_engine)
    session = SessionLocal()
    yield session
    session.close()


# ─── Async DB + TestClient (for API tests) ───────────────────────────────

@pytest.fixture()
def async_engine(event_loop):
    engine = create_async_engine(TEST_DATABASE_URL_ASYNC, echo=False)

    @event.listens_for(engine.sync_engine, "connect")
    def set_sqlite_pragma_async(dbapi_connection, connection_record):
        import sqlite3
        if isinstance(dbapi_connection, sqlite3.Connection):
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    async def _create():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    event_loop.run_until_complete(_create())
    yield engine
    event_loop.run_until_complete(engine.dispose())


@pytest.fixture()
def client(async_engine, event_loop):
    session_factory = async_sessionmaker(async_engine, class_=AsyncSession, expire_on_commit=False)

    async def override_get_db():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db

    with TestClient(app) as c:
        yield c

    app.dependency_overrides.clear()


@pytest.fixture()
def auth_token(api_user):
    """Generate a JWT token for API tests."""
    return create_token(api_user.id, api_user.phone, api_user.nickname, api_user.is_admin)


@pytest.fixture()
def auth_headers(auth_token):
    """Provide authorization headers for API tests."""
    return {"Authorization": f"Bearer {auth_token}"}


# ─── Sample Data (sync-based for both model and API tests) ───────────────

@pytest.fixture
def sample_user(db):
    user = User(
        id="test-user-001",
        phone="13800138000",
        password_hash="hashed_password",
        nickname="测试用户"
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def sample_project(db, sample_user):
    project = Project(
        id="test-project-001", name="测试项目",
        test_type="功能测试", test_status="待测试", doc_status="待解析",
        user_id=sample_user.id, description="这是一个测试项目",
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@pytest.fixture
def sample_requirement(db, sample_project):
    req = Requirement(
        id="test-req-001", project_id=sample_project.id,
        module="用户管理", feature="登录功能",
        source="PRD-1.0", risk="中",
        rule="用户输入正确的用户名和密码可以登录",
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    return req


@pytest.fixture
def sample_test_point(db, sample_project, sample_requirement):
    tp = TestPoint(
        id="test-tp-001", project_id=sample_project.id,
        requirement_id=sample_requirement.id,
        module="用户管理", type="正常流程",
        title="验证正确用户名密码登录",
        description="输入正确的用户名和密码，点击登录按钮",
        priority="P0", automatable=True, review_status="待评审",
    )
    db.add(tp)
    db.commit()
    db.refresh(tp)
    return tp


@pytest.fixture
def sample_test_case(db, sample_project, sample_test_point, sample_requirement):
    tc = TestCase(
        id="test-tc-001", project_id=sample_project.id,
        test_point_id=sample_test_point.id,
        requirement_id=sample_requirement.id,
        case_code="TC_LOGIN_001", module="用户管理", feature="登录功能",
        title="验证正确凭据登录成功", priority="P0",
        precondition="用户已注册账号",
        steps="1. 打开登录页面\n2. 输入用户名\n3. 输入密码\n4. 点击登录",
        test_data="用户名: testuser, 密码: Test@123",
        expected_result="登录成功，跳转到首页",
        automation="适合", review_status="待评审",
    )
    db.add(tc)
    db.commit()
    db.refresh(tc)
    return tc


# ─── Async helper for creating API test data ──────────────────────────────

def _create_async_obj(event_loop, engine, obj):
    sf = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def _run():
        async with sf() as s:
            s.add(obj)
            await s.commit()
            await s.refresh(obj)

    event_loop.run_until_complete(_run())
    return obj


@pytest.fixture
def api_user(async_engine, event_loop):
    """User in async DB for API tests."""
    user = User(
        id="api-user-001",
        phone="13900139000",
        password_hash="hashed_password",
        nickname="API测试用户"
    )
    return _create_async_obj(event_loop, async_engine, user)


@pytest.fixture
def api_project(async_engine, api_user, event_loop):
    """Project in async DB for API tests."""
    project = Project(
        id="api-project-001", name="API测试项目",
        test_type="功能测试", test_status="待测试", doc_status="待解析",
        user_id=api_user.id,
    )
    return _create_async_obj(event_loop, async_engine, project)


@pytest.fixture
def api_requirement(async_engine, api_project, event_loop):
    req = Requirement(
        id="api-req-001", project_id=api_project.id,
        module="用户管理", feature="登录功能",
    )
    return _create_async_obj(event_loop, async_engine, req)


@pytest.fixture
def api_test_point(async_engine, api_project, api_requirement, event_loop):
    tp = TestPoint(
        id="api-tp-001", project_id=api_project.id,
        requirement_id=api_requirement.id,
        module="用户管理", type="正常流程", title="测试登录",
        priority="P0", automatable=True,
    )
    return _create_async_obj(event_loop, async_engine, tp)


@pytest.fixture
def api_environment(async_engine, api_project, event_loop):
    environment = EnvironmentConfig(
        id="api-env-001", project_id=api_project.id, name="测试环境",
        web_url="https://pc.example.test", app_url="app://test-build",
        timeout="30", retry_count="1", is_default=True,
    )
    return _create_async_obj(event_loop, async_engine, environment)


@pytest.fixture
def api_test_account(async_engine, api_environment, event_loop):
    account = TestAccount(
        id="api-account-001", environment_id=api_environment.id,
        name="管理员", username="admin", password="enc:dummy", role="管理员",
    )
    return _create_async_obj(event_loop, async_engine, account)


@pytest.fixture
def api_test_case(async_engine, api_project, api_test_point, api_requirement, api_environment, event_loop):
    tc = TestCase(
        id="api-tc-001", project_id=api_project.id,
        test_point_id=api_test_point.id,
        requirement_id=api_requirement.id,
        case_code="TC_LOGIN_001", module="用户管理", feature="登录功能",
        title="验证登录", priority="P0",
        environment_id=api_environment.id, target_platform="PC",
        test_url=api_environment.web_url, required_role="管理员",
    )
    return _create_async_obj(event_loop, async_engine, tc)


@pytest.fixture
def api_script(async_engine, api_project, api_test_case, event_loop):
    script = AutomationScript(
        id="api-script-001", project_id=api_project.id,
        test_case_id=api_test_case.id, script_code="SC_LOGIN_001",
        script_type="UI", framework="Playwright", language="Python", code="pass",
    )
    return _create_async_obj(event_loop, async_engine, script)
