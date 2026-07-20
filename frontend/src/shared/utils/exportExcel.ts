import type { TestCase } from "../types/platform";
import { formatTimestampForFileName } from "./dateTime";
import { formatTestStepsForDisplay } from "./formatTestSteps";

export function exportManualTestCasesToExcel(
  testCases: TestCase[],
  projectName = "全部项目",
  type: "manual" | "all" = "manual"
) {
  const now = new Date();
  const timeStr = formatTimestampForFileName(now);
  const fileName = type === "all"
    ? `${projectName}-全部测试用例-${timeStr}.xls`
    : `${projectName}-手动测试用例-${timeStr}.xls`;

  const columns: { key: string; label: string; width: number; align?: "left" | "center" }[] = [
    { key: "index", label: "序号", width: 46, align: "center" },
    { key: "caseCode", label: "用例编号", width: 118, align: "center" },
    { key: "module", label: "模块", width: 104 },
    { key: "feature", label: "测试点", width: 180 },
    { key: "title", label: "用例标题", width: 220 },
    { key: "priority", label: "优先级", width: 58, align: "center" },
    { key: "testType", label: "测试类型", width: 82, align: "center" },
    { key: "targetPlatform", label: "测试端", width: 66, align: "center" },
    { key: "testUrl", label: "测试地址", width: 220 },
    { key: "requiredRole", label: "所需角色", width: 92, align: "center" },
    { key: "steps", label: "测试步骤", width: 340 },
    { key: "expectedResult", label: "预期结果", width: 270 },
    { key: "actualResult", label: "实测结果", width: 230 },
    { key: "passed", label: "执行结果", width: 72, align: "center" },
    { key: "reviewStatus", label: "评审状态", width: 78, align: "center" },
    { key: "automation", label: "自动化", width: 68, align: "center" },
  ];

  const getRowData = (tc: TestCase, index: number) => {
    const matched =
      tc.actualResult &&
      tc.expectedResult &&
      tc.actualResult.trim() === tc.expectedResult.trim();
    const passed = matched ? "通过" : tc.actualResult ? "未通过" : "未执行";
    return {
      index: String(index + 1),
      module: escapeHtml(tc.module),
      caseCode: escapeHtml(tc.caseCode),
      feature: escapeHtml(tc.feature),
      title: escapeHtml(tc.title),
      priority: escapeHtml(tc.priority),
      testType: escapeHtml(tc.testType || "功能测试"),
      targetPlatform: escapeHtml(tc.targetPlatform || "PC"),
      testUrl: escapeHtml(tc.testUrl || "未配置"),
      requiredRole: escapeHtml(tc.requiredRole || "无"),
      steps: escapeHtml(formatTestStepsForDisplay(tc.steps)),
      expectedResult: escapeHtml(tc.expectedResult),
      actualResult: escapeHtml(tc.actualResult || ""),
      passed,
      reviewStatus: escapeHtml(tc.reviewStatus || "待评审"),
      automation: tc.automation === "是" ? "是" : "否",
    };
  };

  const headerCells = columns
    .map(
      (col) =>
        `<th class="table-head" style="width:${col.width}px;">${col.label}</th>`
    )
    .join("");

  const summary = buildExportSummary(testCases);
  const totalWidth = columns.reduce((s, c) => s + c.width, 0);

  const dataRows = testCases
    .map((tc, index) => {
      const row = getRowData(tc, index);
      const cells = columns
        .map((col) => {
          let val = (row as any)[col.key];
          const text = val || "-";
          const align = col.align || "left";
          const semanticClass = getSemanticClass();
          return `<td class="cell cell-${align} ${semanticClass}" style="width:${col.width}px;"><div>${text}</div></td>`;
        })
        .join("");
      return `<tr class="${index % 2 === 1 ? "row-alt" : ""}">${cells}</tr>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(projectName)} - 测试用例</title>
<style>
  @page { size: landscape; margin: 10mm; }
  body {
    margin: 0;
    color: #0f172a;
    background: #ffffff;
    font-family: "Microsoft YaHei", "微软雅黑", "PingFang SC", "宋体", Arial, sans-serif;
  }
  table {
    width: ${totalWidth}px;
    table-layout: fixed;
    border-collapse: collapse;
    mso-table-lspace: 0;
    mso-table-rspace: 0;
  }
  .title-row td {
    height: 42px;
    padding: 12px 16px;
    color: #1f2937;
    background: #ffffff;
    font-size: 20px;
    font-weight: 700;
    border: 1px solid #d9d9d9;
  }
  .meta-row td {
    height: 30px;
    padding: 7px 12px;
    color: #475569;
    background: #f8fafc;
    border-left: 1px solid #dbe3ef;
    border-right: 1px solid #dbe3ef;
    border-bottom: 1px solid #e2e8f0;
    font-size: 12px;
  }
  .summary-label {
    color: #64748b;
    font-weight: 600;
  }
  .summary-value {
    color: #1f2937;
    font-weight: 700;
  }
  .spacer td {
    height: 8px;
    border: 0;
    background: #ffffff;
  }
  .table-head {
    height: 34px;
    padding: 8px 6px;
    color: #1f2937;
    background: #e7e6e6;
    border: 1px solid #d9d9d9;
    font-size: 12px;
    font-weight: 700;
    text-align: center;
    vertical-align: middle;
    white-space: nowrap;
  }
  .cell {
    padding: 7px 8px;
    color: #0f172a;
    background: #ffffff;
    border: 1px solid #dbe3ef;
    font-size: 12px;
    line-height: 1.45;
    vertical-align: top;
    mso-border-alt: solid #dbe3ef 0.5pt;
  }
  .row-alt .cell {
    background: #fbfdff;
  }
  .cell div {
    width: 100%;
    white-space: normal;
    word-wrap: break-word;
    overflow-wrap: break-word;
    mso-style-name: "Normal";
  }
  .cell-center {
    text-align: center;
    vertical-align: middle;
  }
  .cell-left {
    text-align: left;
  }
</style>
</head>
<body>
<table>
  <colgroup>
    ${columns.map((col) => `<col style="width:${col.width}px;" />`).join("")}
  </colgroup>
  <tr class="title-row">
    <td colspan="${columns.length}">${escapeHtml(projectName)} - ${type === "all" ? "全部测试用例" : "手动测试用例"}</td>
  </tr>
  <tr class="meta-row">
    <td colspan="${columns.length}">
      <span class="summary-label">导出时间：</span>${formatDateTime(now)}
      &nbsp;&nbsp;&nbsp;&nbsp;<span class="summary-label">用例总数：</span><span class="summary-value">${testCases.length}</span>
      &nbsp;&nbsp;&nbsp;&nbsp;<span class="summary-label">P0/P1：</span><span class="summary-value">${summary.highPriority}</span>
      &nbsp;&nbsp;&nbsp;&nbsp;<span class="summary-label">已评审：</span><span class="summary-value">${summary.reviewed}</span>
      &nbsp;&nbsp;&nbsp;&nbsp;<span class="summary-label">自动化：</span><span class="summary-value">${summary.automated}</span>
    </td>
  </tr>
  <tr class="spacer"><td colspan="${columns.length}"></td></tr>
  <thead>
    <tr>${headerCells}</tr>
  </thead>
  <tbody>
    ${dataRows}
  </tbody>
</table>
</body>
</html>`;

  const blob = new Blob(["\ufeff" + html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

function buildExportSummary(testCases: TestCase[]) {
  return {
    highPriority: testCases.filter((tc) => tc.priority === "P0" || tc.priority === "P1").length,
    reviewed: testCases.filter((tc) => tc.reviewStatus === "已通过").length,
    automated: testCases.filter((tc) => tc.automation === "是").length,
  };
}

function getSemanticClass(): string {
  return "";
}

function formatDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function escapeHtml(s: string | null | undefined): string {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "<br>");
}
