import type { Priority } from "../../../shared/types/platform";
import type { AITaskType } from "../../../shared/types/platform";

export type ProjectDetailTabKey =
  | "overview"
  | "files"
  | "requirements"
  | "testPoints"
  | "testCases"
  | "scripts"
  | "executeScripts"
  | "docFusion"
  | "summary"
  | "docGenerate"
  | "environment";

export const projectDetailTabs: { key: ProjectDetailTabKey; label: string }[] = [
  { key: "overview", label: "概览" },
  { key: "files", label: "输入资料" },
  { key: "environment", label: "环境配置" },
  { key: "requirements", label: "需求列表" },
  { key: "testPoints", label: "测试点" },
  { key: "testCases", label: "测试用例" },
  { key: "scripts", label: "自动化脚本" },
  { key: "executeScripts", label: "执行脚本" },
  { key: "docFusion", label: "数据汇总" },
  { key: "summary", label: "测试总结" },
  { key: "docGenerate", label: "文档生成" },
];

const projectDetailTabKeys = new Set<ProjectDetailTabKey>(projectDetailTabs.map((tab) => tab.key));

export const PROJECT_TAB_STORAGE_PREFIX = "aitestlink-project-tab-";

export const aiTaskTargetTabMap: Record<AITaskType, ProjectDetailTabKey> = {
  "需求解析": "requirements",
  "AI反推需求": "requirements",
  "测试点生成": "testPoints",
  "用例生成": "testCases",
  "脚本生成": "scripts",
  "执行脚本": "executeScripts",
  "文档生成": "docGenerate",
};

export function isProjectDetailTabKey(value: string | null | undefined): value is ProjectDetailTabKey {
  return Boolean(value && projectDetailTabKeys.has(value as ProjectDetailTabKey));
}

export function getProjectTabFromTask(taskType: AITaskType): ProjectDetailTabKey {
  return aiTaskTargetTabMap[taskType] ?? "overview";
}

export function getStoredProjectTab(projectId: string | null | undefined): ProjectDetailTabKey | null {
  if (!projectId) return null;
  const stored = localStorage.getItem(PROJECT_TAB_STORAGE_PREFIX + projectId);
  return isProjectDetailTabKey(stored) ? stored : null;
}

export function persistProjectTab(projectId: string | null | undefined, tab: ProjectDetailTabKey) {
  if (!projectId) return;
  localStorage.setItem(PROJECT_TAB_STORAGE_PREFIX + projectId, tab);
}

export function formatProjectTime(iso?: string): string {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function priorityTone(priority: Priority) {
  if (priority === "P0") return "red" as const;
  if (priority === "P1") return "amber" as const;
  if (priority === "P2") return "blue" as const;
  return "slate" as const;
}

export function reviewTone(status: string) {
  if (status === "已通过") return "green" as const;
  if (status === "需修改" || status === "已驳回") return "red" as const;
  return "amber" as const;
}
