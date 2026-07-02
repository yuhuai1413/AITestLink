import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


class TestCase(Base):
    __tablename__ = "test_cases"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    test_point_id = Column(UUID(as_uuid=True), ForeignKey("test_points.id", ondelete="SET NULL"), nullable=True)
    requirement_id = Column(UUID(as_uuid=True), ForeignKey("requirements.id", ondelete="SET NULL"), nullable=True)
    case_code = Column(String(50), nullable=False)
    module = Column(String(255), nullable=False)
    feature = Column(String(255), default="")
    title = Column(String(500), nullable=False)
    priority = Column(String(10), default="P1")
    precondition = Column(Text, default="")
    steps = Column(Text, default="")
    test_data = Column(Text, default="")
    expected_result = Column(Text, default="")
    automation = Column(String(20), default="待评估")
    review_status = Column(String(50), default="待评审")
    remark = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
