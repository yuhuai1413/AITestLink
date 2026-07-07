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
    {"id": "parse-requirements", "name": "需求解析", "ai_node": "需求解析", "description": "从需求文档中提取模块、功能点和业务规则，生成结构化需求数据", "display_order": 1},
    {"id": "generate-test-points", "name": "测试点生成", "ai_node": "测试设计", "description": "根据需求生成覆盖正常流程、异常流程、边界值等场景的测试点", "display_order": 2},
    {"id": "generate-test-cases", "name": "用例生成", "ai_node": "测试设计", "description": "根据测试点生成包含前置条件、测试步骤和预期结果的详细测试用例", "display_order": 3},
    {"id": "review-test-cases", "name": "用例评审", "ai_node": "测试设计", "description": "自动评审测试用例的完整性、可执行性和覆盖度", "display_order": 4},
    {"id": "generate-scripts", "name": "脚本生成", "ai_node": "自动化", "description": "根据测试用例自动生成可执行的 Playwright 自动化测试脚本", "display_order": 5},
    {"id": "generate-test-plan", "name": "测试计划生成", "ai_node": "文档生成", "description": "根据项目数据和测试范围自动生成软件测试计划文档", "display_order": 6},
    {"id": "generate-test-report", "name": "测试报告生成", "ai_node": "文档生成", "description": "根据测试执行结果自动生成包含缺陷统计和风险分析的测试报告", "display_order": 7},
    {"id": "generate-test-summary", "name": "测试总结生成", "ai_node": "文档生成", "description": "汇总测试数据，生成测试总结报告和质量评估", "display_order": 8},
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
    return {
        "id": m.id,
        "name": m.name,
        "aiNode": m.ai_node,
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
    existing = {c.id for c in result.scalars().all()}

    for config in DEFAULT_CONFIGS:
        if config["id"] not in existing:
            db.add(ModelConfig(
                id=config["id"],
                user_id=user_id,
                name=config["name"],
                ai_node=config["ai_node"],
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


@router.get("/model-configs/check/{config_id}")
async def check_model_config(
    config_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """检查指定配置是否已配置（供应商、模型、API Key、Endpoint 都不为空）"""
    user_id = user["sub"]
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
            m.ai_node = cfg.aiNode
            m.provider = cfg.provider
            m.model_name = cfg.modelName
            m.api_key = encrypt_value(cfg.apiKey) if cfg.apiKey else ""
            m.endpoint = cfg.endpoint
            m.description = cfg.description
            m.enabled = cfg.enabled
        else:
            m = ModelConfig(
                id=cfg.id,
                user_id=user_id,
                name=cfg.name,
                ai_node=cfg.aiNode,
                provider=cfg.provider,
                model_name=cfg.modelName,
                api_key=encrypt_value(cfg.apiKey) if cfg.apiKey else "",
                endpoint=cfg.endpoint,
                description=cfg.description,
                enabled=cfg.enabled,
            )
            db.add(m)

    await db.commit()
    return {"ok": True, "count": len(data.configs)}


@router.post("/model-configs/{config_id}/test")
async def test_model_config(
    config_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    import httpx

    result = await db.execute(select(ModelConfig).where(ModelConfig.id == config_id))
    config = result.scalar_one_or_none()

    if not config:
        return {"ok": False, "message": "配置不存在"}

    if not config.enabled:
        return {"ok": False, "message": "该配置已禁用，请先启用"}

    api_key = decrypt_value(config.api_key) if config.api_key else ""
    endpoint = config.endpoint or ""
    model = config.model_name or ""

    if not api_key:
        return {"ok": False, "message": "请先配置 API Key"}

    if not endpoint:
        return {"ok": False, "message": "请先配置 API Endpoint 地址"}

    try:
        test_payload = {
            "model": model,
            "messages": [
                {"role": "user", "content": "Hello, this is a test message."}
            ],
            "max_tokens": 10,
        }

        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                endpoint,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {api_key}",
                },
                json=test_payload,
            )

            if response.status_code == 200:
                return {"ok": True, "message": "连接成功，模型可用"}
            elif response.status_code == 401:
                return {"ok": False, "message": "API Key 无效，请检查配置"}
            elif response.status_code == 403:
                return {"ok": False, "message": "API Key 权限不足，请检查账户权限"}
            elif response.status_code == 404:
                return {"ok": False, "message": "模型不存在，请检查模型名称"}
            elif response.status_code == 429:
                return {"ok": False, "message": "请求过于频繁，请稍后再试"}
            else:
                return {"ok": False, "message": f"接口返回错误（状态码：{response.status_code}），请检查配置"}

    except httpx.TimeoutException:
        return {"ok": False, "message": "连接超时，请检查网络或 Endpoint 地址"}
    except httpx.ConnectError:
        return {"ok": False, "message": "无法连接到服务器，请检查 Endpoint 地址"}
    except Exception as e:
        return {"ok": False, "message": f"连接失败：{str(e)}"}
