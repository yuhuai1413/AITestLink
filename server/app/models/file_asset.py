import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


class FileAsset(Base):
    __tablename__ = "file_assets"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    file_type = Column(String(50), nullable=False)
    size = Column(String(50), default="")
    storage_path = Column(String(500), default="")
    parse_status = Column(String(50), default="待解析")
    uploaded_at = Column(DateTime, default=datetime.utcnow)
