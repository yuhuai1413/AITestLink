import { request } from "./request";
import type { Script, ExecutionResult } from "../contracts/automation";

export const scriptsApi = {
  list: (projectId: string) => request<Script[]>(`/projects/${projectId}/scripts`),
  get: (id: string) => request<Script>(`/scripts/${id}`),
  update: (id: string, data: Partial<Script>) =>
    request<Script>(`/scripts/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (id: string) => request<{ ok: boolean }>(`/scripts/${id}`, { method: "DELETE" }),
  generate: (projectId: string) =>
    request<{ ok: boolean; count: number; scripts: Script[] }>(`/projects/${projectId}/scripts/generate`, { method: "POST" }),
  execute: (id: string) =>
    request<ExecutionResult>(`/scripts/${id}/execute`, { method: "POST" }),
};
