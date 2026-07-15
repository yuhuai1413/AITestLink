import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, String, Text

from app.database import Base


class ExecutionRun(Base):
    """One immutable execution attempt with a sanitized environment snapshot."""

    __tablename__ = "execution_runs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    script_id = Column(String(36), ForeignKey("automation_scripts.id", ondelete="SET NULL"), nullable=True)
    test_case_id = Column(String(36), ForeignKey("test_cases.id", ondelete="SET NULL"), nullable=True)
    environment_id = Column(String(36), ForeignKey("environment_configs.id", ondelete="SET NULL"), nullable=True)
    account_id = Column(String(36), ForeignKey("test_accounts.id", ondelete="SET NULL"), nullable=True)
    status = Column(String(20), default="等待执行")
    environment_snapshot = Column(Text, default="{}")
    output = Column(Text, default="")
    error = Column(Text, default="")
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
