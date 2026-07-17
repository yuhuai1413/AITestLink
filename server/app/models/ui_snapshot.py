import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, String, Text

from app.database import Base


class UISnapshot(Base):
    """A recognized UI structure snapshot for one test environment."""

    __tablename__ = "ui_snapshots"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    environment_id = Column(String(36), ForeignKey("environment_configs.id", ondelete="CASCADE"), nullable=False)
    account_id = Column(String(36), ForeignKey("test_accounts.id", ondelete="SET NULL"), nullable=True)
    status = Column(String(20), default="成功")
    summary = Column(Text, default="")
    snapshot_json = Column(Text, default="{}")
    error = Column(Text, default="")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
