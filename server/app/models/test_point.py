import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String, Text

from app.database import Base


class TestPoint(Base):
    __tablename__ = "test_points"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    requirement_id = Column(String(36), ForeignKey("requirements.id", ondelete="SET NULL"), nullable=True)
    module = Column(String(255), nullable=False)
    type = Column(String(50), nullable=False)
    title = Column(String(500), nullable=False)
    description = Column(Text, default="")
    priority = Column(String(10), default="P1")
    automatable = Column(Boolean, default=False)
    review_status = Column(String(50), default="待评审")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
