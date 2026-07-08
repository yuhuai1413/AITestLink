from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text

from app.database import Base


class DocTemplate(Base):
    __tablename__ = "doc_templates"

    id = Column(String(100), primary_key=True)
    user_id = Column(String(50), ForeignKey("users.id"), nullable=False, index=True)
    config_key = Column(String(50), nullable=False)
    name = Column(String(100), nullable=False)
    description = Column(Text, default="")
    template_file = Column(String(500), default="")  # 模板文件路径
    prompt_template = Column(Text, default="")
    output_fields = Column(Text, default="")
    display_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
