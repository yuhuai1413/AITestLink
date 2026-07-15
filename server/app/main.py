import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# 配置日志级别
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logging.getLogger("app").setLevel(logging.INFO)

from app.config import settings
from app.database import init_db, close_db, async_session
from app.routers import projects, files, requirements, test_points, test_cases, ai, model_config, auth, automation, doc_config, status_logs, doc_gen, notification, environment

# 导入所有模型，确保表被创建
from app.models import project, requirement, test_point, test_case, file_asset, ai_task, model_config as mc_model, prompt_version, user, automation_script, execution_run, doc_template as dc_model, status_log, doc_gen_status, notification as notif_model
from app.models.environment_config import EnvironmentConfig, TestAccount

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动时清理上次中断的任务
    try:
        from sqlalchemy import update
        from app.models.ai_task import AITask
        async with async_session() as db:
            await db.execute(
                update(AITask).where(AITask.status == "执行中").values(
                    status="失败",
                    error_message="任务因服务器重启而中断，请重新执行",
                )
            )
            await db.commit()
            logger.info("Cleaned up stale AI tasks")
    except Exception as e:
        logger.warning(f"Failed to cleanup stale tasks: {e}")

    await init_db()
    yield
    await close_db()


app = FastAPI(title="AI TestLink API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects.router, prefix="/api/projects", tags=["projects"])
app.include_router(files.router, prefix="/api", tags=["files"])
app.include_router(requirements.router, prefix="/api", tags=["requirements"])
app.include_router(test_points.router, prefix="/api", tags=["test-points"])
app.include_router(test_cases.router, prefix="/api", tags=["test-cases"])
app.include_router(ai.router, prefix="/api", tags=["ai"])
app.include_router(model_config.router, prefix="/api", tags=["model-config"])
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(automation.router, prefix="/api", tags=["automation"])
app.include_router(doc_config.router, prefix="/api", tags=["doc-config"])
app.include_router(doc_gen.router, prefix="/api", tags=["doc-gen"])
app.include_router(status_logs.router, prefix="/api", tags=["status-logs"])
app.include_router(notification.router, prefix="/api", tags=["notifications"])
app.include_router(environment.router, prefix="/api", tags=["environments"])

# 静态文件服务（头像等上传文件）
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")


@app.get("/api/health")
async def health():
    return {"status": "ok"}
