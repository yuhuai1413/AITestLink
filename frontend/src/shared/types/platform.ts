import type { LucideIcon } from "lucide-react";

// ─── 路由视图 ───

export type ViewKey =
  | "dashboard"
  | "projects"
  | "testCenter"
  | "documentCenter"
  | "modelConfig"
  | "userManagement";

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
  version: string;
  owner: string;
  testType: TestType;
  testStatus: string;
  docStatus: string;
  status: ProjectStatus;
  description: string;
  caseCount: number;
  passRate: number;
  priority: "高" | "中" | "低";
  riskLevel: "高" | "中" | "低";
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
  projectId: string;
  module: string;
  feature: string;
  source: string;
  risk: "高" | "中" | "低";
  rule: string;
  question: string;
  confirmed: boolean;
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

export interface TestPoint {
  id: string;
  projectId: string;
  requirementId?: string;
  module: string;
  type: TestPointType;
  title: string;
  description: string;
  priority: Priority;
  automatable: boolean;
  reviewStatus: "待评审" | "已通过" | "需修改";
}

// ─── 测试用例 ───

export type ReviewStatus = "待评审" | "已通过" | "需修改";
export type AutomationFlag = "适合" | "不适合" | "待评估";

export interface TestCase {
  id: string;
  projectId: string;
  testPointId?: string;
  requirementId?: string;
  caseCode: string;
  module: string;
  feature: string;
  title: string;
  priority: Priority;
  precondition: string;
  steps: string;
  testData: string;
  expectedResult: string;
  automation: AutomationFlag;
  reviewStatus: ReviewStatus;
  remark: string;
  createdAt: string;
  updatedAt: string;
}

// ─── AI 任务 ───

export type AITaskType =
  | "需求解析"
  | "测试点生成"
  | "用例生成"
  | "用例评审";
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
