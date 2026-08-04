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
import { formatTestStepsForDisplay } from "../../../shared/utils/formatTestSteps";
import type { Priority, TestCase } from "../../../shared/types/platform";
import { formatProjectTime as formatTime, priorityTone, reviewTone } from "./projectDetail.config";

// ═══════════════════════════════════════
// 测试用例（AI 生成 + 评审）
// ═══════════════════════════════════════

export function TestCasesTab({ projectId }: { projectId: string }) {
  const { project, testCases, testPoints, refresh, refreshTestCases, refreshTestPoints, loading, initialLoading } = useProjectData(projectId);
  const { state, dispatch } = useStore();
  const generating = useMemo(() => state.activeAITasks.includes(`${projectId}:用例生成`), [state.activeAITasks, projectId]);
  const { showConfigError, dialog: configErrorDialog } = useConfigError();
  const [detailCase, setDetailCase] = useState<TestCase | null>(null);
  const [editCase, setEditCase] = useState<TestCase | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editSteps, setEditSteps] = useState("");
  const [editExpected, setEditExpected] = useState("");
  const tcDirty = useUnsavedChanges("用例");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showGenerateConfirm, setShowGenerateConfirm] = useState(false);
  const [showBatchApproveConfirm, setShowBatchApproveConfirm] = useState(false);

  const hasPrerequisite = testPoints.length > 0;
  const invalidTPCount = testPoints.filter((tp) => (tp as any).validityStatus === "已失效").length;
  const unreviewedTPCount = testPoints.filter((tp) => tp.reviewStatus !== "已通过").length;

  const handleGenerate = async () => {
    if (!hasPrerequisite) { toast.warning("请先生成测试点"); return; }
    if (invalidTPCount > 0) { toast.warning(`还有 ${invalidTPCount} 个测试点已失效，请先重新生成测试点`); return; }
    if (unreviewedTPCount > 0) { toast.warning(`还有 ${unreviewedTPCount} 个测试点未评审通过，请先完成测试点评审`); return; }
    if (testCases.length > 0 && !showGenerateConfirm) { setShowGenerateConfirm(true); return; }
    setShowGenerateConfirm(false);
    await startGenerateTestCases(projectId);
    await refresh();
  };
  // 已失效（作废）的用例不可评审，全选时排除，且勾选框禁用。
  const reviewableCases = testCases.filter((tc) => tc.validityStatus !== "已失效" && tc.reviewStatus !== "已作废");
  const allSelected = reviewableCases.length > 0 && reviewableCases.every((tc) => selectedIds.has(tc.id));
  const hasInvalid = testCases.some((tc) => tc.validityStatus === "已失效");
  const toggleSelectAll = () => setSelectedIds(allSelected ? new Set() : new Set(reviewableCases.map((tc) => tc.id)));
  const toggleSelect = (id: string) => setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleReview = async (tc: any) => {
    if (tc.reviewStatus === "已作废") { toast.warning("已作废的测试用例不能修改评审状态"); return; }
    const newStatus = tc.reviewStatus === "已通过" ? "待评审" : "已通过";
    try { await testCasesApi.update(tc.id, { reviewStatus: newStatus } as any); } catch {}
    dispatch({ type: "UPDATE_TEST_CASE", payload: { ...tc, reviewStatus: newStatus } });
    await refreshTestCases();
  };
  const batchApprove = async () => {
    // 区分可评审用例与已失效（作废）用例，给出准确反馈。
    const selected = testCases.filter((tc) => selectedIds.has(tc.id));
    const invalid = selected.filter((tc) => tc.validityStatus === "已失效" || tc.reviewStatus === "已作废");
    const reviewable = selected.filter((tc) => tc.validityStatus !== "已失效" && tc.reviewStatus !== "已作废" && tc.reviewStatus !== "已通过");

    if (reviewable.length === 0) {
      // 选中的全部是已失效或已通过，没有可评审的
      if (invalid.length > 0) {
        toast.warning(`选中的 ${selectedIds.size} 条用例均已失效，无法再次评审。数据失效后需重新生成用例`);
      } else {
        toast.info("选中的用例已是评审通过状态，无需重复评审");
      }
      setSelectedIds(new Set());
      return;
    }

    let passed = 0;
    for (const tc of reviewable) {
      try {
        await testCasesApi.update(tc.id, { reviewStatus: "已通过" } as any);
        dispatch({ type: "UPDATE_TEST_CASE", payload: { ...tc, reviewStatus: "已通过" } });
        passed += 1;
      } catch { }
    }
    if (invalid.length > 0) {
      toast.success(`已通过 ${passed} 条用例；其中 ${invalid.length} 条已失效被自动跳过`);
    } else {
      toast.success(`已通过 ${passed} 条用例`);
    }
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
    exportTestCases("all", `${project?.name || "未命名项目"}-全部测试用例.xlsx`, testCases.length);
  };

  const handleExportManual = () => {
    if (testCases.length === 0) { toast.warning("暂无测试用例，请先生成用例"); return; }
    const manualCases = testCases.filter((tc) => tc.automation !== "是");
    if (manualCases.length === 0) { toast.warning("所有用例均标记为自动化，暂无可导出的手动用例"); return; }
    exportTestCases("manual", `${project?.name || "未命名项目"}-手动测试用例.xlsx`, manualCases.length);
  };

  const exportTestCases = async (type: "all" | "manual", fileName: string, count: number) => {
    try {
      const blob = await testCasesApi.export(projectId, type);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`已导出 ${count} 条测试用例`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "导出失败");
    }
  };

  return (
    <div className="page-stack page-stack--spaced page-stack--fill">
      <SectionHeader title="用例生成" description="从测试点生成可执行用例，AI 在生成时自动进行质量自检。" meta={<>{testCases.length > 0 && <>共 <strong>{testCases.length}</strong> 条用例，其中 <strong>{testCases.filter((tc) => tc.automation === "是").length}</strong> 条支持自动化</>}</>}
        actions={<>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
            <div style={{ display: "flex", gap: 8 }}>
              {selectedIds.size > 0 && <button className="ghost-button" type="button" disabled={generating} onClick={() => setShowBatchApproveConfirm(true)}><CheckCircle2 size={13} /> 评审通过（{selectedIds.size}）</button>}
              <button className="ghost-button" type="button" onClick={handleExportAll} disabled={generating}><Download size={13} /> 导出所有用例</button>
              <button className="ghost-button" type="button" onClick={handleExportManual} disabled={generating}><Download size={13} /> 导出手动用例</button>
              <button className="primary-button" type="button" onClick={handleGenerate} disabled={generating}>{generating ? <><Loader2 size={13} className="animate-spin" /> 生成中...</> : <><WandSparkles size={13} /> 生成用例</>}</button>
            </div>
          </div>
        </>} />
      <section className="work-panel">
        {initialLoading && testCases.length === 0 ? <div className="empty-state"><Loader2 size={20} className="animate-spin" style={{ color: "var(--muted)" }} /><p style={{ marginTop: 8, color: "var(--muted)" }}>加载中...</p></div> : testCases.length === 0 ? <div className="empty-state"><p>暂无测试用例</p></div> : (
          <DataTable rows={testCases} getRowKey={(r) => r.id} columns={[
            { key: "select", label: <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} disabled={reviewableCases.length === 0} />, width: "40px", sticky: "left" as const, render: (r) => {
              const invalid = r.validityStatus === "已失效" || r.reviewStatus === "已作废";
              return <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleSelect(r.id)} disabled={invalid} title={invalid ? "已失效用例不可评审" : undefined} />;
            } },
            { key: "caseCode", label: "用例编号", render: (r) => r.caseCode },
            { key: "module", label: "模块", render: (r) => r.module },
            { key: "testType", label: "测试类型", render: (r) => r.testType || "功能测试" },
            { key: "feature", label: "测试点", align: "left", lineClamp: 3, render: (r) => <span title={r.feature}>{r.feature}</span> },
            { key: "title", label: "用例标题", align: "left", lineClamp: 3, render: (r) => <span title={r.title}>{r.title}</span> },
            { key: "targetPlatform", label: "测试端", width: "72px", align: "center", render: (r) => r.targetPlatform || "PC" },
            { key: "testUrl", label: "测试地址", align: "left", lineClamp: 3, render: (r) => <span title={r.testUrl}>{r.testUrl || "未配置"}</span> },
            { key: "requiredRole", label: "角色", width: "100px", align: "center", render: (r) => r.requiredRole || "无" },
            { key: "priority", label: "优先级", align: "center", render: (r) => <StatusPill tone={priorityTone(r.priority)}>{r.priority}</StatusPill> },
            { key: "steps", label: "测试步骤", align: "left", lineClamp: 3, render: (r) => <span className="test-steps-preview" title={r.steps}>{formatTestStepsForDisplay(r.steps)}</span> },
            { key: "expectedResult", label: "预期结果", align: "left", lineClamp: 3, render: (r) => <span title={r.expectedResult}>{r.expectedResult}</span> },
            { key: "reviewStatus", label: "评审", align: "center", render: (r) => <button type="button" className="text-button" onClick={() => toggleReview(r)}><StatusPill tone={reviewTone(r.reviewStatus)}>{r.reviewStatus}</StatusPill></button> },
            { key: "validityStatus", label: "数据状态", align: "center", render: (r) => <StatusPill tone={r.validityStatus === "已失效" ? "amber" : "green"}>{r.validityStatus || "有效"}</StatusPill> },
            ...(hasInvalid ? [{ key: "invalidReason", label: "失效原因", align: "left" as const, width: "14%", lineClamp: 2, render: (r: any) => (r.validityStatus === "已失效" && r.invalidReason) ? <span title={r.invalidReason}>{r.invalidReason}</span> : null }] : []),
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

      <ConfirmDialog open={showBatchApproveConfirm} title="批量评审通过" message={(() => {
        const selected = testCases.filter((tc) => selectedIds.has(tc.id));
        const invalidCount = selected.filter((tc) => tc.validityStatus === "已失效" || tc.reviewStatus === "已作废").length;
        if (invalidCount === selected.length) {
          return `选中的 ${selectedIds.size} 条用例均已失效，无法再次评审。数据失效后需重新生成用例`;
        }
        if (invalidCount > 0) {
          return `选中的 ${selectedIds.size} 条用例中有 ${invalidCount} 条已失效，将被自动跳过，仅评审其余 ${selectedIds.size - invalidCount} 条。是否继续？`;
        }
        return `确定将选中的 ${selectedIds.size} 条用例标记为评审通过？`;
      })()} confirmLabel="确认通过" onConfirm={() => { setShowBatchApproveConfirm(false); batchApprove(); }} onCancel={() => setShowBatchApproveConfirm(false)} />
      {configErrorDialog}
      {tcDirty.confirmDialog}
    </div>
  );
}
