import { useMemo, useState } from "react";
import { CheckCircle2, Download, Loader2, WandSparkles } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "../../../app/store";
import { testCasesApi } from "../../../api/client";
import { useProjectData } from "../useProjectData";
import { useConfigError } from "../../../shared/hooks/useConfigError";
import { startGenerateTestCases } from "../../../shared/hooks/aiTaskManager";
import { useUnsavedChanges } from "../../../shared/hooks/useUnsavedChanges";
import { DataTable } from "../../../shared/components/DataTable";
import { SectionHeader } from "../../../shared/components/SectionHeader";
import { StatusPill } from "../../../shared/components/StatusPill";
import { ConfirmDialog } from "../../../shared/components/ConfirmDialog";
import { Modal } from "../../../shared/components/Modal";
import { TestCaseDetailModal } from "../../test-design/TestCaseDetailModal";
import { exportManualTestCasesToExcel } from "../../../shared/utils/exportExcel";
import type { Priority, TestCase } from "../../../shared/types/platform";
import { formatProjectTime as formatTime, priorityTone, reviewTone } from "./projectDetail.config";

const truncateText = (text: string, maxLen = 50) => text.length > maxLen ? text.slice(0, maxLen) + "..." : text;

// ═══════════════════════════════════════
// 测试用例（AI 生成 + 评审）
// ═══════════════════════════════════════

