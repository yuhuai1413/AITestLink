import hashlib
import os
import secrets
import string
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Header
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.user import User

router = APIRouter()

# JWT 配置
JWT_SECRET = settings.JWT_SECRET
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = 24


# ─── 密码工具 ───

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def _is_bcrypt(hash_str: str) -> bool:
    return hash_str.startswith("$2")


def verify_password(password: str, password_hash: str) -> bool:
    if _is_bcrypt(password_hash):
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    # 兼容旧的 SHA256 哈希
    return hashlib.sha256(password.encode()).hexdigest() == password_hash


def needs_rehash(password_hash: str) -> bool:
    return not _is_bcrypt(password_hash)


# ─── JWT 工具 ───

def create_token(user_id: str, phone: str, nickname: str, is_admin: bool) -> str:
    payload = {
        "sub": user_id,
        "phone": phone,
        "nickname": nickname,
        "is_admin": is_admin,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


# ─── 依赖注入 ───

async def get_current_user(
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="未登录")
    token = authorization.removeprefix("Bearer ")
    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="登录已过期，请重新登录")

    # Check if user is still active
    user_id = payload.get("sub")
    if user_id:
        result = await db.execute(select(User).where(User.id == user_id))
        db_user = result.scalar_one_or_none()
        if not db_user or not db_user.is_active:
            raise HTTPException(status_code=401, detail="账号已被禁用，请联系管理员")

    return payload


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="需要管理员权限")
    return user


# ─── 验证码（开发环境简化） ───

def generate_captcha_code(length: int = 4) -> str:
    return ''.join(secrets.choice(string.digits) for _ in range(length))


# 内存存储（生产环境应使用 Redis）
_captcha_store: dict[str, dict] = {}


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


@router.get("/captcha")
async def get_captcha():
    captcha_id = str(uuid.uuid4())
    code = generate_captcha_code()
    _captcha_store[captcha_id] = {
        "code": code,
        "created_at": datetime.now(timezone.utc),
    }
    # 清理过期验证码（5分钟）
    now = datetime.now(timezone.utc)
    expired = [k for k, v in _captcha_store.items() if (now - v["created_at"]).total_seconds() > 300]
    for k in expired:
        del _captcha_store[k]

    return {"captcha_id": captcha_id, "code": code}


def _verify_and_consume_captcha(captcha_id: str, captcha_code: str) -> Optional[str]:
    captcha = _captcha_store.pop(captcha_id, None)
    if not captcha:
        return "验证码已过期，请重新获取"
    if captcha["code"] != captcha_code:
        _captcha_store[captcha_id] = captcha  # 放回去
        return "验证码错误"
    return None


@router.post("/register")
async def register(data: RegisterRequest, db: AsyncSession = Depends(get_db)):
    if not data.phone or len(data.phone) != 11 or not data.phone.isdigit():
        return {"ok": False, "message": "手机号格式不正确"}

    if len(data.password) < 8:
        return {"ok": False, "message": "密码长度不能少于8位"}
    if not any(c.isalpha() for c in data.password):
        return {"ok": False, "message": "密码必须包含字母"}
    if not any(c.isdigit() for c in data.password):
        return {"ok": False, "message": "密码必须包含数字"}

    err = _verify_and_consume_captcha(data.captcha_id, data.captcha_code)
    if err:
        return {"ok": False, "message": err}

    result = await db.execute(select(User).where(User.phone == data.phone))
    if result.scalar_one_or_none():
        return {"ok": False, "message": "该手机号已注册"}

    user = User(
        phone=data.phone,
        password_hash=hash_password(data.password),
        nickname=f"用户{data.phone[-4:]}",
    )
    db.add(user)
    await db.commit()

    return {"ok": True, "message": "注册成功"}


@router.post("/login")
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)):
    if not data.phone or len(data.phone) != 11 or not data.phone.isdigit():
        return {"ok": False, "message": "手机号格式不正确"}

    err = _verify_and_consume_captcha(data.captcha_id, data.captcha_code)
    if err:
        return {"ok": False, "message": err}

    result = await db.execute(select(User).where(User.phone == data.phone))
    user = result.scalar_one_or_none()
    if not user:
        return {"ok": False, "message": "用户不存在"}

    if not verify_password(data.password, user.password_hash):
        return {"ok": False, "message": "密码错误"}

    # 自动迁移旧的 SHA256 哈希到 bcrypt
    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(data.password)
        await db.commit()

    if not user.is_active:
        return {"ok": False, "message": "该账号已禁用，请联系管理员"}

    token = create_token(user.id, user.phone, user.nickname, user.is_admin or False)
    avatar_url = user.avatar or ""
    if avatar_url and not avatar_url.startswith("http"):
        avatar_url = f"{settings.BASE_URL}{avatar_url}"

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
        },
    }


