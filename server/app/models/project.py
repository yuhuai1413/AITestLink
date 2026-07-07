import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text

from app.database import Base


class Project(Base):
    __tablename__ = "projects"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(50), ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    test_type = Column(String(100), nullable=False)
    test_status = Column(String(50), nullable=False, default="待测试")
    doc_status = Column(String(50), nullable=False, default="待解析")
    priority = Column(String(10), default="中")
    description = Column(Text, default="")
    case_count = Column(Integer, default=0)
    pass_rate = Column(Integer, default=0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
