import type { LucideIcon } from "lucide-react";

// ─── 路由视图 ───

export type ViewKey =
  | "dashboard"
  | "projects"
  | "testCenter"
  | "documentCenter"
  | "modelConfig"
  | "userManagement"
  | "docConfig";

// ─── 导航 ───

export interface NavigationItem {
  key: ViewKey;
  label: string;
  description: string;
  icon: LucideIcon;
  hidden?: boolean;
}

// ─── 指标卡片 ───

export interface Metric {
  label: string;
  value: string;
  trend: string;
  tone: "blue" | "green" | "amber" | "red" | "slate";
}

// ─── 项目 ───

export type ProjectStatus = "设计中" | "执行中" | "阻塞" | "已完成";
export type TestType = "首轮全量测试" | "回归测试" | "增量测试" | "专项测试";

export interface Project {
  id: string;
  name: string;
  testType: TestType;
  testStatus: string;
  docStatus: string;
  description: string;
  caseCount: number;
  passRate: number;
  priority: "高" | "中" | "低";
  createdAt: string;
  updatedAt: string;
}

// ─── 文件资源 ───

export type FileType = "需求文档" | "接口文档" | "原型" | "变更说明" | "其他";
export type ParseStatus = "待解析" | "解析中" | "已完成" | "失败";

export interface FileAsset {
  id: string;
  projectId: string;
  name: string;
  fileType: FileType;
  size: string;
  parseStatus: ParseStatus;
  uploadedAt: string;
}

// ─── 需求 ───

export interface Requirement {
  id: string;
  reqId: string;
  projectId: string;
  module: string;
  feature: string;
  source: string;
  risk: "高" | "中" | "低";
  rule: string;
  question: string;
  confirmed: boolean;
  clarificationStatus?: string;
  clarificationAnswer?: string;
  reviewStatus: string;
  validityStatus?: string;
  invalidReason?: string;
  invalidatedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── 测试点 ───

export type TestPointType =
  | "正常流程"
  | "异常流程"
  | "边界值"
  | "权限控制"
  | "数据一致性"
  | "状态流转";
export type Priority = "P0" | "P1" | "P2" | "P3";
export type ReviewStatus = "待评审" | "评审中" | "已通过" | "需修改" | "已驳回";

export interface TestPoint {
  id: string;
  pointCode: string;
  projectId: string;
  requirementId: string | null;
  module: string;
  type: TestPointType;
  title: string;
  description: string;
  priority: Priority;
  automatable: boolean;
  reviewStatus: ReviewStatus;
  validityStatus?: string;
  invalidReason?: string;
  invalidatedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── 测试用例 ───

export type AutomationFlag = "是" | "否";

export interface TestCase {
  id: string;
  projectId: string;
  testPointId: string | null;
  requirementId: string | null;
  caseCode: string;
  module: string;
  feature: string;
  title: string;
  priority: Priority;
  precondition: string;
  steps: string;
  testData: string;
  expectedResult: string;
  environmentId: string | null;
  targetPlatform: "PC" | "APP";
  testUrl: string;
  requiredRole: string;
  testType: string;
  actualResult: string;
  passed: string;
  automation: AutomationFlag;
  reviewStatus: ReviewStatus;
  validityStatus?: string;
  invalidReason?: string;
  invalidatedAt?: string | null;
  remark: string;
  tester: string;
  testDate: string;
  createdAt: string;
  updatedAt: string;
}

// ─── AI 任务 ───

export type AITaskType =
  | "需求解析"
  | "AI反推需求"
  | "测试点生成"
  | "用例生成"
  | "脚本生成"
  | "执行脚本"
  | "文档生成"
  | "系统识别";
export type AITaskStatus = "等待" | "执行中" | "成功" | "失败";

export interface AITask {
  id: string;
  projectId: string;
  type: AITaskType;
  status: AITaskStatus;
  modelName: string;
  createdAt: string;
  finishedAt?: string;
  errorMessage?: string;
}

// ─── 自动化脚本 ───

export type ScriptType = "UI" | "API" | "混合";
export type ScriptFramework = "Playwright" | "Selenium" | "pytest";
export type ScriptStatus = "未测试" | "通过" | "失败" | "待执行" | "执行中" | "成功";

export interface AutomationScript {
  id: string;
  scriptCode: string;
  projectId: string;
  testCaseId: string | null;
  scriptType: ScriptType;
  framework: ScriptFramework;
  language: string;
  code: string;
  status: ScriptStatus;
  reviewStatus: string;
  validityStatus?: string;
  invalidReason?: string;
  invalidatedAt?: string | null;
  executedAt: string | null;
  generatedByAi: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Agent 能力（展示用） ───

export interface AgentCapability {
  name: string;
  input: string;
  output: string;
  status: "已规划" | "MVP" | "后续";
}

// ─── 路线图（展示用） ───

export interface RoadmapPhase {
  phase: string;
  goal: string;
  capabilities: string;
  status: "当前" | "下一步" | "规划";
}

// ─── 通知（重新导出自 contracts/system.ts） ───

export type { NotificationType, AppNotification } from "../../contracts/system";
