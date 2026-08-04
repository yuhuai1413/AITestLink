// Defect Types

export type DefectSeverity = "致命" | "严重" | "一般" | "轻微" | "建议";
export type DefectStatus = "新建" | "确认" | "修复中" | "已修复" | "已验证" | "已关闭" | "重新打开";
export type DefectPriority = "P0" | "P1" | "P2" | "P3";
export type DefectCategory = "功能缺陷" | "性能缺陷" | "界面缺陷" | "安全缺陷" | "兼容性缺陷";

export interface Defect {
  id: string;
  projectId: string;
  defectCode: string;
  title: string;
  description: string;
  severity: DefectSeverity;
  priority: DefectPriority;
  status: DefectStatus;
  module: string;
  category: DefectCategory;
  source: string;
  testCaseId: string | null;
  scriptId: string | null;
  executionRunId: string | null;
  screenshotUrl: string;
  stepsToReproduce: string;
  expectedResult: string;
  actualResult: string;
  environmentInfo: string;
  reporter: string;
  assignee: string;
  remark: string;
  testPlan: string;
  iteration: string;
  foundAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DefectCreate {
  title: string;
  description?: string;
  severity?: DefectSeverity;
  priority?: DefectPriority;
  status?: DefectStatus;
  module?: string;
  category?: DefectCategory;
  source?: string;
  testCaseId?: string | null;
  scriptId?: string | null;
  executionRunId?: string | null;
  screenshotUrl?: string;
  stepsToReproduce?: string;
  expectedResult?: string;
  actualResult?: string;
  environmentInfo?: string;
  reporter?: string;
  assignee?: string;
  remark?: string;
  testPlan?: string;
  iteration?: string;
}

export type DefectUpdate = Partial<DefectCreate>;

export interface DefectStats {
  total: number;
  bySeverity: Record<string, number>;
  byStatus: Record<string, number>;
  byModule: Record<string, number>;
  byCategory: Record<string, number>;
  bySource: Record<string, number>;
  autoCount: number;
  openCount: number;
  closedCount: number;
}
