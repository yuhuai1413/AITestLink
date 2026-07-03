import { api, setToken, getToken } from "./client";

export async function getCaptcha() {
  return api.get<{ captcha_id: string; code: string }>("/auth/captcha");
}

export async function register(phone: string, password: string, captchaId: string, captchaCode: string) {
  return api.post<{ ok: boolean; message: string }>("/auth/register", {
    phone,
    password,
    captcha_id: captchaId,
    captcha_code: captchaCode,
  });
}

export async function login(phone: string, password: string, captchaId: string, captchaCode: string) {
  const res = await api.post<{ ok: boolean; message: string; token?: string; user?: Record<string, unknown> }>("/auth/login", {
    phone,
    password,
    captcha_id: captchaId,
    captcha_code: captchaCode,
  });
  if (res.ok && res.token) {
    setToken(res.token);
  }
  return res;
}

export function logout() {
  setToken(null);
}

export function isLoggedIn(): boolean {
  return !!localStorage.getItem("token");
}

export async function getMe() {
  const token = getToken();
  return api.get<{ ok: boolean; user: { user_id: string; phone: string; nickname: string; avatar: string } }>("/auth/me?token=" + (token || ""));
}

export async function updateProfile(nickname: string) {
  const token = getToken();
  return api.put<{ ok: boolean; message: string; nickname: string }>("/auth/profile?token=" + (token || ""), { nickname });
}

export async function uploadAvatar(file: File) {
  const token = getToken();
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`/api/auth/avatar?token=${token || ""}`, {
    method: "POST",
    body: formData,
  });
  return res.json() as Promise<{ ok: boolean; message: string; avatar: string }>;
}

export async function changePassword(oldPassword: string, newPassword: string) {
  const token = getToken();
  return api.put<{ ok: boolean; message: string }>("/auth/password?token=" + (token || ""), {
    old_password: oldPassword,
    new_password: newPassword,
  });
}

export interface UserItem {
  id: string;
  phone: string;
  nickname: string;
  avatar: string;
  is_active: boolean;
  is_admin: boolean;
  created_at: string;
}

export async function listUsers() {
  const token = getToken();
  return api.get<{ ok: boolean; users: UserItem[] }>("/auth/users?token=" + (token || ""));
}

export async function getMeWithAdmin() {
  const token = getToken();
  return api.get<{ ok: boolean; user: { user_id: string; phone: string; nickname: string; avatar: string; is_admin: boolean } }>("/auth/me?token=" + (token || ""));
}
