import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text

from app.database import Base


class ModelConfig(Base):
    __tablename__ = "model_configs"

    id = Column(String(100), primary_key=True)  # 格式: {user_id}_{config_key}
    user_id = Column(String(50), ForeignKey("users.id"), nullable=False, index=True)
    config_key = Column(String(50), nullable=False)  # 如 parse-requirements
    name = Column(String(100), nullable=False)
    ai_node = Column(String(100), nullable=False)
    provider = Column(String(100), nullable=False)
    model_name = Column(String(100), nullable=False)
    api_key = Column(Text, default="")
    endpoint = Column(String(500), default="")
    description = Column(Text, default="")
    enabled = Column(Boolean, default=True)
    display_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
