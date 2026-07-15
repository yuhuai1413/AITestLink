// Automation Types

export type ScriptType = "UI" | "API" | "混合";
export type ScriptFramework = "Playwright" | "Selenium" | "pytest";
export type ScriptLanguage = "Python" | "TypeScript";
export type ScriptStatus = "待执行" | "执行中" | "成功" | "失败";

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
  scriptId: string;
  status: string;
  output: string;
  error: string | null;
  executedAt: string;
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
    accounts: Array<{ id: string; name: string; role: string; username: string; hasPassword: boolean }>;
  }>;
}

export interface ExecuteScriptRequest {
  environmentId: string;
  accountId?: string;
}
