import { request } from "./request";
import type { Project, ProjectCreate, ProjectUpdate } from "../contracts/project";

export const projectsApi = {
  list: () => request<Project[]>("/projects"),
  get: (id: string) => request<Project>(`/projects/${id}`),
  create: (data: ProjectCreate) =>
    request<Project>("/projects", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: ProjectUpdate) =>
    request<Project>(`/projects/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (id: string) =>
    request<{ ok: boolean }>(`/projects/${id}`, { method: "DELETE" }),
};
