import { request } from "./request";

export interface EnvironmentConfig {
  id: string;
  projectId: string;
  name: string;
  webUrl: string;
  appUrl: string;
  otherUrls: string;
  timeout: string;
  retryCount: string;
  notes: string;
  isDefault: boolean;
  accounts: TestAccount[];
  createdAt: string;
  updatedAt: string;
}

export interface TestAccount {
  id: string;
  environmentId: string;
  name: string;
  username: string;
  password: string;
  hasPassword: boolean;
  role: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface EnvironmentConfigCreate {
  name: string;
  webUrl?: string;
  appUrl?: string;
  otherUrls?: string;
  timeout?: string;
  retryCount?: string;
  notes?: string;
  isDefault?: boolean;
}

export interface TestAccountCreate {
  environmentId: string;
  name: string;
  username: string;
  password: string;
  role?: string;
  notes?: string;
}

export const environmentApi = {
  list: (projectId: string) =>
    request<EnvironmentConfig[]>(`/projects/${projectId}/environments`),

  create: (projectId: string, data: EnvironmentConfigCreate) =>
    request<EnvironmentConfig>(`/projects/${projectId}/environments`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (configId: string, data: Partial<EnvironmentConfigCreate>) =>
    request<EnvironmentConfig>(`/environments/${configId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  delete: (configId: string) =>
    request<{ ok: boolean }>(`/environments/${configId}`, {
      method: "DELETE",
    }),

  createAccount: (environmentId: string, data: TestAccountCreate) =>
    request<TestAccount>(`/environments/${environmentId}/accounts`, {
      method: "POST",
      body: JSON.stringify({ ...data, environmentId }),
    }),

  updateAccount: (accountId: string, data: Partial<TestAccountCreate>) =>
    request<TestAccount>(`/accounts/${accountId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  deleteAccount: (accountId: string) =>
    request<{ ok: boolean }>(`/accounts/${accountId}`, {
      method: "DELETE",
    }),
};
