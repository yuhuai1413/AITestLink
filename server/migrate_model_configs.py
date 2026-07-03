"""将 model_configs.json 迁移到数据库"""
import json
import asyncio
from pathlib import Path
from sqlalchemy import select

from app.database import async_session, init_db
from app.models.model_config import ModelConfig


async def migrate():
    # 初始化数据库
    await init_db()

    # 读取 JSON 文件
    json_file = Path(__file__).parent / "model_configs.json"
    if not json_file.exists():
        print("model_configs.json 不存在，跳过迁移")
        return

    with open(json_file, "r", encoding="utf-8") as f:
        data = json.load(f)

    configs = data.get("configs", [])
    if not configs:
        print("没有配置数据需要迁移")
        return

    # 写入数据库
    async with async_session() as db:
        for cfg in configs:
            # 检查是否已存在
            result = await db.execute(select(ModelConfig).where(ModelConfig.id == cfg["id"]))
            existing = result.scalar_one_or_none()

            if existing:
                # 更新
                existing.name = cfg.get("name", "")
                existing.ai_node = cfg.get("aiNode", "")
                existing.provider = cfg.get("provider", "")
                existing.model_name = cfg.get("modelName", "")
                existing.api_key = cfg.get("apiKey", "")
                existing.endpoint = cfg.get("endpoint", "")
                existing.description = cfg.get("description", "")
                existing.enabled = cfg.get("enabled", True)
                print(f"更新配置: {cfg['id']}")
            else:
                # 创建
                m = ModelConfig(
                    id=cfg["id"],
                    name=cfg.get("name", ""),
                    ai_node=cfg.get("aiNode", ""),
                    provider=cfg.get("provider", ""),
                    model_name=cfg.get("modelName", ""),
                    api_key=cfg.get("apiKey", ""),
                    endpoint=cfg.get("endpoint", ""),
                    description=cfg.get("description", ""),
                    enabled=cfg.get("enabled", True),
                )
                db.add(m)
                print(f"创建配置: {cfg['id']}")

        await db.commit()
        print(f"迁移完成，共 {len(configs)} 个配置")


if __name__ == "__main__":
    asyncio.run(migrate())
