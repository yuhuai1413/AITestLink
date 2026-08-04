import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, String, Text

from app.database import Base


class Defect(Base):
    __tablename__ = "defects"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    defect_code = Column(String(50), nullable=False)
    title = Column(String(500), nullable=False)
    severity = Column(String(20), default="一般")        # 致命/严重/一般/轻微/建议
    priority = Column(String(10), default="P1")          # P0/P1/P2/P3
    status = Column(String(50), default="新建")           # 新建/确认/修复中/已修复/已验证/已关闭/重新打开
    module = Column(String(255), default="")
    category = Column(String(100), default="功能缺陷")    # 功能缺陷/性能缺陷/界面缺陷/安全缺陷/兼容性缺陷
    source = Column(String(30), default="手工")           # 手工/自动化（标记缺陷来源）
    test_case_id = Column(String(36), ForeignKey("test_cases.id", ondelete="SET NULL"), nullable=True)
    script_id = Column(String(36), ForeignKey("automation_scripts.id", ondelete="SET NULL"), nullable=True)
    execution_run_id = Column(String(36), ForeignKey("execution_runs.id", ondelete="SET NULL"), nullable=True)
    steps_to_reproduce = Column(Text, default="")
    expected_result = Column(Text, default="")
    actual_result = Column(Text, default="")
    environment_info = Column(String(500), default="")
    reporter = Column(String(100), default="")
    assignee = Column(String(100), default="")
    description = Column(Text, default="")
    remark = Column(Text, default="")
    screenshot_url = Column(String(500), default="")      # 执行失败时的截图 URL
    found_at = Column(DateTime, nullable=True)           # 发现时间
    resolved_at = Column(DateTime, nullable=True)        # 解决时间
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))
