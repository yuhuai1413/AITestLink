from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import init_db
from app.routers import projects, files, requirements, test_points, test_cases, ai, model_config, auth, automation, doc_config, status_logs

# 导入所有模型，确保表被创建
from app.models import project, requirement, test_point, test_case, file_asset, ai_task, model_config as mc_model, user, automation_script, doc_template as dc_model, status_log


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="AITestLink API", version="0.1.0", lifespan=lifespan)

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
app.include_router(status_logs.router, prefix="/api", tags=["status-logs"])

# 静态文件服务（头像等上传文件）
import os
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")


@app.get("/api/health")
async def health():
    return {"status": "ok"}
