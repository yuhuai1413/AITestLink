import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, String, Text

from app.database import Base


class TestCase(Base):
    __tablename__ = "test_cases"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    test_point_id = Column(String(36), ForeignKey("test_points.id", ondelete="SET NULL"), nullable=True)
    requirement_id = Column(String(36), ForeignKey("requirements.id", ondelete="SET NULL"), nullable=True)
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
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
