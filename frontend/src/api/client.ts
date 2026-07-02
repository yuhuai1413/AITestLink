const API_BASE = "http://localhost:8000/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API Error ${res.status}: ${err}`);
  }
  return res.json();
}

// ─── Projects ───

export interface ApiProject {
  id: string;
  name: string;
  version: string;
  owner: string;
  testType: string;
  status: string;
  description: string;
  caseCount: number;
  passRate: number;
  riskLevel: string;
  createdAt: string;
  updatedAt: string;
}

export const projectsApi = {
  list: () => request<ApiProject[]>("/projects"),
  get: (id: string) => request<ApiProject>(`/projects/${id}`),
  create: (data: Partial<ApiProject>) =>
    request<ApiProject>("/projects", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<ApiProject>) =>
    request<ApiProject>(`/projects/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (id: string) =>
    request<{ ok: boolean }>(`/projects/${id}`, { method: "DELETE" }),
};

// ─── Files ───

export interface ApiFile {
  id: string;
  projectId: string;
  name: string;
  fileType: string;
  size: string;
  parseStatus: string;
  uploadedAt: string;
}

export const filesApi = {
  list: (projectId: string) => request<ApiFile[]>(`/projects/${projectId}/files`),
  upload: async (projectId: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${API_BASE}/projects/${projectId}/files`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) throw new Error("Upload failed");
    return res.json() as Promise<ApiFile>;
  },
  delete: (id: string) => request<{ ok: boolean }>(`/files/${id}`, { method: "DELETE" }),
};

// ─── Requirements ───

export interface ApiRequirement {
  id: string;
  projectId: string;
  module: string;
  feature: string;
  source: string;
  risk: string;
  rule: string;
  question: string;
  confirmed: boolean;
}

export const requirementsApi = {
  list: (projectId: string) => request<ApiRequirement[]>(`/projects/${projectId}/requirements`),
  update: (id: string, data: Partial<ApiRequirement>) =>
    request<ApiRequirement>(`/requirements/${id}`, { method: "PUT", body: JSON.stringify(data) }),
};

// ─── Test Points ───

export interface ApiTestPoint {
  id: string;
  projectId: string;
  requirementId: string | null;
  module: string;
  type: string;
  title: string;
  description: string;
  priority: string;
  automatable: boolean;
  reviewStatus: string;
}

export const testPointsApi = {
  list: (projectId: string) => request<ApiTestPoint[]>(`/projects/${projectId}/test-points`),
  create: (projectId: string, data: Partial<ApiTestPoint>) =>
    request<ApiTestPoint>(`/projects/${projectId}/test-points`, { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<ApiTestPoint>) =>
    request<ApiTestPoint>(`/test-points/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (id: string) => request<{ ok: boolean }>(`/test-points/${id}`, { method: "DELETE" }),
};

// ─── Test Cases ───

export interface ApiTestCase {
  id: string;
  projectId: string;
  testPointId: string | null;
  requirementId: string | null;
  caseCode: string;
  module: string;
  feature: string;
  title: string;
  priority: string;
  precondition: string;
  steps: string;
  testData: string;
  expectedResult: string;
  automation: string;
  reviewStatus: string;
  remark: string;
  createdAt: string;
  updatedAt: string;
}

export const testCasesApi = {
  list: (projectId: string) => request<ApiTestCase[]>(`/projects/${projectId}/test-cases`),
  create: (projectId: string, data: Partial<ApiTestCase>) =>
    request<ApiTestCase>(`/projects/${projectId}/test-cases`, { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<ApiTestCase>) =>
    request<ApiTestCase>(`/test-cases/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (id: string) => request<{ ok: boolean }>(`/test-cases/${id}`, { method: "DELETE" }),
};

// ─── AI Tasks ───

export interface ApiAITask {
  id: string;
  projectId: string;
  type: string;
  status: string;
  modelName: string;
  errorMessage: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export const aiApi = {
  listTasks: (projectId: string) => request<ApiAITask[]>(`/projects/${projectId}/ai/tasks`),
  parseRequirements: (projectId: string) =>
    request<ApiAITask>(`/projects/${projectId}/ai/parse-requirements`, { method: "POST" }),
  generateTestPoints: (projectId: string) =>
    request<ApiAITask>(`/projects/${projectId}/ai/generate-test-points`, { method: "POST" }),
  generateTestCases: (projectId: string) =>
    request<ApiAITask>(`/projects/${projectId}/ai/generate-test-cases`, { method: "POST" }),
};
