import type { TestCase } from "../types/platform";

export function exportManualTestCasesToExcel(
  testCases: TestCase[],
  projectName: string
) {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const timeStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}`;
  const fileName = `${projectName}-手动测试用例-${timeStr}.xls`;

  const columns: { key: string; label: string; width: number }[] = [
    { key: "module", label: "模块", width: 80 },
    { key: "caseCode", label: "用例编号", width: 110 },
    { key: "feature", label: "测试点", width: 150 },
    { key: "title", label: "用例标题", width: 200 },
    { key: "priority", label: "优先级", width: 50 },
    { key: "testType", label: "测试类型", width: 60 },
    { key: "steps", label: "测试步骤", width: 300 },
    { key: "expectedResult", label: "预期结果", width: 240 },
    { key: "actualResult", label: "实测结果", width: 240 },
    { key: "passed", label: "是否通过", width: 55 },
    { key: "reviewStatus", label: "评审状态", width: 60 },
    { key: "automation", label: "是否自动化", width: 65 },
  ];

  const getRowData = (tc: TestCase) => {
    const matched =
      tc.actualResult &&
      tc.expectedResult &&
      tc.actualResult.trim() === tc.expectedResult.trim();
    const passed = matched ? "通过" : tc.actualResult ? "未通过" : "未执行";
    return {
      module: escapeHtml(tc.module),
      caseCode: escapeHtml(tc.caseCode),
      feature: escapeHtml(tc.feature),
      title: escapeHtml(tc.title),
      priority: escapeHtml(tc.priority),
      testType: escapeHtml(tc.testType || "功能测试"),
      steps: escapeHtml(tc.steps),
      expectedResult: escapeHtml(tc.expectedResult),
      actualResult: escapeHtml(tc.actualResult || ""),
      passed,
      reviewStatus: escapeHtml(tc.reviewStatus || "待评审"),
      automation: tc.automation === "适合" ? "是" : "否",
    };
  };

  const headerCells = columns
    .map(
      (col) =>
        `<th style="background:#4472C4;color:#fff;font-weight:600;text-align:center;vertical-align:middle;padding:6px 4px;border:1px solid #000;white-space:nowrap;font-family:inherit;">${col.label}</th>`
    )
    .join("");

  const dataRows = testCases
    .map((tc) => {
      const row = getRowData(tc);
      const cells = columns
        .map((col) => {
          let val = (row as any)[col.key];
          let cellStyle = "padding:4px;border:1px solid #000;vertical-align:top;";
          if (col.key === "steps" || col.key === "expectedResult" || col.key === "actualResult") {
            cellStyle += "word-wrap:break-word;word-break:break-all;white-space:pre-wrap;";
          }
          return `<td style="${cellStyle}">${val || "-"}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  const totalWidth = columns.reduce((s, c) => s + c.width, 0);

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${projectName} - 手动测试用例</title>
<style>
  @page { size: landscape; margin: 10mm; }
  table { border-collapse: collapse; font-family: "宋体", "Times New Roman", serif; }
</style>
</head>
<body>
<table>
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

function escapeHtml(s: string | null | undefined): string {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "<br>");
}
