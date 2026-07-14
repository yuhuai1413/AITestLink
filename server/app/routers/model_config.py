import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.model_config import ModelConfig
from app.routers.deps import get_current_user, require_admin, get_model_config_service
from app.services.model_config_service import ModelConfigService
from app.utils import encrypt_value, decrypt_value, ensure_chat_endpoint

router = APIRouter()

DEFAULT_CONFIGS = [
    {"config_key": "parse-requirements", "name": "需求解析", "ai_node": ["需求解析"], "description": "从需求文档中提取模块、功能点和业务规则", "display_order": 1},
    {"config_key": "generate-test-points", "name": "测试点生成", "ai_node": ["生成测试点"], "description": "根据需求生成覆盖多种场景的测试点", "display_order": 2},
    {"config_key": "generate-test-cases", "name": "用例生成", "ai_node": ["生成测试用例"], "description": "根据测试点生成详细测试用例", "display_order": 3},
    {"config_key": "generate-scripts", "name": "脚本生成", "ai_node": ["生成脚本"], "description": "自动生成自动化测试脚本", "display_order": 4},
    {"config_key": "execute-scripts", "name": "执行脚本", "ai_node": ["执行脚本"], "description": "执行自动化测试脚本", "display_order": 5},
    {"config_key": "generate-docs", "name": "文档生成", "ai_node": ["文档生成"], "description": "自动生成测试文档", "display_order": 6},
]


class ModelConfigSchema(BaseModel):
    id: str
    name: str
    aiNode: str | list
    provider: str
    modelName: str
    apiKey: str
    endpoint: str
    description: str
    enabled: bool
    prompt: str = ""


class ModelConfigUpdate(BaseModel):
    configs: list[ModelConfigSchema]


def _to_dict(m) -> dict:
    # 支持 ModelConfig 对象或 dict
    if isinstance(m, dict):
        # 已经是 dict 格式，直接返回（service 已经转换过）
        # 但需要确保 apiKey 已解密
        result = m.copy()
        if "apiKey" in result and result["apiKey"]:
            result["apiKey"] = decrypt_value(result["apiKey"]) if not _is_decrypted(result["apiKey"]) else result["apiKey"]
        return result

    # ModelConfig 对象
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
        "prompt": m.prompt or "",
    }


def _is_decrypted(value: str) -> bool:
    """简单检查值是否已解密（非 Base64 格式）"""
    import base64
    try:
        # 尝试解密，如果失败说明已经解密
        base64.b64decode(value)
        return False
    except Exception:
        return True


async def _ensure_user_configs(db: AsyncSession, user_id: str):
    result = await db.execute(
        select(ModelConfig).where(ModelConfig.user_id == user_id)
    )
    user_configs = {c.config_key: c for c in result.scalars().all()}

    # 获取管理员的提示词作为默认值
    from app.models.user import User
    admin_result = await db.execute(
        select(ModelConfig).join(User, ModelConfig.user_id == User.id).where(User.is_admin == True)
    )
    admin_map = {c.config_key: c.prompt or "" for c in admin_result.scalars().all()}

    changed = False
    for config in DEFAULT_CONFIGS:
        if config["config_key"] not in user_configs:
            # 新用户：创建配置并复制管理员提示词
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
                prompt=admin_map.get(config["config_key"], ""),
            ))
            changed = True
        else:
            # 旧用户：如果提示词为空，从管理员同步
            user_config = user_configs[config["config_key"]]
            if not user_config.prompt and admin_map.get(config["config_key"]):
                user_config.prompt = admin_map[config["config_key"]]
                changed = True

    if changed:
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

    # 获取管理员的默认提示词
    from app.models.user import User
    admin_result = await db.execute(
        select(ModelConfig).join(User, ModelConfig.user_id == User.id).where(User.is_admin == True)
    )
    admin_map = {c.config_key: c.prompt or "" for c in admin_result.scalars().all()}

    return [{**_to_dict(c), "adminPrompt": admin_map.get(c.config_key, "")} for c in configs]


# ─── 管理员提示词管理（必须在 {config_id} 路由之前，避免路径冲突）───

class AdminPromptItem(BaseModel):
    configKey: str
    prompt: str


class AdminPromptUpdate(BaseModel):
    prompts: list[AdminPromptItem]


@router.get("/model-configs/admin-prompts")
async def get_admin_prompts(
    user: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """管理员获取所有节点的默认提示词"""
    from app.models.user import User
    result = await db.execute(
        select(ModelConfig)
        .join(User, ModelConfig.user_id == User.id)
        .where(User.is_admin == True)
        .order_by(ModelConfig.display_order)
    )
    configs = result.scalars().all()
    return [
        {"configKey": c.config_key, "name": c.name, "prompt": c.prompt or ""}
        for c in configs
    ]


@router.put("/model-configs/admin-prompts")
async def update_admin_prompts(
    data: AdminPromptUpdate,
    user: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """管理员批量更新所有节点的默认提示词"""
    from app.models.user import User
    admin_id = user["sub"]

    for item in data.prompts:
        if not item.prompt or not item.prompt.strip():
            raise HTTPException(status_code=400, detail=f"「{item.configKey}」的提示词不能为空")

    prompt_map = {item.configKey: item.prompt for item in data.prompts}

    result = await db.execute(
        select(ModelConfig).where(ModelConfig.user_id == admin_id)
    )
    updated = 0
    for config in result.scalars().all():
        if config.config_key in prompt_map:
            config.prompt = prompt_map[config.config_key]
            updated += 1

    await db.commit()
    return {"ok": True, "updated": updated}


@router.get("/model-configs/{config_id}")
async def get_model_config(
    config_id: str,
    user: dict = Depends(get_current_user),
    service: ModelConfigService = Depends(get_model_config_service),
):
    config = await service.get_by_id(config_id)
    if not config:
        raise HTTPException(status_code=404, detail="配置不存在")
    return _to_dict(config)


@router.get("/model-configs/check/{config_key}")
async def check_model_config(
    config_key: str,
    user: dict = Depends(get_current_user),
    service: ModelConfigService = Depends(get_model_config_service),
):
    return await service.check_config_for_task(config_key, user["sub"])


@router.post("/model-configs/{config_id}/test")
async def test_model_config(
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

    if not config.provider or not config.api_key or not config.endpoint:
        return {"ok": False, "message": "请先配置供应商、API Key 和 Endpoint"}

    api_key = decrypt_value(config.api_key) if config.api_key else ""
    endpoint = config.endpoint

    try:
        import httpx
        test_url = ensure_chat_endpoint(endpoint)
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": config.model_name,
            "messages": [{"role": "user", "content": "hi"}],
        }
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(test_url, json=payload, headers=headers)
        if resp.status_code < 400:
            return {"ok": True, "message": f"连通正常（{config.provider}）"}
        else:
            detail = ""
            try:
                detail = resp.json().get("error", {}).get("message", "")
            except Exception:
                detail = resp.text[:200]
            return {"ok": False, "message": f"请求失败（HTTP {resp.status_code}）{detail}"}
    except Exception as e:
        return {"ok": False, "message": f"测试失败：{str(e)[:200]}"}


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
            m.prompt = cfg.prompt or ""

    await db.commit()
    return {"ok": True, "count": len(data.configs)}
