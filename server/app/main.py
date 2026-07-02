from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import init_db
from app.routers import projects, files, requirements, test_points, test_cases, ai


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


@app.get("/api/health")
async def health():
    return {"status": "ok"}
