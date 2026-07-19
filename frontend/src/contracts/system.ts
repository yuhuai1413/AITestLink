// System Types (Auth, Config, etc.)

export interface User {
  id: string;
  phone: string;
  nickname: string;
  avatar: string;
  isActive: boolean;
  isAdmin: boolean;
  createdAt: string;
}

export interface LoginRequest {
  phone: string;
  password: string;
  captchaId: string;
  captchaCode: string;
}

export interface RegisterRequest {
  phone: string;
  password: string;
  captchaId: string;
  captchaCode: string;
}

export interface TokenResponse {
  ok: boolean;
  message: string;
  token: string;
  user: User;
}

export interface ModelConfig {
  id: string;
  configKey: string;
  name: string;
  aiNode: string[];
  provider: string;
  modelName: string;
  apiKey: string;
  endpoint: string;
  description: string;
  enabled: boolean;
  connectionStatus: "untested" | "testing" | "normal" | "abnormal";
  lastTestedAt: string | null;
  lastTestMessage: string;
  lastTestLatencyMs: number | null;
  prompt: string;
  adminPrompt: string;
}

export interface DocConfig {
  id: string;
  configKey: string;
  name: string;
  description: string;
  templateFile: string;
  templateHash: string;
  templateStructure: string;
  parseStatus: string;
  parseError: string;
  parsedAt: string;
  promptTemplate: string;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface StatusLog {
  id: string;
  projectId: string;
  userId: string;
  fieldName: string;
  oldValue: string | null;
  newValue: string;
  changeType: string;
  reason: string | null;
  createdAt: string;
}

export interface AITask {
  id: string;
  projectId: string;
  type: string;
  status: string;
  modelName: string;
  errorMessage: string | null;
  result: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface DocGenStatus {
  [templateId: string]: {
    status: string;
    generatedAt: string | null;
  };
}

export interface ConfigCheckResult {
  configured: boolean;
  configId?: string;
  name: string;
  connectionStatus?: "untested" | "testing" | "normal" | "abnormal";
  lastTestedAt?: string | null;
  lastTestMessage?: string;
  message: string;
}

export type UserRole = "admin" | "manager" | "tester" | "viewer";

// ─── 通知 ───

export type NotificationType = "任务完成" | "任务失败";

export type AITaskType =
  | "需求解析"
  | "AI反推需求"
  | "测试点生成"
  | "用例生成"
  | "脚本生成"
  | "执行脚本"
  | "文档生成";

export interface AppNotification {
  id: string;
  type: NotificationType;
  taskType: AITaskType;
  projectName: string;
  projectId: string;
  message: string;
  targetPath: string;
  read: boolean;
  createdAt: string;
}
