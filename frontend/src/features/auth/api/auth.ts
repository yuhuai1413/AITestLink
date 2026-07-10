import { api, setToken, getToken } from "./client";
import { TOKEN_KEY } from "../../../shared/config/storage";
import { API_BASE } from "../../../shared/config/deploy";

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
  return !!localStorage.getItem(TOKEN_KEY);
}

export async function getMe() {
  return api.get<{ ok: boolean; user: { id: string; phone: string; nickname: string; avatar: string; is_admin: boolean } }>("/auth/me");
}

export async function updateProfile(nickname: string) {
  return api.put<{ ok: boolean; message: string }>("/auth/profile", { nickname });
}

export async function uploadAvatar(file: File) {
  const token = getToken();
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(API_BASE + "/auth/avatar", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  return res.json() as Promise<{ ok: boolean; message: string; avatar: string }>;
}

export async function changePassword(oldPassword: string, newPassword: string) {
  return api.put<{ ok: boolean; message: string }>("/auth/password", {
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
  return api.get<{ ok: boolean; users: UserItem[] }>("/auth/users");
}

export async function getMeWithAdmin() {
  return api.get<{ ok: boolean; user: { id: string; phone: string; nickname: string; avatar: string; is_admin: boolean } }>("/auth/me");
}

export async function deleteUser(userId: string) {
  return api.delete<{ ok: boolean; message: string }>(`/auth/users/${userId}`);
}

export async function updateUser(userId: string, data: Record<string, unknown>) {
  return api.put<{ ok: boolean; message: string }>(`/auth/users/${userId}`, data);
}
