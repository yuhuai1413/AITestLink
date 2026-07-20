import { useRef, useState } from "react";
import { FileUp } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "../../../app/store";
import { testCasesApi } from "../../../api/client";
import { useProjectData } from "../useProjectData";
import { useUnsavedChanges } from "../../../shared/hooks/useUnsavedChanges";
import { DataTable } from "../../../shared/components/DataTable";
import { SectionHeader } from "../../../shared/components/SectionHeader";
import { StatusPill } from "../../../shared/components/StatusPill";
import { Modal } from "../../../shared/components/Modal";
import { formatTestStepsForDisplay } from "../../../shared/utils/formatTestSteps";
import { formatProjectTime as formatTime, priorityTone, reviewTone } from "./projectDetail.config";
import { validityTone } from "../../../shared/utils/statusTone";

// ═══════════════════════════════════════
// 数据融合（上传手动结果 + 合并展示）
// ═══════════════════════════════════════

export function DocFusionTab({ projectId }: { projectId: string }) {
  const { dispatch } = useStore();
  const { testCases, scripts } = useProjectData(projectId);
  const [manualResults, setManualResults] = useState<Record<string, string>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const [viewCase, setViewCase] = useState<typeof testCases[0] | null>(null);
  const [editCase, setEditCase] = useState<typeof testCases[0] | null>(null);
  const [editActual, setEditActual] = useState("");
  const execDirty = useUnsavedChanges("实测结果");

  const handleUploadManual = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const XLSX = await import("xlsx");
      let rows: Record<string, string>[] = [];

      if (file.name.endsWith(".csv")) {
        const text = await file.text();
        const workbook = XLSX.read(text, { type: "string" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet);
      } else {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet);
      }

      if (rows.length === 0) {
        toast.warning("文件中未找到数据");
        return;
      }

      const headers = Object.keys(rows[0]);
      const caseCodeCol = headers.find((h) => /用例编号|编号|caseCode|case_code/i.test(h));
      const resultCol = headers.find((h) => /实测结果|结果|actualResult|actual_result|是否通过|passed/i.test(h));

      if (!caseCodeCol || !resultCol) {
        toast.error("未找到匹配的列，需要包含「用例编号」和「实测结果」列");
        return;
      }

      const results: Record<string, string> = {};
      rows.forEach((row) => {
        const code = String(row[caseCodeCol] || "").trim();
        const result = String(row[resultCol] || "").trim();
        if (code && result) results[code] = result;
      });

      setManualResults(results);
      toast.success(`已导入 ${Object.keys(results).length} 条测试结果`);
    } catch (err) {
      toast.error("文件解析失败: " + (err instanceof Error ? err.message : "未知错误"));
    }

    if (inputRef.current) inputRef.current.value = "";
  };

  const handleSaveEdit = async () => {
    if (!editCase) return;
    try {
      const updated = await testCasesApi.update(editCase.id, { actualResult: editActual } as any);
      dispatch({ type: "UPDATE_TEST_CASE", payload: { ...editCase, actualResult: updated.actualResult, createdAt: updated.createdAt, updatedAt: updated.updatedAt } });
      toast.success("保存成功");
      execDirty.markClean();
      setEditCase(null);
    } catch { toast.error("保存失败"); }
  };

  const getScriptTime = (tc: typeof testCases[0]) => {
    const script = scripts.find((s) => s.testCaseId === tc.id);
    return script ? formatTime(script.updatedAt) : "-";
  };

  return (
    <div className="page-stack page-stack--spaced page-stack--fill">
      <SectionHeader title="手动 + 自动化结果合并" description="上传手动测试结果文档，与自动化测试数据按用例编号合并展示。" meta={<>共 <strong>{testCases.length}</strong> 条用例</>}
        actions={<>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: "none" }} onChange={handleUploadManual} />
              <button className="primary-button" type="button" onClick={() => inputRef.current?.click()}><FileUp size={13} /> 上传手动测试结果</button>
            </div>
          </div>
        </>} />
      <section className="work-panel">
        {testCases.length === 0 ? <div className="empty-state"><p>暂无测试用例数据</p></div> : (
          <DataTable rows={testCases} getRowKey={(r) => r.id} columns={[
            { key: "module", label: "模块", render: (r) => r.module },
            { key: "caseCode", label: "用例编号", render: (r) => r.caseCode },
            { key: "feature", label: "测试点", align: "left", lineClamp: 2, render: (r) => <span title={r.feature}>{r.feature}</span> },
            { key: "title", label: "用例标题", align: "left", lineClamp: 2, render: (r) => <span title={r.title}>{r.title}</span> },
            { key: "priority", label: "优先级", align: "center", render: (r) => <StatusPill tone={priorityTone(r.priority)}>{r.priority}</StatusPill> },
            { key: "testType", label: "测试类型", align: "center", render: (r) => r.testType || "功能测试" },
            { key: "steps", label: "测试步骤", align: "left", lineClamp: 2, render: (r) => <span className="test-steps-preview" title={r.steps}>{formatTestStepsForDisplay(r.steps)}</span> },
            { key: "expectedResult", label: "预期结果", align: "left", lineClamp: 2, render: (r) => <span title={r.expectedResult}>{r.expectedResult}</span> },
            { key: "actualResult", label: "实测结果", align: "left", lineClamp: 2, render: (r) => {
              const display = r.actualResult || manualResults[r.caseCode] || "-";
              return <span style={{ fontSize: 12 }}>{display}</span>;
            }},
            { key: "passed", label: "是否通过", align: "center", render: (r) => {
              const actual = r.actualResult || manualResults[r.caseCode] || "";
              const matched = actual && r.expectedResult && actual.trim() === r.expectedResult.trim();
              return matched ? <StatusPill tone="green">通过</StatusPill> : actual ? <StatusPill tone="red">未通过</StatusPill> : <StatusPill tone="slate">未执行</StatusPill>;
            }},
            { key: "reviewStatus", label: "评审状态", align: "center", render: (r) => <StatusPill tone={r.reviewStatus === "已通过" ? "green" : "slate"}>{r.reviewStatus || "待评审"}</StatusPill> },
            { key: "validityStatus", label: "数据状态", align: "center", render: (r) => <span title={r.invalidReason || ""}><StatusPill tone={validityTone(r.validityStatus)}>{r.validityStatus || "有效"}</StatusPill></span> },
            { key: "automation", label: "是否自动化", align: "center", render: (r) => r.automation === "是" ? "是" : "否" },
            { key: "testTime", label: "测试时间", render: (r) => <span>{getScriptTime(r)}</span> },
            { key: "actions", label: "操作", width: "100px", sticky: "right" as const, align: "center", render: (r) => (
              <div className="inline-actions">
                <button className="text-button" type="button" onClick={() => setViewCase(r)}>查看</button>
                <button className="text-button" type="button" onClick={() => { setEditCase(r); setEditActual(r.actualResult || ""); }}>编辑</button>
              </div>
            ) },
          ]} />
        )}
      </section>

      {/* 查看弹窗 - 字段与表格一致 */}
      <Modal open={!!viewCase} onClose={() => setViewCase(null)} title="用例详情" width={640}>
        {viewCase && (() => {
          const viewActual = viewCase.actualResult || manualResults[viewCase.caseCode] || "";
          const matched = viewActual && viewCase.expectedResult && viewActual.trim() === viewCase.expectedResult.trim();
          return (
            <div className="detail-grid">
              <div className="detail-row"><span className="detail-label">模块</span><span>{viewCase.module}</span></div>
              <div className="detail-row"><span className="detail-label">用例编号</span><span>{viewCase.caseCode}</span></div>
              <div className="detail-row detail-row--full"><span className="detail-label">测试点</span><span>{viewCase.feature}</span></div>
              <div className="detail-row detail-row--full"><span className="detail-label">用例标题</span><span>{viewCase.title}</span></div>
              <div className="detail-row"><span className="detail-label">优先级</span><StatusPill tone={priorityTone(viewCase.priority)}>{viewCase.priority}</StatusPill></div>
              <div className="detail-row"><span className="detail-label">测试类型</span><span>{viewCase.testType || "功能测试"}</span></div>
              <div className="detail-row detail-row--full"><span className="detail-label">测试步骤</span><pre className="detail-pre">{viewCase.steps || "-"}</pre></div>
              <div className="detail-row detail-row--full"><span className="detail-label">预期结果</span><pre className="detail-pre">{viewCase.expectedResult || "-"}</pre></div>
              <div className="detail-row detail-row--full"><span className="detail-label">实测结果</span><pre className="detail-pre">{viewActual || "-"}</pre></div>
              <div className="detail-row"><span className="detail-label">是否通过</span>{matched ? <StatusPill tone="green">通过</StatusPill> : viewActual ? <StatusPill tone="red">未通过</StatusPill> : <StatusPill tone="slate">未执行</StatusPill>}</div>
              <div className="detail-row"><span className="detail-label">数据状态</span><span title={viewCase.invalidReason || ""}><StatusPill tone={validityTone(viewCase.validityStatus)}>{viewCase.validityStatus || "有效"}</StatusPill></span></div>
              <div className="detail-row"><span className="detail-label">是否自动化</span><span>{viewCase.automation === "是" ? "是" : "否"}</span></div>
              <div className="detail-row"><span className="detail-label">测试时间</span><span>{getScriptTime(viewCase)}</span></div>
            </div>
          );
        })()}
      </Modal>

      {/* 编辑弹窗 - 只能编辑实测结果，是否通过自动计算 */}
      <Modal open={!!editCase} onClose={() => execDirty.requestClose(() => setEditCase(null))} title="编辑实测结果" width={640}
        footer={<>
          <button className="ghost-button" type="button" onClick={() => execDirty.requestClose(() => setEditCase(null))}>取消</button>
          <button className="primary-button" type="button" onClick={handleSaveEdit}>保存</button>
        </>}
      >
        {editCase && (
          <div className="detail-grid">
            <div className="detail-row"><span className="detail-label">模块</span><span>{editCase.module}</span></div>
            <div className="detail-row"><span className="detail-label">用例编号</span><span>{editCase.caseCode}</span></div>
            <div className="detail-row detail-row--full"><span className="detail-label">测试点</span><span>{editCase.feature}</span></div>
            <div className="detail-row detail-row--full"><span className="detail-label">用例标题</span><span>{editCase.title}</span></div>
            <div className="detail-row"><span className="detail-label">优先级</span><StatusPill tone={priorityTone(editCase.priority)}>{editCase.priority}</StatusPill></div>
            <div className="detail-row"><span className="detail-label">测试类型</span><span>{editCase.testType || "功能测试"}</span></div>
            <div className="detail-row detail-row--full"><span className="detail-label">测试步骤</span><span>{editCase.steps || "-"}</span></div>
            <div className="detail-row detail-row--full"><span className="detail-label">预期结果</span><span>{editCase.expectedResult || "-"}</span></div>
            <div className="detail-row detail-row--full"><span className="detail-label">实测结果</span><textarea className="form-textarea" style={{ flex: 1 }} rows={5} value={editActual} onChange={(e) => { setEditActual(e.target.value); execDirty.markDirty(); }} placeholder="输入实际测试结果" /></div>
            <div className="detail-row"><span className="detail-label">是否通过</span><StatusPill tone={editActual && editCase.expectedResult && editActual.trim() === editCase.expectedResult.trim() ? "green" : editActual ? "red" : "slate"}>{editActual && editCase.expectedResult && editActual.trim() === editCase.expectedResult.trim() ? "通过" : editActual ? "未通过" : "未执行"}</StatusPill></div>
            <div className="detail-row"><span className="detail-label">数据状态</span><span title={editCase.invalidReason || ""}><StatusPill tone={validityTone(editCase.validityStatus)}>{editCase.validityStatus || "有效"}</StatusPill></span></div>
            <div className="detail-row"><span className="detail-label">是否自动化</span><span>{editCase.automation === "是" ? "是" : "否"}</span></div>
            <div className="detail-row"><span className="detail-label">测试时间</span><span>{getScriptTime(editCase)}</span></div>

          </div>
        )}
      </Modal>
      {execDirty.confirmDialog}
    </div>
  );
}
