// Automation Types

export type ScriptType = "UI" | "API" | "混合";
export type ScriptFramework = "Playwright" | "Selenium" | "pytest";
export type ScriptLanguage = "Python" | "TypeScript";
export type ScriptStatus = "未测试" | "通过" | "失败" | "待执行" | "执行中" | "成功";

export interface Script {
  id: string;
  projectId: string;
  testCaseId: string | null;
  scriptType: ScriptType;
  framework: ScriptFramework;
  language: ScriptLanguage;
  code: string;
  status: ScriptStatus;
  scriptCode: string;
  reviewStatus: string;
  generatedByAi: boolean;
  executedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScriptGenerateRequest {
  testCaseIds: string[];
}

export interface ExecutionResult {
  executionRunId: string;
  scriptId: string;
  status: string;
  output: string;
  error: string | null;
  executedAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  durationSeconds?: number | null;
}

export interface ExecutionRun {
  id: string;
  projectId: string;
  scriptId: string | null;
  testCaseId: string | null;
  environmentId: string | null;
  accountId: string | null;
  status: string;
  environmentSnapshot: string;
  output: string;
  error: string;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export interface ExecutionOptions {
  boundEnvironmentId: string | null;
  targetPlatform: "PC" | "APP";
  testUrl: string;
  requiredRole: string;
  environments: Array<{
    id: string;
    name: string;
    webUrl: string;
    appUrl: string;
    captchaRequired?: boolean;
    captchaCode?: string;
    accounts: Array<{ id: string; name: string; role: string; username: string; hasPassword: boolean }>;
  }>;
}

export interface ExecuteScriptRequest {
  environmentId: string;
  accountId?: string;
  headed?: boolean;
  slowMo?: number;
}
