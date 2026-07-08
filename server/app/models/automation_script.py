import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String, Text

from app.database import Base


class AutomationScript(Base):
    __tablename__ = "automation_scripts"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    test_case_id = Column(String(36), ForeignKey("test_cases.id", ondelete="SET NULL"), nullable=True)
    script_type = Column(String(20), default="UI")  # UI / API
    framework = Column(String(50), default="Playwright")  # Playwright / pytest
    language = Column(String(20), default="Python")
    code = Column(Text, default="")
    status = Column(String(20), default="待执行")  # 待执行 / 执行中 / 成功 / 失败
    review_status = Column(String(50), default="待评审")
    generated_by_ai = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
