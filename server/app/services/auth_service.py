from __future__ import annotations

import hashlib
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt
from sqlalchemy import select

from app.config import settings
from app.models.user import User
from app.services.base import BaseService
from app.contracts.system import LoginRequest, RegisterRequest, UserUpdate

JWT_SECRET = settings.JWT_SECRET
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = 24


# ── 密码工具 ────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def _is_bcrypt(hash_str: str) -> bool:
    return hash_str.startswith("$2")


def verify_password(password: str, password_hash: str) -> bool:
    if _is_bcrypt(password_hash):
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    return hashlib.sha256(password.encode()).hexdigest() == password_hash


def needs_rehash(password_hash: str) -> bool:
    return not _is_bcrypt(password_hash)


# ── JWT 工具 ────────────────────────────────────────────────────────

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
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None


class AuthService(BaseService):
    """用户认证服务"""

    async def login(self, data: LoginRequest | dict) -> dict:
        phone = data.phone if isinstance(data, LoginRequest) else data.get("phone", "")
        password = data.password if isinstance(data, LoginRequest) else data.get("password", "")

        if not phone or len(phone) != 11 or not phone.isdigit():
            return {"ok": False, "message": "手机号格式不正确"}

        result = await self.db.execute(select(User).where(User.phone == phone))
        user = result.scalar_one_or_none()
        if not user:
            return {"ok": False, "message": "用户不存在"}

        if not verify_password(password, user.password_hash):
            return {"ok": False, "message": "密码错误"}

        if needs_rehash(user.password_hash):
            user.password_hash = hash_password(password)
            await self.db.commit()

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

    async def register(self, data: RegisterRequest | dict) -> dict:
        phone = data.phone if isinstance(data, RegisterRequest) else data.get("phone", "")
        password = data.password if isinstance(data, RegisterRequest) else data.get("password", "")

        if not phone or len(phone) != 11 or not phone.isdigit():
            return {"ok": False, "message": "手机号格式不正确"}

        if len(password) < 8:
            return {"ok": False, "message": "密码长度不能少于8位"}
        if not any(c.isalpha() for c in password):
            return {"ok": False, "message": "密码必须包含字母"}
        if not any(c.isdigit() for c in password):
            return {"ok": False, "message": "密码必须包含数字"}

        result = await self.db.execute(select(User).where(User.phone == phone))
        if result.scalar_one_or_none():
            return {"ok": False, "message": "该手机号已注册"}

        user = User(
            phone=phone,
            password_hash=hash_password(password),
            nickname=f"用户{phone[-4:]}",
        )
        self.db.add(user)
        await self.db.commit()

        return {"ok": True, "message": "注册成功"}

    async def get_current_user(self, user_id: str) -> dict | None:
        result = await self.db.execute(select(User).where(User.id == user_id))
        db_user = result.scalar_one_or_none()
        if not db_user:
            return None

        avatar = db_user.avatar or ""
        if avatar and not avatar.startswith("http"):
            avatar = f"{settings.BASE_URL}{avatar}"

        return {
            "id": db_user.id,
            "phone": db_user.phone,
            "nickname": db_user.nickname,
            "avatar": avatar,
            "is_admin": db_user.is_admin or False,
        }

    async def update_profile(self, user_id: str, data: dict) -> dict | None:
        result = await self.db.execute(select(User).where(User.id == user_id))
        db_user = result.scalar_one_or_none()
        if not db_user:
            return None

        if "nickname" in data:
            db_user.nickname = data["nickname"]
        db_user.updated_at = self._now()
        await self.db.commit()
        return {"ok": True, "message": "保存成功"}

    async def change_password(self, user_id: str, old_password: str, new_password: str) -> dict:
        result = await self.db.execute(select(User).where(User.id == user_id))
        db_user = result.scalar_one_or_none()
        if not db_user:
            return {"ok": False, "message": "用户不存在"}

        if not verify_password(old_password, db_user.password_hash):
            return {"ok": False, "message": "原密码错误"}

        if len(new_password) < 8:
            return {"ok": False, "message": "新密码长度不能少于8位"}
        if not any(c.isalpha() for c in new_password):
            return {"ok": False, "message": "新密码必须包含字母"}
        if not any(c.isdigit() for c in new_password):
            return {"ok": False, "message": "新密码必须包含数字"}

        db_user.password_hash = hash_password(new_password)
        db_user.updated_at = self._now()
        await self.db.commit()
        return {"ok": True, "message": "密码修改成功"}

    async def upload_avatar(self, user_id: str, file_content: bytes, content_type: str) -> dict:
        if not content_type or not content_type.startswith("image/"):
            return {"ok": False, "message": "请上传图片文件"}

        if len(file_content) > 2 * 1024 * 1024:
            return {"ok": False, "message": "图片大小不能超过 2MB"}

        ext = content_type.split("/")[-1]
        if ext not in ("jpeg", "jpg", "png", "gif", "webp"):
            return {"ok": False, "message": "不支持的图片格式"}

        filename = f"avatar_{uuid.uuid4().hex[:12]}.{ext}"
        upload_dir = os.path.join(settings.UPLOAD_DIR, "avatars")
        os.makedirs(upload_dir, exist_ok=True)
        filepath = os.path.join(upload_dir, filename)
        with open(filepath, "wb") as f:
            f.write(file_content)

        avatar_url = f"/uploads/avatars/{filename}"

        result = await self.db.execute(select(User).where(User.id == user_id))
        db_user = result.scalar_one_or_none()
        if db_user:
            db_user.avatar = avatar_url
            db_user.updated_at = self._now()
            await self.db.commit()

        full_url = f"{settings.BASE_URL}{avatar_url}"
        return {"ok": True, "message": "上传成功", "avatar": full_url}

    async def list_users(self) -> list[dict]:
        result = await self.db.execute(select(User).order_by(User.created_at.desc()))
        users = result.scalars().all()
        return [
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
        ]

    async def update_user(self, user_id: str, data: dict) -> dict:
        result = await self.db.execute(select(User).where(User.id == user_id))
        db_user = result.scalar_one_or_none()
        if not db_user:
            return {"ok": False, "message": "用户不存在"}

        if "nickname" in data:
            db_user.nickname = data["nickname"]
        if "is_admin" in data:
            db_user.is_admin = data["is_admin"]
        if "is_active" in data:
            if db_user.is_admin and not data["is_active"]:
                return {"ok": False, "message": "不能禁用管理员账号"}
            db_user.is_active = data["is_active"]
        db_user.updated_at = self._now()
        await self.db.commit()
        return {"ok": True, "message": "更新成功"}

    async def delete_user(self, user_id: str) -> dict:
        result = await self.db.execute(select(User).where(User.id == user_id))
        db_user = result.scalar_one_or_none()
        if not db_user:
            return {"ok": False, "message": "用户不存在"}
        if db_user.is_admin:
            return {"ok": False, "message": "不能删除管理员账号"}
        await self.db.delete(db_user)
        await self.db.commit()
        return {"ok": True, "message": "删除成功"}
