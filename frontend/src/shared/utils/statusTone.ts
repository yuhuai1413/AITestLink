import type { StatusTone } from "../components/StatusPill";

export function priorityTone(priority?: string | null): StatusTone {
  if (priority === "P0" || priority === "高") return "red";
  if (priority === "P1" || priority === "中") return "amber";
  if (priority === "P2" || priority === "低") return "blue";
  return "slate";
}

export function riskTone(risk?: string | null): StatusTone {
  if (risk === "高") return "red";
  if (risk === "中") return "amber";
  if (risk === "低") return "green";
  return "slate";
}

export function reviewTone(status?: string | null): StatusTone {
  if (status === "已通过") return "green";
  if (status === "需修改" || status === "已驳回" || status === "不通过") return "red";
  if (status === "待评审" || !status) return "amber";
  return "slate";
}

export function validityTone(status?: string | null): StatusTone {
  return status === "已失效" ? "amber" : "green";
}

export function parseStatusTone(status?: string | null): StatusTone {
  if (status === "已完成" || status === "已解析") return "green";
  if (status === "解析中" || status === "生成中") return "blue";
  if (status === "失败" || status === "解析失败" || status === "文件不存在") return "red";
  if (status === "数据不足") return "amber";
  return "slate";
}

export function projectTestStatusTone(status?: string | null): StatusTone {
  if (status === "已测试") return "green";
  if (status === "测试中") return "blue";
  return "amber";
}

export function projectDocStatusTone(status?: string | null): StatusTone {
  if (status === "已完成") return "green";
  if (status === "生成中" || status === "解析中") return "blue";
  return "amber";
}

export function yesNoTone(value?: string | boolean | null): StatusTone {
  return value === true || value === "是" ? "green" : "slate";
}

export function passFailTone(value?: string | boolean | null): StatusTone {
  if (value === true || value === "通过" || value === "已测试") return "green";
  if (value === false || value === "失败" || value === "未通过") return "red";
  if (value === "测试中" || value === "执行中") return "blue";
  return "slate";
}
