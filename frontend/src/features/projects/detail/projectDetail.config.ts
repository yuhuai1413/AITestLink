import type { Priority } from "../../../shared/types/platform";

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
