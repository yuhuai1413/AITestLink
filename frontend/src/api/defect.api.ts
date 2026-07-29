import { API_BASE, getAuthHeaders, request } from "./request";
import type { Defect, DefectCreate, DefectUpdate, DefectStats } from "../contracts/defect";

export const defectsApi = {
  list: (projectId: string) =>
    request<Defect[]>(`/projects/${projectId}/defects`),

  create: (projectId: string, data: DefectCreate) =>
    request<Defect>(`/projects/${projectId}/defects`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (id: string, data: DefectUpdate) =>
    request<Defect>(`/defects/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    request<{ ok: boolean }>(`/defects/${id}`, { method: "DELETE" }),

  batchStatus: (ids: string[], status: string) =>
    request<{ ok: boolean; updated: number }>("/defects/batch-status", {
      method: "POST",
      body: JSON.stringify({ ids, status }),
    }),

  stats: (projectId: string) =>
    request<DefectStats>(`/projects/${projectId}/defects/stats`),

  export: async (projectId: string) => {
    const response = await fetch(`${API_BASE}/projects/${projectId}/defects/export`, {
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
