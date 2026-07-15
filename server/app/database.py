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


async def close_db():
    """关闭数据库连接"""
    await engine.dispose()
