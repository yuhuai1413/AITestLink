import {
  Bot,
  Bug,
  ClipboardCheck,
  FileSearch,
  FolderOpen,
  Gauge,
  LayoutDashboard,
  ListChecks,
  PlayCircle,
  Settings,
  Users,
} from "lucide-react";
import type {
  AgentCapability,
  Metric,
  NavigationItem,
  RoadmapPhase,
} from "../types/platform";

export const navigationItems: NavigationItem[] = [
  {
    key: "dashboard",
    label: "首页驾驶舱",
    description: "质量状态、风险和待办",
    icon: LayoutDashboard,
  },
  {
    key: "projects",
    label: "项目空间",
    description: "测试项目与版本管理",
    icon: FolderOpen,
  },
  {
    key: "testCenter",
    label: "测试中心",
    description: "需求、测试设计、用例执行、自动化脚本、缺陷",
    icon: ListChecks,
  },
  {
    key: "documentCenter",
    label: "文档中心",
    description: "文档上传与管理",
    icon: FileSearch,
  },
  {
    key: "modelConfig",
    label: "模型配置",
    description: "AI 模型和 API 设置",
    icon: Settings,
  },
  {
    key: "userManagement",
    label: "用户管理",
    description: "系统用户与权限",
    icon: Users,
  },
];

export const dashboardMetrics: Metric[] = [
  { label: "AI 解析需求", value: "128", trend: "较上周 +18", tone: "blue" },
  { label: "测试用例", value: "1,426", trend: "P0 用例 214 条", tone: "green" },
  { label: "自动化覆盖", value: "42%", trend: "目标 60%", tone: "amber" },
  { label: "阻塞缺陷", value: "7", trend: "需今日处理", tone: "red" },
];

export const agentCapabilities: AgentCapability[] = [
  {
    name: "需求解析 Agent",
    input: "PRD、FS、原型、接口文档",
    output: "需求解析表、待确认问题",
    status: "MVP",
  },
  {
    name: "测试设计 Agent",
    input: "需求解析表、业务规则",
    output: "测试点、测试用例、测试数据建议",
    status: "MVP",
  },
  {
    name: "用例评审 Agent",
    input: "测试用例、需求解析表",
    output: "遗漏场景、重复用例、不可执行步骤",
    status: "MVP",
  },
  {
    name: "自动化 Agent",
    input: "测试用例、页面信息、接口文档",
    output: "Playwright/pytest 脚本",
    status: "后续",
  },
  {
    name: "执行分析 Agent",
    input: "日志、截图、trace、接口响应",
    output: "失败原因分类和处理建议",
    status: "后续",
  },
  {
    name: "缺陷生成 Agent",
    input: "失败用例、实际结果、证据附件",
    output: "标准缺陷单",
    status: "已规划",
  },
];

export const roadmap: RoadmapPhase[] = [
  {
    phase: "MVP 1",
    goal: "建立 AI 测试设计入口",
    capabilities: "文档上传、需求解析、测试点生成、用例生成、Excel 导出",
    status: "当前",
  },
  {
    phase: "MVP 2",
    goal: "建立测试执行闭环",
    capabilities: "用例执行、缺陷生成、执行统计、测试报告",
    status: "下一步",
  },
  {
    phase: "MVP 3",
    goal: "建立自动化能力",
    capabilities: "Playwright 脚本生成、API 自动化、任务执行、失败分析",
    status: "规划",
  },
  {
    phase: "MVP 4",
    goal: "建立智能质量分析",
    capabilities: "失败归因、日志分析、回归推荐、质量风险预测",
    status: "规划",
  },
];

export const qualityWarnings = [
  {
    icon: Bug,
    title: "需求解析模块风险偏高",
    detail: "文件类型多、解析失败分支多，建议优先补充异常文件和权限场景。",
  },
  {
    icon: Bot,
    title: "AI 输出必须保留评审节点",
    detail: "用例进入正式库前需要人工确认，避免把不确定需求写成事实。",
  },
];
