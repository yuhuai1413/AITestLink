import { request, getAuthHeaders, API_BASE } from "./request";
import type { User, ModelConfig, DocConfig, StatusLog, AITask, DocGenStatus, ConfigCheckResult } from "../contracts/system";

// ─── Auth API ───

export const authApi = {
  getCaptcha: () => request<{ captcha_id: string; code: string; image: string }>("/auth/captcha"),
  register: (data: { phone: string; password: string; captcha_id: string; captcha_code: string }) =>
    request<{ ok: boolean; message: string }>("/auth/register", { method: "POST", body: JSON.stringify(data) }),
  login: (data: { phone: string; password: string; captcha_id: string; captcha_code: string }) =>
    request<{ ok: boolean; message: string; token?: string; user?: User }>("/auth/login", { method: "POST", body: JSON.stringify(data) }),
  logout: () => request<{ ok: boolean }>("/auth/logout", { method: "POST" }),
  getMe: () => request<{ ok: boolean; user: User }>("/auth/me"),
  updateProfile: (data: { nickname: string }) =>
    request<{ ok: boolean; message: string }>("/auth/profile", { method: "PUT", body: JSON.stringify(data) }),
  uploadAvatar: async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${API_BASE}/auth/avatar`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: formData,
    });
    if (!res.ok) {
      const errText = await res.text();
      let detail = errText;
      try { detail = JSON.parse(errText).message || errText; } catch { /* keep raw */ }
      throw new Error(detail);
    }
    return res.json() as Promise<{ ok: boolean; message: string; avatar: string }>;
  },
  changePassword: (data: { old_password: string; new_password: string }) =>
    request<{ ok: boolean; message: string }>("/auth/password", { method: "PUT", body: JSON.stringify(data) }),
  listUsers: () => request<{ ok: boolean; users: User[] }>("/auth/users"),
  updateUser: (userId: string, data: Partial<User>) =>
    request<{ ok: boolean; message: string }>(`/auth/users/${userId}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteUser: (userId: string) =>
    request<{ ok: boolean; message: string }>(`/auth/users/${userId}`, { method: "DELETE" }),
};

// ─── Model Config API ───

export const modelConfigApi = {
  list: () => request<ModelConfig[]>("/model-configs"),
  get: (id: string) => request<ModelConfig>(`/model-configs/${id}`),
  update: (configs: ModelConfig[]) =>
    request<{ ok: boolean; count: number }>("/model-configs", {
      method: "PUT",
      body: JSON.stringify({ configs }),
    }),
  test: (id: string) =>
    request<{ ok: boolean; message: string; detail?: string }>(`/model-configs/${id}/test`, {
      method: "POST",
    }),
};

// ─── Doc Config API ───

export const docConfigApi = {
  list: () => request<DocConfig[]>("/doc-configs"),
  get: (id: string) => request<DocConfig>("/doc-configs/" + id),
  update: (configs: DocConfig[]) =>
    request<{ ok: boolean; count: number }>("/doc-configs", {
      method: "PUT",
      body: JSON.stringify({ configs }),
    }),
  downloadUrl: (id: string) => API_BASE + "/doc-configs/" + id + "/download",
  upload: (id: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return fetch(API_BASE + "/doc-configs/" + id + "/upload", {
      method: "POST",
      headers: getAuthHeaders(),
      body: formData,
    }).then((r) => r.json()) as Promise<{ ok: boolean; templateFile: string }>;
  },
};

// ─── Status Log API ───

export const statusLogsApi = {
  list: (projectId: string) => request<StatusLog[]>(`/projects/${projectId}/status-logs`),
};

// ─── AI API ───

export const aiApi = {
  listTasks: (projectId: string) => request<AITask[]>(`/projects/${projectId}/ai/tasks`),
  checkConfig: (projectId: string, taskType: string) =>
    request<ConfigCheckResult>(`/projects/${projectId}/ai/check-config/${taskType}`),
  parseRequirements: (projectId: string) =>
    request<AITask>(`/projects/${projectId}/ai/parse-requirements`, { method: "POST" }),
  generateTestPoints: (projectId: string) =>
    request<AITask>(`/projects/${projectId}/ai/generate-test-points`, { method: "POST" }),
  generateTestCases: (projectId: string) =>
    request<AITask>(`/projects/${projectId}/ai/generate-test-cases`, { method: "POST" }),
  reviewTestCases: (projectId: string) =>
    request<AITask>(`/projects/${projectId}/ai/review-test-cases`, { method: "POST" }),
  generateDocs: (projectId: string, templateId?: string) =>
    request<AITask>(`/projects/${projectId}/ai/generate-docs`, {
      method: "POST",
      body: templateId ? JSON.stringify({ template_id: templateId }) : undefined,
    }),
};

// ─── Doc Gen Status API ───

export const docGenApi = {
  getStatus: (projectId: string) => request<DocGenStatus>(`/projects/${projectId}/doc-gen-status`),
  updateStatus: (projectId: string, templateId: string, status: string) =>
    request<{ ok: boolean; status: string }>(`/projects/${projectId}/doc-gen-status`, {
      method: "PUT",
      body: JSON.stringify({ template_id: templateId, status }),
    }),
};