export function TestCasesTab({ projectId }: { projectId: string }) {
  const { project, testCases, testPoints, refresh, refreshTestCases, refreshTestPoints, loading, initialLoading } = useProjectData(projectId);
  const { state, dispatch } = useStore();
  const generating = useMemo(() => state.activeAITasks.includes(`${projectId}:用例生成`), [state.activeAITasks, projectId]);
  const { showConfigError, dialog: configErrorDialog } = useConfigError();
  const [isStreaming, setIsStreaming] = useState(false);
  const [isReceiving, setIsReceiving] = useState(false);
  const [streamCount, setStreamCount] = useState(0);
  const [detailCase, setDetailCase] = useState<TestCase | null>(null);
  const [editCase, setEditCase] = useState<TestCase | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editSteps, setEditSteps] = useState("");
  const [editExpected, setEditExpected] = useState("");
  const tcDirty = useUnsavedChanges("用例");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showGenerateConfirm, setShowGenerateConfirm] = useState(false);
  const [showBatchApproveConfirm, setShowBatchApproveConfirm] = useState(false);

  const hasPrerequisite = testPoints.length > 0;
  const unreviewedTPCount = testPoints.filter((tp) => tp.reviewStatus !== "已通过").length;

  const handleGenerate = async () => {
    if (!hasPrerequisite) { toast.warning("请先生成测试点"); return; }
    if (unreviewedTPCount > 0) { toast.warning(`还有 ${unreviewedTPCount} 个测试点未评审通过，请先完成测试点评审`); return; }
    if (testCases.length > 0 && !showGenerateConfirm) { setShowGenerateConfirm(true); return; }
    setShowGenerateConfirm(false);
    await startGenerateTestCases(projectId);
    await refreshTestCases();
  };
  const modules = useMemo(() => Array.from(new Set(testCases.map((tc) => tc.module))), [testCases]);
  const filtered = useMemo(() => moduleFilter === "all" ? testCases : testCases.filter((tc) => tc.module === moduleFilter), [testCases, moduleFilter]);
  const allSelected = filtered.length > 0 && filtered.every((tc) => selectedIds.has(tc.id));
  const toggleSelectAll = () => setSelectedIds(allSelected ? new Set() : new Set(filtered.map((tc) => tc.id)));
  const toggleSelect = (id: string) => setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleReview = async (tc: any) => {
    const newStatus = tc.reviewStatus === "已通过" ? "待评审" : "已通过";
    try { await testCasesApi.update(tc.id, { reviewStatus: newStatus } as any); } catch {}
    dispatch({ type: "UPDATE_TEST_CASE", payload: { ...tc, reviewStatus: newStatus } });
    await refreshTestCases();
  };
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);
  const batchDelete = async () => {
    for (const id of selectedIds) { try { await testCasesApi.delete(id); } catch {} }
    selectedIds.forEach((id) => dispatch({ type: "DELETE_TEST_CASE", payload: id }));
    toast.success(`已删除 ${selectedIds.size} 条用例`);
    setSelectedIds(new Set());
    await refreshTestCases();
  };
  const batchApprove = async () => {
    for (const id of selectedIds) {
      const tc = testCases.find((c) => c.id === id);
      if (tc && tc.reviewStatus !== "已通过") {
        try { await testCasesApi.update(tc.id, { reviewStatus: "已通过" } as any); } catch {}
        dispatch({ type: "UPDATE_TEST_CASE", payload: { ...tc, reviewStatus: "已通过" } });
      }
    }
    toast.success(`已通过 ${selectedIds.size} 条用例`);
    setSelectedIds(new Set());
    await refreshTestCases();
  };

  const handleSaveEdit = async () => {
    if (!editCase) return;
    try {
      const updatedTC = await testCasesApi.update(editCase.id, { title: editTitle, steps: editSteps, expectedResult: editExpected } as any);
      dispatch({ type: "UPDATE_TEST_CASE", payload: { ...editCase, title: editTitle, steps: editSteps, expectedResult: editExpected, createdAt: updatedTC.createdAt, updatedAt: updatedTC.updatedAt } });
      toast.success("保存成功");
      tcDirty.markClean();
      setEditCase(null);
    } catch {
      toast.error("保存失败");
    }
  };

  const handleExportAll = () => {
    if (testCases.length === 0) { toast.warning("暂无测试用例，请先生成用例"); return; }
    exportManualTestCasesToExcel(testCases, project?.name || "未命名项目", "all");
    toast.success(`已导出 ${testCases.length} 条测试用例`);
  };

  const handleExportManual = () => {
    if (testCases.length === 0) { toast.warning("暂无测试用例，请先生成用例"); return; }
    const manualCases = testCases.filter((tc) => tc.automation !== "是");
    if (manualCases.length === 0) { toast.warning("所有用例均标记为自动化，暂无可导出的手动用例"); return; }
    exportManualTestCasesToExcel(manualCases, project?.name || "未命名项目", "manual");
    toast.success(`已导出 ${manualCases.length} 条手动测试用例`);
  };

  return (
    <div className="page-stack page-stack--spaced page-stack--fill">
      <SectionHeader title="用例生成" description="从测试点生成可执行用例，AI 在生成时自动进行质量自检。"
        actions={<>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
            <div style={{ display: "flex", gap: 8 }}>
              {selectedIds.size > 0 && <button className="ghost-button" type="button" disabled={generating} onClick={() => setShowBatchApproveConfirm(true)}><CheckCircle2 size={13} /> 评审通过（{selectedIds.size}）</button>}
              <button className="ghost-button" type="button" onClick={handleExportAll} disabled={generating}><Download size={13} /> 导出所有用例</button>
              <button className="ghost-button" type="button" onClick={handleExportManual} disabled={generating}><Download size={13} /> 导出手动用例</button>
              <button className="primary-button" type="button" onClick={handleGenerate} disabled={generating}>{generating ? <><Loader2 size={13} className="animate-spin" /> 生成中...</> : <><WandSparkles size={13} /> 生成用例</>}</button>
            </div>
            <span style={{ color: "var(--muted)", fontSize: 12 }}>共 <strong style={{ color: "var(--text)" }}>{testCases.length}</strong> 条用例</span>
          </div>
        </>} />
      {modules.length > 0 && <div className="filter-bar"><span className="filter-label">模块筛选</span><select className="filter-select" value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)}><option value="all">全部模块</option>{modules.map((m) => <option key={m} value={m}>{m}</option>)}</select></div>}
      <section className="work-panel">
        {initialLoading && filtered.length === 0 ? <div className="empty-state"><Loader2 size={20} className="animate-spin" style={{ color: "var(--muted)" }} /><p style={{ marginTop: 8, color: "var(--muted)" }}>加载中...</p></div> : filtered.length === 0 ? <div className="empty-state"><p>暂无测试用例</p></div> : (
          <DataTable rows={filtered} getRowKey={(r) => r.id} columns={[
            { key: "select", label: <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />, width: "40px", sticky: "left" as const, render: (r) => <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleSelect(r.id)} /> },
            { key: "caseCode", label: "用例编号", render: (r) => r.caseCode },
            { key: "module", label: "模块", render: (r) => r.module },
            { key: "testType", label: "测试类型", render: (r) => r.testType || "功能测试" },
            { key: "feature", label: "测试点", align: "left", render: (r) => <span title={r.feature}>{truncateText(r.feature, 25)}</span> },
            { key: "title", label: "用例标题", align: "left", render: (r) => <span title={r.title}>{truncateText(r.title, 30)}</span> },
            { key: "targetPlatform", label: "测试端", width: "72px", align: "center", render: (r) => r.targetPlatform || "PC" },
            { key: "testUrl", label: "测试地址", align: "left", render: (r) => <span title={r.testUrl}>{truncateText(r.testUrl || "未配置", 28)}</span> },
            { key: "requiredRole", label: "角色", width: "100px", align: "center", render: (r) => r.requiredRole || "无" },
            { key: "priority", label: "优先级", align: "center", render: (r) => <StatusPill tone={priorityTone(r.priority)}>{r.priority}</StatusPill> },
            { key: "steps", label: "测试步骤", align: "left", render: (r) => <span title={r.steps}>{truncateText(r.steps, 40)}</span> },
            { key: "expectedResult", label: "预期结果", align: "left", render: (r) => <span title={r.expectedResult}>{truncateText(r.expectedResult, 35)}</span> },
            { key: "reviewStatus", label: "评审", align: "center", render: (r) => <button type="button" className="text-button" onClick={() => toggleReview(r)}><StatusPill tone={reviewTone(r.reviewStatus)}>{r.reviewStatus}</StatusPill></button> },
            { key: "automation", label: "是否自动化", align: "center", render: (r) => <StatusPill tone={r.automation === "是" ? "green" : "slate"}>{r.automation === "是" ? "是" : "否"}</StatusPill> },
            { key: "createdAt", label: "生成时间", render: (r) => formatTime(r.createdAt) },
            { key: "updatedAt", label: "更新时间", render: (r) => formatTime(r.updatedAt) },
            { key: "actions", label: "操作", width: "120px", sticky: "right" as const, align: "center", render: (r) => (
              <div className="inline-actions">
                <button className="text-button" type="button" onClick={() => setDetailCase(r)}>查看</button>
                <button className="text-button" type="button" onClick={() => { setEditCase(r); setEditTitle(r.title); setEditSteps(r.steps); setEditExpected(r.expectedResult); }}>编辑</button>

              </div>
            )},
          ]} />
        )}
      </section>
      <TestCaseDetailModal open={!!detailCase} testCase={detailCase} onClose={() => setDetailCase(null)} />

      {/* 编辑用例弹窗 */}
      <Modal open={!!editCase} onClose={() => tcDirty.requestClose(() => setEditCase(null))} title="编辑用例" width={640}
        footer={<>
          <button className="ghost-button" type="button" onClick={() => tcDirty.requestClose(() => setEditCase(null))}>取消</button>
          <button className="primary-button" type="button" onClick={handleSaveEdit}>保存</button>
        </>}
      >
        {editCase && (
          <div className="detail-grid">
            <div className="detail-row"><span className="detail-label">用例编号</span><span>{editCase.caseCode}</span></div>
            <div className="detail-row"><span className="detail-label">模块</span><span>{editCase.module}</span></div>
            <div className="detail-row detail-row--full"><span className="detail-label">测试点</span><span>{editCase.feature}</span></div>
            <div className="detail-row detail-row--full"><span className="detail-label">用例标题</span><input className="form-input" style={{ flex: 1 }} value={editTitle} onChange={(e) => { setEditTitle(e.target.value); tcDirty.markDirty(); }} /></div>
            <div className="detail-row"><span className="detail-label">优先级</span><StatusPill tone={priorityTone(editCase.priority)}>{editCase.priority}</StatusPill></div>
            <div className="detail-row"><span className="detail-label">评审状态</span><StatusPill tone={reviewTone(editCase.reviewStatus)}>{editCase.reviewStatus}</StatusPill></div>
            <div className="detail-row"><span className="detail-label">是否自动化</span><span>{editCase.automation === "是" ? "是" : "否"}</span></div>
            <div className="detail-row detail-row--full"><span className="detail-label">测试步骤</span><textarea className="form-textarea" style={{ flex: 1 }} rows={6} value={editSteps} onChange={(e) => { setEditSteps(e.target.value); tcDirty.markDirty(); }} /></div>
            <div className="detail-row detail-row--full"><span className="detail-label">预期结果</span><textarea className="form-textarea" style={{ flex: 1 }} rows={6} value={editExpected} onChange={(e) => { setEditExpected(e.target.value); tcDirty.markDirty(); }} /></div>

          </div>
        )}
      </Modal>

      <ConfirmDialog open={showGenerateConfirm} title="重新生成用例" message={`当前已有 ${testCases.length} 条用例，再次生成将覆盖之前的数据，是否继续？`} confirmLabel="继续生成" onConfirm={handleGenerate} onCancel={() => setShowGenerateConfirm(false)} />

      <ConfirmDialog open={showBatchApproveConfirm} title="批量评审通过" message={`确定将选中的 ${selectedIds.size} 条用例标记为评审通过？`} confirmLabel="确认通过" onConfirm={() => { setShowBatchApproveConfirm(false); batchApprove(); }} onCancel={() => setShowBatchApproveConfirm(false)} />
      {configErrorDialog}
      {tcDirty.confirmDialog}
    </div>
  );
}
