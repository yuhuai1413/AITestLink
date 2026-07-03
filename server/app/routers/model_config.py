from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.model_config import ModelConfig

router = APIRouter()


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


def model_to_dict(m: ModelConfig) -> dict:
    return {
        "id": m.id,
        "name": m.name,
        "aiNode": m.ai_node,
        "provider": m.provider,
        "modelName": m.model_name,
        "apiKey": m.api_key,
        "endpoint": m.endpoint,
        "description": m.description,
        "enabled": m.enabled,
    }


@router.get("/model-configs")
async def list_model_configs(db: AsyncSession = Depends(get_db)):
    """获取所有模型配置"""
    result = await db.execute(select(ModelConfig).order_by(ModelConfig.id))
    configs = result.scalars().all()
    return [model_to_dict(c) for c in configs]


@router.get("/model-configs/{config_id}")
async def get_model_config(config_id: str, db: AsyncSession = Depends(get_db)):
    """获取指定模型配置"""
    result = await db.execute(select(ModelConfig).where(ModelConfig.id == config_id))
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="配置不存在")
    return model_to_dict(config)


@router.put("/model-configs")
async def update_model_configs(data: ModelConfigUpdate, db: AsyncSession = Depends(get_db)):
    """更新所有模型配置"""
    # 获取现有配置
    result = await db.execute(select(ModelConfig))
    existing = {c.id: c for c in result.scalars().all()}

    for cfg in data.configs:
        if cfg.id in existing:
            # 更新现有配置
            m = existing[cfg.id]
            m.name = cfg.name
            m.ai_node = cfg.aiNode
            m.provider = cfg.provider
            m.model_name = cfg.modelName
            m.api_key = cfg.apiKey
            m.endpoint = cfg.endpoint
            m.description = cfg.description
            m.enabled = cfg.enabled
        else:
            # 创建新配置
            m = ModelConfig(
                id=cfg.id,
                name=cfg.name,
                ai_node=cfg.aiNode,
                provider=cfg.provider,
                model_name=cfg.modelName,
                api_key=cfg.apiKey,
                endpoint=cfg.endpoint,
                description=cfg.description,
                enabled=cfg.enabled,
            )
            db.add(m)

    await db.commit()
    return {"ok": True, "count": len(data.configs)}


@router.post("/model-configs/{config_id}/test")
async def test_model_config(config_id: str, db: AsyncSession = Depends(get_db)):
    """测试模型配置连接"""
    import httpx

    result = await db.execute(select(ModelConfig).where(ModelConfig.id == config_id))
    config = result.scalar_one_or_none()

    if not config:
        return {"ok": False, "message": "配置不存在"}

    if not config.enabled:
        return {"ok": False, "message": "该配置已禁用，请先启用"}

    api_key = config.api_key or ""
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
