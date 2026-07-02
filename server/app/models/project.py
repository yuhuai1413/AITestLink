import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


class Project(Base):
    __tablename__ = "projects"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    version = Column(String(50), nullable=False, default="V0.1")
    owner = Column(String(255), nullable=False)
    test_type = Column(String(100), nullable=False)
    status = Column(String(50), nullable=False, default="设计中")
    description = Column(Text, default="")
    case_count = Column(Integer, default=0)
    pass_rate = Column(Integer, default=0)
    risk_level = Column(String(10), default="中")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
