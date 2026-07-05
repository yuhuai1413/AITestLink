import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String, Text

from app.database import Base


class Project(Base):
    __tablename__ = "projects"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(255), nullable=False)
    test_type = Column(String(100), nullable=False)
    test_status = Column(String(50), nullable=False, default="待测试")
    doc_status = Column(String(50), nullable=False, default="待解析")
    priority = Column(String(10), default="中")
    description = Column(Text, default="")
    case_count = Column(Integer, default=0)
    pass_rate = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
