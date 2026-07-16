from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

# 根据数据库类型配置
# SQLite 不支持连接池参数，PostgreSQL/MySQL 支持
db_url = settings.DATABASE_URL
if db_url.startswith("sqlite"):
    engine = create_async_engine(db_url, echo=False)
else:
    # PostgreSQL/MySQL 使用连接池
    engine = create_async_engine(
        db_url,
        echo=False,
        pool_size=5,
        max_overflow=10,
        pool_pre_ping=True,
    )

async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with async_session() as session:
        yield session


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        if db_url.startswith("sqlite"):
            await _migrate_sqlite_schema(conn)


async def _migrate_sqlite_schema(conn):
    """Small idempotent migrations for existing local installations."""
    environment_columns = {
        row[1] for row in (await conn.execute(text("PRAGMA table_info(environment_configs)"))).all()
    }
    if "api_url" in environment_columns and "app_url" not in environment_columns:
        await conn.execute(text("ALTER TABLE environment_configs RENAME COLUMN api_url TO app_url"))
        environment_columns.remove("api_url")
        environment_columns.add("app_url")
    if "is_default" not in environment_columns:
        await conn.execute(text("ALTER TABLE environment_configs ADD COLUMN is_default BOOLEAN DEFAULT 0"))
        await conn.execute(text("""
            UPDATE environment_configs
            SET is_default = 1
            WHERE id IN (
                SELECT MIN(id) FROM environment_configs GROUP BY project_id
            )
        """))

    account_columns = {
        row[1] for row in (await conn.execute(text("PRAGMA table_info(test_accounts)"))).all()
    }
    if "department" not in account_columns:
        await conn.execute(text("ALTER TABLE test_accounts ADD COLUMN department VARCHAR(100) DEFAULT ''"))

    case_columns = {
        row[1] for row in (await conn.execute(text("PRAGMA table_info(test_cases)"))).all()
    }
    additions = {
        "environment_id": "VARCHAR(36)",
        "target_platform": "VARCHAR(20) DEFAULT 'PC'",
        "test_url": "VARCHAR(500) DEFAULT ''",
        "required_role": "VARCHAR(100) DEFAULT '无'",
    }
    for name, sql_type in additions.items():
        if name not in case_columns:
            await conn.execute(text(f"ALTER TABLE test_cases ADD COLUMN {name} {sql_type}"))

    point_columns = {
        row[1] for row in (await conn.execute(text("PRAGMA table_info(test_points)"))).all()
    }
    if "point_code" not in point_columns:
        await conn.execute(text("ALTER TABLE test_points ADD COLUMN point_code VARCHAR(50) DEFAULT ''"))
    await conn.execute(text("""
        WITH numbered AS (
            SELECT id, ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY created_at, id) AS rn
            FROM test_points
            WHERE point_code IS NULL OR point_code = ''
        )
        UPDATE test_points
        SET point_code = 'TP_LEGACY_' || printf('%03d', (SELECT rn FROM numbered WHERE numbered.id = test_points.id))
        WHERE id IN (SELECT id FROM numbered)
    """))

    model_config_columns = {
        row[1] for row in (await conn.execute(text("PRAGMA table_info(model_configs)"))).all()
    }
    model_config_additions = {
        "connection_status": "VARCHAR(20) DEFAULT 'untested'",
        "last_tested_at": "DATETIME",
        "last_test_message": "TEXT DEFAULT ''",
        "last_test_latency_ms": "INTEGER",
    }
    for name, sql_type in model_config_additions.items():
        if name not in model_config_columns:
            await conn.execute(text(f"ALTER TABLE model_configs ADD COLUMN {name} {sql_type}"))


async def close_db():
    """关闭数据库连接"""
    await engine.dispose()