@router.get("/me")
async def get_me(user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == user["sub"]))
    db_user = result.scalar_one_or_none()
    if not db_user:
        raise HTTPException(status_code=404, detail="用户不存在")

    avatar = db_user.avatar or ""
    if avatar and not avatar.startswith("http"):
        avatar = f"{settings.BASE_URL}{avatar}"

    return {
        "ok": True,
        "user": {
            "id": db_user.id,
            "phone": db_user.phone,
            "nickname": db_user.nickname,
            "avatar": avatar,
            "is_admin": db_user.is_admin or False,
        },
    }


@router.post("/logout")
async def logout(user: dict = Depends(get_current_user)):
    return {"ok": True, "message": "已退出登录"}


class UpdateProfileRequest(BaseModel):
    nickname: str


@router.put("/profile")
async def update_profile(
    data: UpdateProfileRequest,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user["sub"]))
    db_user = result.scalar_one_or_none()
    if not db_user:
        raise HTTPException(status_code=404, detail="用户不存在")

    db_user.nickname = data.nickname
    db_user.updated_at = datetime.now(timezone.utc)
    await db.commit()

    return {"ok": True, "message": "保存成功"}


@router.post("/avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not file.content_type or not file.content_type.startswith("image/"):
        return {"ok": False, "message": "请上传图片文件"}

    content = await file.read()
    if len(content) > 2 * 1024 * 1024:
        return {"ok": False, "message": "图片大小不能超过 2MB"}

    ext = file.content_type.split("/")[-1]
    if ext not in ("jpeg", "jpg", "png", "gif", "webp"):
        return {"ok": False, "message": "不支持的图片格式"}

    filename = f"avatar_{uuid.uuid4().hex[:12]}.{ext}"
    upload_dir = os.path.join(settings.UPLOAD_DIR, "avatars")
    os.makedirs(upload_dir, exist_ok=True)
    filepath = os.path.join(upload_dir, filename)
    with open(filepath, "wb") as f:
        f.write(content)

    avatar_url = f"/uploads/avatars/{filename}"

    result = await db.execute(select(User).where(User.id == user["sub"]))
    db_user = result.scalar_one_or_none()
    if db_user:
        db_user.avatar = avatar_url
        db_user.updated_at = datetime.now(timezone.utc)
        await db.commit()

    full_url = f"{settings.BASE_URL}{avatar_url}"
    return {"ok": True, "message": "上传成功", "avatar": full_url}


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


@router.put("/password")
async def change_password(
    data: ChangePasswordRequest,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user["sub"]))
    db_user = result.scalar_one_or_none()
    if not db_user:
        raise HTTPException(status_code=404, detail="用户不存在")

    if not verify_password(data.old_password, db_user.password_hash):
        return {"ok": False, "message": "原密码错误"}

    if len(data.new_password) < 8:
        return {"ok": False, "message": "新密码长度不能少于8位"}
    if not any(c.isalpha() for c in data.new_password):
        return {"ok": False, "message": "新密码必须包含字母"}
    if not any(c.isdigit() for c in data.new_password):
        return {"ok": False, "message": "新密码必须包含数字"}

    db_user.password_hash = hash_password(data.new_password)
    db_user.updated_at = datetime.now(timezone.utc)
    await db.commit()

    return {"ok": True, "message": "密码修改成功"}


@router.get("/users")
async def list_users(user: dict = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    users = result.scalars().all()

    return {
        "ok": True,
        "users": [
            {
                "id": u.id,
                "phone": u.phone,
                "nickname": u.nickname,
                "avatar": f"{settings.BASE_URL}{u.avatar}" if u.avatar and not u.avatar.startswith("http") else (u.avatar or ""),
                "is_active": u.is_active,
                "is_admin": u.is_admin or False,
                "created_at": u.created_at.isoformat() if u.created_at else "",
            }
            for u in users
        ],
    }


class UpdateUserRequest(BaseModel):
    nickname: Optional[str] = None
    is_admin: Optional[bool] = None
    is_active: Optional[bool] = None


@router.put("/users/{user_id}")
async def update_user(
    user_id: str,
    data: UpdateUserRequest,
    user: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    db_user = result.scalar_one_or_none()
    if not db_user:
        raise HTTPException(status_code=404, detail="用户不存在")

    if data.nickname is not None:
        db_user.nickname = data.nickname
    if data.is_admin is not None:
        db_user.is_admin = data.is_admin
    if data.is_active is not None:
        if db_user.is_admin and not data.is_active:
            return {"ok": False, "message": "不能禁用管理员账号"}
        db_user.is_active = data.is_active
    db_user.updated_at = datetime.now(timezone.utc)
    await db.commit()

    return {"ok": True, "message": "更新成功"}


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    user: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    if user.get("sub") == user_id:
        return {"ok": False, "message": "不能删除自己的账号"}

    result = await db.execute(select(User).where(User.id == user_id))
    db_user = result.scalar_one_or_none()
    if not db_user:
        raise HTTPException(status_code=404, detail="用户不存在")

    if db_user.is_admin:
        return {"ok": False, "message": "不能删除管理员账号"}

    await db.delete(db_user)
    await db.commit()

    return {"ok": True, "message": "删除成功"}
