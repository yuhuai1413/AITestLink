import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String, Text

from app.database import Base


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    type = Column(String(50), nullable=False)          # 任务完成 / 任务失败
    task_type = Column(String(50), nullable=False)      # 需求解析 / 测试点生成 / ...
    project_id = Column(String(36), nullable=False)
    project_name = Column(String(255), default="")
    message = Column(Text, default="")
    target_path = Column(String(500), default="")
    read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
