import * as XLSX from "xlsx";
import type { TestCase } from "../types/platform";

/** 将测试用例导出为 Excel 文件并触发下载 */
export function exportTestCasesToExcel(testCases: TestCase[]) {
  const headers = [
    "用例编号",
    "所属模块",
    "功能点",
    "用例标题",
    "优先级",
    "前置条件",
    "测试步骤",
    "测试数据",
    "预期结果",
    "自动化标识",
    "需求来源",
    "评审状态",
    "备注",
  ];

  const data = testCases.map((tc) => [
    tc.caseCode,
    tc.module,
    tc.feature,
    tc.title,
    tc.priority,
    tc.precondition,
    tc.steps,
    tc.testData,
    tc.expectedResult,
    tc.automation,
    tc.requirementId || "",
    tc.reviewStatus,
    tc.remark,
  ]);

  const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);

  // 设置列宽
  ws["!cols"] = [
    { wch: 16 }, // 用例编号
    { wch: 14 }, // 所属模块
    { wch: 14 }, // 功能点
    { wch: 40 }, // 用例标题
    { wch: 8 },  // 优先级
    { wch: 30 }, // 前置条件
    { wch: 50 }, // 测试步骤
    { wch: 25 }, // 测试数据
    { wch: 40 }, // 预期结果
    { wch: 10 }, // 自动化标识
    { wch: 14 }, // 需求来源
    { wch: 10 }, // 评审状态
    { wch: 20 }, // 备注
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "测试用例");
  XLSX.writeFile(wb, `测试用例_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
