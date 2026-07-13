from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import Optional

from app.routers.deps import get_current_user, require_admin, get_auth_service
from app.services.auth_service import AuthService, decode_token, create_token

router = APIRouter()


# ── 验证码（开发环境简化） ──

import uuid
import secrets
import string
from datetime import datetime, timezone

def generate_captcha_code(length: int = 4) -> str:
    return ''.join(secrets.choice(string.digits) for _ in range(length))


_captcha_store: dict[str, dict] = {}


def _verify_and_consume_captcha(captcha_id: str, captcha_code: str) -> Optional[str]:
    captcha = _captcha_store.pop(captcha_id, None)
    if not captcha:
        return "验证码已过期，请重新获取"
    if captcha["code"] != captcha_code:
        _captcha_store[captcha_id] = captcha
        return "验证码错误"
    return None


@router.get("/captcha")
async def get_captcha():
    captcha_id = str(uuid.uuid4())
    code = generate_captcha_code()
    _captcha_store[captcha_id] = {
        "code": code,
        "created_at": datetime.now(timezone.utc),
    }
    # 清理过期验证码
    now = datetime.now(timezone.utc)
    expired = [k for k, v in _captcha_store.items() if (now - v["created_at"]).total_seconds() > 300]
    for k in expired:
        del _captcha_store[k]

    import base64
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40" viewBox="0 0 120 40">
        <rect width="120" height="40" fill="#f0f0f0"/>
        <text x="60" y="28" font-family="monospace" font-size="20" font-weight="bold" fill="#333" text-anchor="middle">{code}</text>
        <line x1="10" y1="10" x2="110" y2="30" stroke="#999" stroke-width="1"/>
        <line x1="20" y1="35" x2="100" y2="5" stroke="#999" stroke-width="1"/>
    </svg>'''
    img_base64 = base64.b64encode(svg.encode()).decode()

    return {
        "captcha_id": captcha_id,
        "code": code,
        "image": f"data:image/svg+xml;base64,{img_base64}"
    }


# ── Auth Routes ──

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


@router.post("/register")
async def register(
    data: RegisterRequest,
    service: AuthService = Depends(get_auth_service),
):
    err = _verify_and_consume_captcha(data.captcha_id, data.captcha_code)
    if err:
        return {"ok": False, "message": err}
    return await service.register({"phone": data.phone, "password": data.password})


@router.post("/login")
async def login(
    data: LoginRequest,
    service: AuthService = Depends(get_auth_service),
):
    err = _verify_and_consume_captcha(data.captcha_id, data.captcha_code)
    if err:
        return {"ok": False, "message": err}
    return await service.login({"phone": data.phone, "password": data.password})


@router.get("/me")
async def get_me(
    user: dict = Depends(get_current_user),
    service: AuthService = Depends(get_auth_service),
):
    result = await service.get_current_user(user["sub"])
    if not result:
        raise HTTPException(status_code=404, detail="用户不存在")
    return {"ok": True, "user": result}


@router.post("/logout")
async def logout(user: dict = Depends(get_current_user)):
    return {"ok": True, "message": "已退出登录"}


class UpdateProfileRequest(BaseModel):
    nickname: str


@router.put("/profile")
async def update_profile(
    data: UpdateProfileRequest,
    user: dict = Depends(get_current_user),
    service: AuthService = Depends(get_auth_service),
):
    return await service.update_profile(user["sub"], {"nickname": data.nickname})


@router.post("/avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
    service: AuthService = Depends(get_auth_service),
):
    content = await file.read()
    return await service.upload_avatar(user["sub"], content, file.content_type or "")


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


@router.put("/password")
async def change_password(
    data: ChangePasswordRequest,
    user: dict = Depends(get_current_user),
    service: AuthService = Depends(get_auth_service),
):
    return await service.change_password(user["sub"], data.old_password, data.new_password)


@router.get("/users")
async def list_users(
    user: dict = Depends(require_admin),
    service: AuthService = Depends(get_auth_service),
):
    users = await service.list_users()
    return {"ok": True, "users": users}


class UpdateUserRequest(BaseModel):
    nickname: Optional[str] = None
    is_admin: Optional[bool] = None
    is_active: Optional[bool] = None


@router.put("/users/{user_id}")
async def update_user(
    user_id: str,
    data: UpdateUserRequest,
    user: dict = Depends(require_admin),
    service: AuthService = Depends(get_auth_service),
):
    update_data = {}
    if data.nickname is not None:
        update_data["nickname"] = data.nickname
    if data.is_admin is not None:
        update_data["is_admin"] = data.is_admin
    if data.is_active is not None:
        update_data["is_active"] = data.is_active
    return await service.update_user(user_id, update_data)


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    user: dict = Depends(require_admin),
    service: AuthService = Depends(get_auth_service),
):
    if user.get("sub") == user_id:
        return {"ok": False, "message": "不能删除自己的账号"}
    return await service.delete_user(user_id)
