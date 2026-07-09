import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, String, Text

from app.database import Base


class StatusLog(Base):
    """项目状态变更日志表"""
    __tablename__ = "status_logs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String(36), nullable=False, index=True)
    user_id = Column(String(50), nullable=False)
    field_name = Column(String(50), nullable=False)  # test_status 或 doc_status
    old_value = Column(String(50), nullable=True)
    new_value = Column(String(50), nullable=False)
    change_type = Column(String(20), nullable=False)  # auto: 自动变更, manual: 手动变更
    reason = Column(Text, nullable=True)  # 变更原因
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
