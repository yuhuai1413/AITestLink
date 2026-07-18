import { API_BASE, getAuthHeaders, request } from "./request";
import type { TestPoint, TestPointCreate, TestPointUpdate, TestCase, TestCaseCreate, TestCaseUpdate, TestCoverage } from "../contracts/test-design";

export const testPointsApi = {
  list: (projectId: string) => request<TestPoint[]>(`/projects/${projectId}/test-points`),
  create: (projectId: string, data: TestPointCreate) =>
    request<TestPoint>(`/projects/${projectId}/test-points`, { method: "POST", body: JSON.stringify(data) }),
  generate: (projectId: string, requirementIds: string[]) =>
    request<TestPoint[]>(`/projects/${projectId}/test-points/generate`, {
      method: "POST",
      body: JSON.stringify({ requirement_ids: requirementIds }),
    }),
  update: (id: string, data: TestPointUpdate) =>
    request<TestPoint>(`/test-points/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (id: string) => request<{ ok: boolean }>(`/test-points/${id}`, { method: "DELETE" }),
  batchReview: (ids: string[], status: string) =>
    request<{ ok: boolean; updated: number }>("/test-points/batch-review", {
      method: "POST",
      body: JSON.stringify({ ids, status }),
    }),
};

export const testCasesApi = {
  list: (projectId: string) => request<TestCase[]>(`/projects/${projectId}/test-cases`),
  create: (projectId: string, data: TestCaseCreate) =>
    request<TestCase>(`/projects/${projectId}/test-cases`, { method: "POST", body: JSON.stringify(data) }),
  generate: (projectId: string, testPointIds: string[]) =>
    request<TestCase[]>(`/projects/${projectId}/test-cases/generate`, {
      method: "POST",
      body: JSON.stringify({ test_point_ids: testPointIds }),
    }),
  update: (id: string, data: TestCaseUpdate) =>
    request<TestCase>(`/test-cases/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (id: string) => request<{ ok: boolean }>(`/test-cases/${id}`, { method: "DELETE" }),
  batchStatus: (ids: string[], status: string) =>
    request<{ ok: boolean; updated: number }>("/test-cases/batch-status", {
      method: "POST",
      body: JSON.stringify({ ids, status }),
    }),
  batchReview: (ids: string[], status: string) =>
    request<{ ok: boolean; updated: number }>("/test-cases/batch-review", {
      method: "POST",
      body: JSON.stringify({ ids, status }),
    }),
  export: async (projectId: string, type: "all" | "manual") => {
    const response = await fetch(`${API_BASE}/projects/${projectId}/test-cases/export?type=${type}`, {
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
  getCoverage: (projectId: string) =>
    request<TestCoverage>(`/projects/${projectId}/coverage`),
};
