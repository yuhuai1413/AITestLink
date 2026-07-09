import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, String

from app.database import Base


class DocGenStatus(Base):
    """每个项目每个文档模板的生成状态"""
    __tablename__ = "doc_gen_status"

    id = Column(String(100), primary_key=True)  # {project_id}_{template_id}
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    template_id = Column(String(50), nullable=False)  # tpl-plan / tpl-spec / ...
    status = Column(String(20), default="待生成")  # 待生成 / 数据不足 / 已生成
    generated_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
