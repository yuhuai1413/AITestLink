import { request, getAuthHeaders, API_BASE } from "./request";
import type { FileAsset, Requirement, RequirementUpdate } from "../contracts/document";

export const filesApi = {
  list: (projectId: string) => request<FileAsset[]>(`/projects/${projectId}/files`),
  upload: async (projectId: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${API_BASE}/projects/${projectId}/files`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: formData,
    });
    if (!res.ok) {
      const errText = await res.text();
      let detail = errText;
      try { detail = JSON.parse(errText).detail || errText; } catch { /* keep raw */ }
      throw new Error(detail);
    }
    return res.json() as Promise<FileAsset>;
  },
  delete: (id: string) => request<{ ok: boolean }>(`/files/${id}`, { method: "DELETE" }),
};

export const requirementsApi = {
  list: (projectId: string) => request<Requirement[]>(`/projects/${projectId}/requirements`),
  update: (id: string, data: RequirementUpdate) =>
    request<Requirement>(`/requirements/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (id: string) => request<{ ok: boolean }>(`/requirements/${id}`, { method: "DELETE" }),
  export: async (projectId: string) => {
    const response = await fetch(`${API_BASE}/projects/${projectId}/requirements/export`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) {
      const text = await response.text();
      let detail = text;
      try { detail = JSON.parse(text).detail || text; } catch {}
      throw new Error(detail || "导出失败");
    }
    return response.blob();
  },
};
