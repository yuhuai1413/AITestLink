// Automation Types

export interface Script {
  id: string;
  projectId: string;
  testCaseId: string | null;
  scriptType: string;
  framework: string;
  language: string;
  code: string;
  status: string;
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

export type ScriptType = "UI" | "API" | "混合";
export type ScriptFramework = "Playwright" | "Selenium" | "pytest";
export type ScriptLanguage = "Python" | "TypeScript";
export type ScriptStatus = "待执行" | "执行中" | "成功" | "失败";
