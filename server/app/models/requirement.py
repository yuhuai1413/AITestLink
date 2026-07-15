import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String, Text

from app.database import Base


class Requirement(Base):
    __tablename__ = "requirements"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    req_id = Column(String(20), default="")  # AI 生成的需求编号，如 REQ_001
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    module = Column(String(255), nullable=False)
    feature = Column(String(255), nullable=False)
    source = Column(String(255), default="")
    risk = Column(String(10), default="中")
    rule = Column(Text, default="")
    question = Column(Text, default="")
    confirmed = Column(Boolean, default=False)
    review_status = Column(String(50), default="待评审")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
