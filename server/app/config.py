import secrets
import warnings

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite+aiosqlite:///./aitestlink.db"
    LLM_API_KEY: str = ""
    LLM_BASE_URL: str = "https://api.openai.com/v1"
    LLM_MODEL: str = "gpt-4o"
    UPLOAD_DIR: str = "./uploads"
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:5174"
    JWT_SECRET: str = ""  # 空字符串表示未配置
    BASE_URL: str = "http://localhost:8001"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()

# 检查 JWT_SECRET 是否已配置，未配置则自动生成并警告
if not settings.JWT_SECRET:
    settings.JWT_SECRET = secrets.token_hex(32)
    warnings.warn(
        "JWT_SECRET 未配置，已自动生成随机密钥。生产环境请在 .env 中配置强随机字符串。",
        UserWarning,
        stacklevel=2,
    )
