from __future__ import annotations

import json

from sqlalchemy import select

from app.models.model_config import ModelConfig
from app.services.base import BaseService
from app.services.export_format import format_api_datetime
from app.utils import encrypt_value, decrypt_value
from app.contracts.system import ModelConfigCreate, ModelConfigUpdate


class ModelConfigService(BaseService):
    """AI 模型配置服务"""

    def _to_dict(self, obj) -> dict:
        """重写 _to_dict，解析 ai_node JSON 字符串并解密 api_key"""
        if obj is None:
            return {}

        result = {}
        for column in obj.__table__.columns:
            value = getattr(obj, column.name)

            # 解析 ai_node JSON 字符串
            if column.name == "ai_node":
                try:
                    value = json.loads(value) if value else []
                except (json.JSONDecodeError, TypeError):
                    value = [value] if value else []

            # 解密 api_key
            elif column.name == "api_key":
                value = decrypt_value(value) if value else ""

            # 日期格式化
            from datetime import datetime
            if isinstance(value, datetime):
                value = format_api_datetime(value)

            # 转换为 camelCase
            camel = "".join(
                word.capitalize() if i > 0 else word
                for i, word in enumerate(column.name.split("_"))
            )
            result[camel] = value

        result.setdefault("connectionStatus", "untested")
        result.setdefault("lastTestMessage", "")

        return result

    async def create(self, user_id: str, data: ModelConfigCreate) -> dict:
        config_id = f"{user_id}_{data.config_key}"

        # 检查是否已存在
        existing = await self.db.execute(
            select(ModelConfig).where(ModelConfig.id == config_id)
        )
        if existing.scalar_one_or_none():
            from fastapi import HTTPException
            raise HTTPException(status_code=409, detail="配置已存在")

        config = ModelConfig(
            id=config_id,
            user_id=user_id,
            config_key=data.config_key,
            name=data.name,
            ai_node=data.ai_node,
            provider=data.provider,
            model_name=data.model_name,
            api_key=encrypt_value(data.api_key) if data.api_key else "",
            endpoint=data.endpoint,
            description=data.description,
            enabled=data.enabled,
            display_order=data.display_order,
            prompt=data.prompt or "",
        )
        self.db.add(config)
        await self.db.commit()
        await self.db.refresh(config)
        return self._to_dict(config)

    async def get_by_id(self, config_id: str) -> dict | None:
        result = await self.db.execute(select(ModelConfig).where(ModelConfig.id == config_id))
        config = result.scalar_one_or_none()
        return self._to_dict(config) if config else None

    async def list_by_user(self, user_id: str, config_key: str | None = None) -> list[dict]:
        query = select(ModelConfig).where(ModelConfig.user_id == user_id)
        if config_key:
            query = query.where(ModelConfig.config_key == config_key)
        query = query.order_by(ModelConfig.display_order, ModelConfig.created_at)
        result = await self.db.execute(query)
        return [self._to_dict(c) for c in result.scalars().all()]

    async def update(self, config_id: str, data: ModelConfigUpdate) -> dict | None:
        result = await self.db.execute(select(ModelConfig).where(ModelConfig.id == config_id))
        config = result.scalar_one_or_none()
        if not config:
            return None

        update_data = data.model_dump(exclude_unset=True)
        field_map = {
            "name": "name",
            "ai_node": "ai_node",
            "provider": "provider",
            "model_name": "model_name",
            "api_key": "api_key",
            "endpoint": "endpoint",
            "description": "description",
            "enabled": "enabled",
            "display_order": "display_order",
            "prompt": "prompt",
        }
        for schema_key, db_key in field_map.items():
            if schema_key in update_data:
                value = update_data[schema_key]
                if schema_key == "api_key" and value:
                    value = encrypt_value(value)
                setattr(config, db_key, value)

        config.updated_at = self._now()
        await self.db.commit()
        await self.db.refresh(config)
        return self._to_dict(config)

    async def delete(self, config_id: str) -> bool:
        result = await self.db.execute(select(ModelConfig).where(ModelConfig.id == config_id))
        config = result.scalar_one_or_none()
        if not config:
            return False
        await self.db.delete(config)
        await self.db.commit()
        return True

    async def check_config_for_task(self, task_type: str, user_id: str) -> dict:
        from app.services.ai_service import TASK_CONFIG_MAP
        config_key = TASK_CONFIG_MAP.get(task_type)

        if config_key:
            result = await self.db.execute(
                select(ModelConfig).where(
                    ModelConfig.config_key == config_key,
                    ModelConfig.user_id == user_id
                )
            )
            config = result.scalar_one_or_none()
            if config:
                if not config.enabled:
                    return {
                        "configured": False,
                        "configId": config.id,
                        "name": config.name,
                        "message": f"「{config.name}」已禁用，请在模型配置页面启用后重试",
                    }
                is_configured = bool(config.provider and config.model_name and config.api_key and config.endpoint)
                return {
                    "configured": is_configured,
                    "configId": config.id,
                    "name": config.name,
                    "connectionStatus": config.connection_status or "untested",
                    "lastTestedAt": format_api_datetime(config.last_tested_at) or None,
                    "lastTestMessage": config.last_test_message or "",
                    "message": "已配置" if is_configured else f"请先在模型配置页面设置「{config.name}」的模型数据",
                }

        return {"configured": False, "name": task_type, "message": "配置不存在"}
