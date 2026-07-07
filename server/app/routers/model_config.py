import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.model_config import ModelConfig
from app.routers.auth import get_current_user
from app.utils import encrypt_value, decrypt_value

router = APIRouter()

# 默认模型配置模板（按测试流程排序）
DEFAULT_CONFIGS = [
    {"config_key": "parse-requirements", "name": "需求解析", "ai_node": ["需求解析"], "description": "从需求文档中提取模块、功能点和业务规则，生成结构化需求数据", "display_order": 1},
    {"config_key": "generate-test-points", "name": "测试点生成", "ai_node": ["生成测试点"], "description": "根据需求生成覆盖正常流程、异常流程、边界值等场景的测试点", "display_order": 2},
    {"config_key": "generate-test-cases", "name": "用例生成", "ai_node": ["生成测试用例"], "description": "根据测试点生成包含前置条件、测试步骤和预期结果的详细测试用例", "display_order": 3},
    {"config_key": "review-test-cases", "name": "用例评审", "ai_node": ["用例评审"], "description": "自动评审测试用例的完整性、可执行性和覆盖度", "display_order": 4},
    {"config_key": "generate-scripts", "name": "脚本生成", "ai_node": ["生成脚本"], "description": "根据测试用例自动生成可执行的 Playwright 自动化测试脚本", "display_order": 5},
    {"config_key": "execute-scripts", "name": "执行脚本", "ai_node": ["执行脚本"], "description": "执行自动化测试脚本并收集测试结果", "display_order": 6},
    {"config_key": "generate-docs", "name": "文档生成", "ai_node": ["文档生成"], "description": "根据项目数据自动生成测试计划、测试报告等文档", "display_order": 7},
]


class ModelConfigSchema(BaseModel):
    id: str
    name: str
    aiNode: str
    provider: str
    modelName: str
    apiKey: str
    endpoint: str
    description: str
    enabled: bool


class ModelConfigUpdate(BaseModel):
    configs: list[ModelConfigSchema]


def _to_dict(m: ModelConfig) -> dict:
    # 解析 ai_node 为数组
    try:
        ai_node = json.loads(m.ai_node) if m.ai_node else []
    except (json.JSONDecodeError, TypeError):
        ai_node = [m.ai_node] if m.ai_node else []

    return {
        "id": m.id,
        "configKey": m.config_key,
        "name": m.name,
        "aiNode": ai_node,
        "provider": m.provider,
        "modelName": m.model_name,
        "apiKey": decrypt_value(m.api_key) if m.api_key else "",
        "endpoint": m.endpoint,
        "description": m.description,
        "enabled": m.enabled,
    }


async def _ensure_user_configs(db: AsyncSession, user_id: str):
    """确保用户有所有默认配置，新用户初始配置为空"""
    result = await db.execute(
        select(ModelConfig).where(ModelConfig.user_id == user_id)
    )
    existing = {c.config_key for c in result.scalars().all()}

    for config in DEFAULT_CONFIGS:
        if config["config_key"] not in existing:
            config_id = f"{user_id}_{config['config_key']}"
            db.add(ModelConfig(
                id=config_id,
                user_id=user_id,
                config_key=config["config_key"],
                name=config["name"],
                ai_node=json.dumps(config["ai_node"], ensure_ascii=False),
                provider="",
                model_name="",
                api_key="",
                endpoint="",
                description=config["description"],
                enabled=True,
                display_order=config["display_order"],
            ))

    await db.commit()


@router.get("/model-configs")
async def list_model_configs(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_id = user["sub"]
    await _ensure_user_configs(db, user_id)

    result = await db.execute(
        select(ModelConfig).where(ModelConfig.user_id == user_id).order_by(ModelConfig.display_order)
    )
    configs = result.scalars().all()
    return [_to_dict(c) for c in configs]


@router.get("/model-configs/{config_id}")
async def get_model_config(
    config_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_id = user["sub"]
    result = await db.execute(
        select(ModelConfig).where(ModelConfig.id == config_id, ModelConfig.user_id == user_id)
    )
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="配置不存在")
    return _to_dict(config)


@router.get("/model-configs/check/{config_key}")
async def check_model_config(
    config_key: str,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """检查指定配置是否已配置（供应商、模型、API Key、Endpoint 都不为空）"""
    user_id = user["sub"]
    config_id = f"{user_id}_{config_key}"
    result = await db.execute(
        select(ModelConfig).where(ModelConfig.id == config_id, ModelConfig.user_id == user_id)
    )
    config = result.scalar_one_or_none()
    if not config:
        return {"configured": False, "message": "配置不存在"}

    is_configured = bool(config.provider and config.model_name and config.api_key and config.endpoint)
    return {
        "configured": is_configured,
        "message": "已配置" if is_configured else "请先在模型配置页面设置该功能的模型数据",
        "name": config.name,
    }


@router.put("/model-configs")
async def update_model_configs(
    data: ModelConfigUpdate,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_id = user["sub"]
    result = await db.execute(
        select(ModelConfig).where(ModelConfig.user_id == user_id)
    )
    existing = {c.id: c for c in result.scalars().all()}

    for cfg in data.configs:
        if cfg.id in existing:
            m = existing[cfg.id]
            m.name = cfg.name
            # 将 aiNode 数组转换为 JSON 字符串存储
            if isinstance(cfg.aiNode, list):
                m.ai_node = json.dumps(cfg.aiNode, ensure_ascii=False)
            else:
                m.ai_node = cfg.aiNode
            m.provider = cfg.provider
            m.model_name = cfg.modelName
            m.api_key = encrypt_value(cfg.apiKey) if cfg.apiKey else ""
            m.endpoint = cfg.endpoint
            m.description = cfg.description
            m.enabled = cfg.enabled

    await db.commit()
    return {"ok": True, "count": len(data.configs)}
