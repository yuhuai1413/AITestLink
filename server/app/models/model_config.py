import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, String, Text

from app.database import Base


class ModelConfig(Base):
    __tablename__ = "model_configs"

    id = Column(String(50), primary_key=True)  # 如: parse-requirements
    name = Column(String(100), nullable=False)  # 如: 需求解析
    ai_node = Column(String(100), nullable=False)  # 如: 需求解析节点
    provider = Column(String(100), nullable=False)  # 如: 小米-MiMo大模型平台
    model_name = Column(String(100), nullable=False)  # 如: mimo-v2.5
    api_key = Column(Text, default="")  # API Key
    endpoint = Column(String(500), default="")  # API Endpoint
    description = Column(Text, default="")  # 说明
    enabled = Column(Boolean, default=True)  # 是否启用
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
