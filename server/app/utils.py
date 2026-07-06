import base64
import hashlib
from datetime import datetime


def model_to_dict(obj) -> dict:
    """Convert SQLAlchemy model instance to dict with camelCase keys."""
    result = {}
    for column in obj.__table__.columns:
        value = getattr(obj, column.name)
        if isinstance(value, datetime):
            value = value.isoformat()
        elif hasattr(value, "hex"):
            value = str(value)
        camel = "".join(
            word.capitalize() if i > 0 else word
            for i, word in enumerate(column.name.split("_"))
        )
        result[camel] = value
    return result


# ─── 简单加密工具（用于 API Key 等敏感字段） ───

def _get_key() -> bytes:
    from app.config import settings
    return hashlib.sha256(settings.JWT_SECRET.encode()).digest()


def encrypt_value(plain: str) -> str:
    """对称加密：XOR + Base64"""
    if not plain:
        return ""
    key = _get_key()
    data = plain.encode()
    encrypted = bytes(b ^ key[i % len(key)] for i, b in enumerate(data))
    return base64.b64encode(encrypted).decode()


def decrypt_value(cipher: str) -> str:
    """对称解密：Base64 + XOR"""
    if not cipher:
        return ""
    key = _get_key()
    try:
        data = base64.b64decode(cipher)
        decrypted = bytes(b ^ key[i % len(key)] for i, b in enumerate(data))
        return decrypted.decode()
    except Exception:
        return cipher  # 兼容未加密的旧数据
