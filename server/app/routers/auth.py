import hashlib
import os
import secrets
import string
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
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

    # 验证密码强度
    if len(data.password) < 8:
        return {"ok": False, "message": "密码长度不能少于8位"}
    if not any(c.isalpha() for c in data.password):
        return {"ok": False, "message": "密码必须包含字母"}
    if not any(c.isdigit() for c in data.password):
        return {"ok": False, "message": "密码必须包含数字"}

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
    avatar_url = user.avatar or ""
    if avatar_url and not avatar_url.startswith("http"):
        avatar_url = f"http://localhost:8001{avatar_url}"
    token_store[token] = {
        "user_id": user.id,
        "phone": user.phone,
        "nickname": user.nickname,
        "avatar": avatar_url,
        "is_admin": user.is_admin or False,
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
            "avatar": avatar_url,
            "is_admin": user.is_admin or False,
            "avatar": user.avatar,
        },
    }


@router.get("/me")
async def get_me(token: str = None):
    """获取当前用户信息"""
    if not token:
        return {"ok": False, "message": "未登录"}

    user_info = token_store.get(token)
    if not user_info:
        return {"ok": False, "message": "登录已过期"}

    # 确保 avatar 是完整 URL
    avatar = user_info.get("avatar", "")
    if avatar and not avatar.startswith("http"):
        avatar = f"http://localhost:8001{avatar}"
    return {"ok": True, "user": {**user_info, "avatar": avatar}}


@router.post("/logout")
async def logout(token: str = None):
    """退出登录"""
    if token and token in token_store:
        del token_store[token]
    return {"ok": True, "message": "已退出登录"}


class UpdateProfileRequest(BaseModel):
    nickname: str


@router.put("/profile")
async def update_profile(data: UpdateProfileRequest, token: str = None, db: AsyncSession = Depends(get_db)):
    """更新用户昵称"""
    if not token or token not in token_store:
        return {"ok": False, "message": "未登录"}

    user_id = token_store[token]["user_id"]
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        return {"ok": False, "message": "用户不存在"}

    user.nickname = data.nickname
    user.updated_at = datetime.utcnow()
    await db.commit()

    token_store[token]["nickname"] = data.nickname

    return {"ok": True, "message": "保存成功"}


@router.post("/avatar")
async def upload_avatar(file: UploadFile = File(...), token: str = None, db: AsyncSession = Depends(get_db)):
    """上传头像"""
    if not token or token not in token_store:
        return {"ok": False, "message": "未登录"}

    if not file.content_type or not file.content_type.startswith("image/"):
        return {"ok": False, "message": "请上传图片文件"}

    content = await file.read()
    if len(content) > 2 * 1024 * 1024:
        return {"ok": False, "message": "图片大小不能超过 2MB"}

    ext = file.content_type.split("/")[-1]
    filename = f"avatar_{uuid.uuid4().hex[:12]}.{ext}"
    upload_dir = os.path.join(settings.UPLOAD_DIR, "avatars")
    os.makedirs(upload_dir, exist_ok=True)
    filepath = os.path.join(upload_dir, filename)
    with open(filepath, "wb") as f:
        f.write(content)

    avatar_url = f"http://localhost:8001/uploads/avatars/{filename}"

    user_id = token_store[token]["user_id"]
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user:
        user.avatar = avatar_url
        user.updated_at = datetime.utcnow()
        await db.commit()

    token_store[token]["avatar"] = avatar_url

    return {"ok": True, "message": "上传成功", "avatar": f"http://localhost:8001{avatar_url}"}


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


@router.put("/password")
async def change_password(data: ChangePasswordRequest, token: str = None, db: AsyncSession = Depends(get_db)):
    """修改密码"""
    if not token or token not in token_store:
        return {"ok": False, "message": "未登录"}

    user_id = token_store[token]["user_id"]
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        return {"ok": False, "message": "用户不存在"}

    if not verify_password(data.old_password, user.password_hash):
        return {"ok": False, "message": "原密码错误"}

    if len(data.new_password) < 8:
        return {"ok": False, "message": "新密码长度不能少于8位"}
    if not any(c.isalpha() for c in data.new_password):
        return {"ok": False, "message": "新密码必须包含字母"}
    if not any(c.isdigit() for c in data.new_password):
        return {"ok": False, "message": "新密码必须包含数字"}

    user.password_hash = hash_password(data.new_password)
    user.updated_at = datetime.utcnow()
    await db.commit()

    return {"ok": True, "message": "密码修改成功"}


@router.get("/users")
async def list_users(token: str = None, db: AsyncSession = Depends(get_db)):
    """获取用户列表（管理员专用）"""
    if not token or token not in token_store:
        return {"ok": False, "message": "未登录"}

    user_info = token_store.get(token)
    if not user_info or not user_info.get("is_admin"):
        return {"ok": False, "message": "无权限"}

    result = await db.execute(select(User).order_by(User.created_at.desc()))
    users = result.scalars().all()

    return {
        "ok": True,
        "users": [
            {
                "id": u.id,
                "phone": u.phone,
                "nickname": u.nickname,
                "avatar": u.avatar or "",
                "is_active": u.is_active,
                "is_admin": u.is_admin or False,
                "created_at": u.created_at.isoformat() if u.created_at else "",
            }
            for u in users
        ],
    }
