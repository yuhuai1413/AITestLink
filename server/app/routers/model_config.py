import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.model_config import ModelConfig
from app.models.prompt_version import PromptVersion
from app.prompts.prompt_catalog import PROMPT_TEST_INPUTS
from app.routers.deps import get_current_user, require_admin, get_model_config_service
from app.schemas.ai_output import validate_ai_output
from app.services.ai_service import AIService
from app.services.model_config_service import ModelConfigService
from app.services.prompt_service import (
    create_prompt_version,
    get_published_prompt,
    list_prompt_versions,
    publish_prompt_version,
)
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
    # 仅用于识别并拒绝旧客户端或绕过前端提交的提示词字段。
    # 提示词只能通过管理员专用接口维护。
    prompt: str | None = None


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
        # 普通模型配置接口不再暴露用户配置行中的历史提示词副本。
        "prompt": "",
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

    changed = False
    for config in DEFAULT_CONFIGS:
        if config["config_key"] not in user_configs:
            # 新用户只创建模型连接配置；提示词始终在运行时读取管理员配置。
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
                prompt="",
            ))
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

    # 普通模型配置接口不返回系统提示词；管理员通过专用权限接口读取。
    return [{**_to_dict(c), "adminPrompt": ""} for c in configs]


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
    """管理员获取所有节点当前已发布的提示词。"""
    items = []
    for config in DEFAULT_CONFIGS:
        versions = await list_prompt_versions(db, config["config_key"])
        published = next((item for item in versions if item.status == "published"), None)
        items.append({
            "configKey": config["config_key"],
            "name": config["name"],
            "prompt": published.content if published else await get_published_prompt(db, config["config_key"]),
            "version": published.version if published else None,
            "status": published.status if published else "legacy",
        })
    return items


@router.put("/model-configs/admin-prompts")
async def update_admin_prompts(
    data: AdminPromptUpdate,
    user: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """兼容现有界面：发生变化的提示词直接创建并发布一个新版本。"""
    admin_id = user["sub"]

    for item in data.prompts:
        if not item.prompt or not item.prompt.strip():
            raise HTTPException(status_code=400, detail=f"「{item.configKey}」的提示词不能为空")

    updated = 0
    valid_keys = {item["config_key"] for item in DEFAULT_CONFIGS}
    for item in data.prompts:
        if item.configKey not in valid_keys:
            raise HTTPException(status_code=400, detail=f"未知提示词节点：{item.configKey}")
        versions = await list_prompt_versions(db, item.configKey)
        published = next((version for version in versions if version.status == "published"), None)
        if published and published.content.strip() == item.prompt.strip():
            continue
        await create_prompt_version(db, item.configKey, item.prompt, admin_id, publish=True)
        updated += 1

    await db.commit()
    return {"ok": True, "updated": updated}


class PromptContentInput(BaseModel):
    prompt: str


class PromptTestInput(PromptContentInput):
    sampleInput: str | None = None


def _prompt_version_dict(item: PromptVersion) -> dict:
    return {
        "id": item.id,
        "configKey": item.config_key,
        "version": item.version,
        "prompt": item.content,
        "status": item.status,
        "createdBy": item.created_by,
        "createdAt": item.created_at.isoformat() if item.created_at else None,
        "publishedAt": item.published_at.isoformat() if item.published_at else None,
    }


@router.get("/model-configs/admin-prompts/{config_key}/versions")
async def get_prompt_versions(
    config_key: str,
    user: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    return [_prompt_version_dict(item) for item in await list_prompt_versions(db, config_key)]


@router.post("/model-configs/admin-prompts/{config_key}/draft")
async def create_prompt_draft(
    config_key: str,
    data: PromptContentInput,
    user: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    try:
        version = await create_prompt_version(db, config_key, data.prompt, user["sub"])
        await db.commit()
        return {"ok": True, "version": _prompt_version_dict(version)}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/model-configs/admin-prompts/{config_key}/publish/{version_id}")
async def publish_prompt(
    config_key: str,
    version_id: str,
    user: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    version = await publish_prompt_version(db, config_key, version_id)
    if not version:
        raise HTTPException(status_code=404, detail="提示词版本不存在")
    await db.commit()
    return {"ok": True, "version": _prompt_version_dict(version)}


@router.post("/model-configs/admin-prompts/{config_key}/rollback/{version_id}")
async def rollback_prompt(
    config_key: str,
    version_id: str,
    user: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PromptVersion).where(
            PromptVersion.id == version_id,
            PromptVersion.config_key == config_key,
        )
    )
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="提示词版本不存在")
    version = await create_prompt_version(db, config_key, target.content, user["sub"], publish=True)
    await db.commit()
    return {"ok": True, "version": _prompt_version_dict(version)}


@router.post("/model-configs/admin-prompts/{config_key}/test")
async def test_prompt(
    config_key: str,
    data: PromptTestInput,
    user: dict = Depends(require_admin),
):
    task_type = next(
        (item["name"] for item in DEFAULT_CONFIGS if item["config_key"] == config_key),
        None,
    )
    if not task_type:
        raise HTTPException(status_code=404, detail="提示词节点不存在")
    try:
        service = AIService()
        response = await service._call_llm(
            data.sampleInput or PROMPT_TEST_INPUTS[config_key],
            task_type,
            user["sub"],
            system_prompt_override=data.prompt,
        )
        items = validate_ai_output(task_type, service._parse_json_response(response))
        return {"ok": True, "count": len(items), "preview": items[:2]}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"提示词测试失败：{str(exc)}") from exc


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
        if "prompt" in cfg.model_fields_set:
            raise HTTPException(status_code=403, detail="提示词只能由管理员在提示词管理中配置")
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

    await db.commit()
    return {"ok": True, "count": len(data.configs)}
