import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String, Text

from app.database import Base


class EnvironmentConfig(Base):
    """环境配置"""
    __tablename__ = "environment_configs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)  # 环境名称：测试环境/预发环境/生产环境
    environment_type = Column(String(20), default="Web")  # Web / APP
    web_url = Column(String(500), default="")  # Web地址
    app_url = Column(String(500), default="")  # APP端测试地址
    other_urls = Column(Text, default="")  # 其他地址（JSON格式）
    is_default = Column(Boolean, default=False)  # 生成测试用例时默认使用
    timeout = Column(String(20), default="30")  # 超时时间（秒）
    retry_count = Column(String(10), default="3")  # 重试次数
    captcha_required = Column(Boolean, default=True)  # 登录是否需要验证码
    captcha_code = Column(String(50), default="")  # 固定验证码/占位验证码
    notes = Column(Text, default="")  # 备注
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class TestAccount(Base):
    """测试账号"""
    __tablename__ = "test_accounts"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    environment_id = Column(String(36), ForeignKey("environment_configs.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)  # 账号名称：管理员/普通用户/审核员
    username = Column(String(200), nullable=False)  # 用户名/邮箱
    department = Column(String(100), default="")  # 所属部门
    password = Column(String(200), nullable=False)  # 密码
    role = Column(String(50), default="")  # 角色/权限
    is_admin = Column(Boolean, default=False)  # 是否管理员账号（高权限，识别系统时优先使用以采集完整菜单）
    notes = Column(Text, default="")  # 备注
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
