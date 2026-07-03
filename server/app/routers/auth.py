import hashlib
import secrets
import string
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User

router = APIRouter()

# 简易验证码存储（生产环境应使用 Redis）
captcha_store: dict[str, dict] = {}

# Token 存储（生产环境应使用 JWT）
token_store: dict[str, dict] = {}


def hash_password(password: str) -> str:
    """密码哈希"""
    return hashlib.sha256(password.encode()).hexdigest()


def verify_password(password: str, password_hash: str) -> bool:
    """验证密码"""
    return hash_password(password) == password_hash


def generate_captcha_code(length: int = 4) -> str:
    """生成数字验证码"""
    return ''.join(secrets.choice(string.digits) for _ in range(length))


def generate_token() -> str:
    """生成 Token"""
    return secrets.token_hex(32)


class RegisterRequest(BaseModel):
    phone: str
    password: str
    captcha_id: str
    captcha_code: str


class LoginRequest(BaseModel):
    phone: str
    password: str
    captcha_id: str
    captcha_code: str


class CaptchaResponse(BaseModel):
    captcha_id: str
    code: str  # 开发环境返回验证码，生产环境应返回图片


@router.get("/captcha")
async def get_captcha():
    """获取验证码"""
    captcha_id = str(uuid.uuid4())
    code = generate_captcha_code()
    captcha_store[captcha_id] = {
        "code": code,
        "created_at": datetime.utcnow(),
    }
    # 清理过期验证码（5分钟）
    now = datetime.utcnow()
    expired = [k for k, v in captcha_store.items() if (now - v["created_at"]).seconds > 300]
    for k in expired:
        del captcha_store[k]

    return {"captcha_id": captcha_id, "code": code}


@router.post("/register")
async def register(data: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """用户注册"""
    # 验证手机号格式
    if not data.phone or len(data.phone) != 11 or not data.phone.isdigit():
        return {"ok": False, "message": "手机号格式不正确"}

    # 验证密码长度
    if len(data.password) < 6:
        return {"ok": False, "message": "密码长度至少6位"}

    # 验证验证码
    captcha = captcha_store.get(data.captcha_id)
    if not captcha:
        return {"ok": False, "message": "验证码已过期，请重新获取"}
    if captcha["code"] != data.captcha_code:
        return {"ok": False, "message": "验证码错误"}

    # 检查手机号是否已注册
    result = await db.execute(select(User).where(User.phone == data.phone))
    if result.scalar_one_or_none():
        return {"ok": False, "message": "该手机号已注册"}

    # 创建用户
    user = User(
        phone=data.phone,
        password_hash=hash_password(data.password),
        nickname=f"用户{data.phone[-4:]}",
    )
    db.add(user)
    await db.commit()

    # 清除验证码
    del captcha_store[data.captcha_id]

    return {"ok": True, "message": "注册成功"}


@router.post("/login")
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)):
    """用户登录"""
    # 验证手机号格式
    if not data.phone or len(data.phone) != 11 or not data.phone.isdigit():
        return {"ok": False, "message": "手机号格式不正确"}

    # 验证验证码
    captcha = captcha_store.get(data.captcha_id)
    if not captcha:
        return {"ok": False, "message": "验证码已过期，请重新获取"}
    if captcha["code"] != data.captcha_code:
        return {"ok": False, "message": "验证码错误"}

    # 查找用户
    result = await db.execute(select(User).where(User.phone == data.phone))
    user = result.scalar_one_or_none()
    if not user:
        return {"ok": False, "message": "用户不存在"}

    # 验证密码
    if not verify_password(data.password, user.password_hash):
        return {"ok": False, "message": "密码错误"}

    # 生成 Token
    token = generate_token()
    token_store[token] = {
        "user_id": user.id,
        "phone": user.phone,
        "nickname": user.nickname,
        "created_at": datetime.utcnow(),
    }

    # 清除验证码
    del captcha_store[data.captcha_id]

    return {
        "ok": True,
        "message": "登录成功",
        "token": token,
        "user": {
            "id": user.id,
            "phone": user.phone,
            "nickname": user.nickname,
            "avatar": user.avatar,
        },
    }


@router.get("/me")
async def get_me(token: str = None):
    """获取当前用户信息"""
    if not token:
        raise HTTPException(status_code=401, detail="未登录")

    user_info = token_store.get(token)
    if not user_info:
        raise HTTPException(status_code=401, detail="登录已过期")

    return {"ok": True, "user": user_info}


@router.post("/logout")
async def logout(token: str = None):
    """退出登录"""
    if token and token in token_store:
        del token_store[token]
    return {"ok": True, "message": "已退出登录"}
