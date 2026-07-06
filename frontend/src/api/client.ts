// 后端API地址 - 通过环境变量配置
const API_BASE = import.meta.env.VITE_API_BASE || "/api";

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...getAuthHeaders(),
    ...(options?.headers as Record<string, string> || {}),
  };
  let res: Response;
  try {
    res = await fetch(url, { ...options, headers });
  } catch {
    throw new Error("网络连接失败，请检查后端服务是否启动");
  }
  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem("token");
      window.location.href = "/login";
      throw new Error("登录已过期");
    }
    if (res.status === 404) return null as T;
    const errText = await res.text();
    let detail = errText;
    try { const j = JSON.parse(errText); detail = j.detail || errText; } catch {}
    throw new Error(detail);
  }
  return res.json();
}

// ─── Projects ───

export interface ApiProject {
  id: string;
  name: string;
  version: string;
  testType: string;
  testStatus: string;
  docStatus: string;
  description: string;
  caseCount: number;
  passRate: number;
  priority: string;
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
      headers: getAuthHeaders(),
      body: formData,
    });
    if (!res.ok) {
      const errText = await res.text();
      let detail = errText;
      try { detail = JSON.parse(errText).detail || errText; } catch { /* keep raw */ }
      throw new Error(detail);
    }
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
  createdAt: string;
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

// ─── Model Config ───

export interface ApiModelConfig {
  id: string;
  name: string;
  aiNode: string;
  provider: string;
  modelName: string;
  apiKey: string;
  endpoint: string;
  description: string;
  enabled: boolean;
}

export const modelConfigApi = {
  list: () => request<ApiModelConfig[]>("/model-configs"),
  get: (id: string) => request<ApiModelConfig>(`/model-configs/${id}`),
  update: (configs: ApiModelConfig[]) =>
    request<{ ok: boolean; count: number }>("/model-configs", {
      method: "PUT",
      body: JSON.stringify({ configs }),
    }),
  test: (id: string) =>
    request<{ ok: boolean; message: string; detail?: string }>(`/model-configs/${id}/test`, {
      method: "POST",
    }),
};

// ─── Automation Scripts ───

export interface ApiScript {
  id: string;
  projectId: string;
  testCaseId: string | null;
  scriptType: string;
  framework: string;
  language: string;
  code: string;
  status: string;
  generatedByAi: boolean;
  createdAt: string;
  updatedAt: string;
}

export const scriptsApi = {
  list: (projectId: string) => request<ApiScript[]>(`/projects/${projectId}/scripts`),
  get: (id: string) => request<ApiScript>(`/scripts/${id}`),
  update: (id: string, data: Partial<ApiScript>) =>
    request<ApiScript>(`/scripts/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (id: string) => request<{ ok: boolean }>(`/scripts/${id}`, { method: "DELETE" }),
  generate: (projectId: string) =>
    request<{ ok: boolean; count: number; scripts: ApiScript[] }>(`/projects/${projectId}/scripts/generate`, { method: "POST" }),
};
