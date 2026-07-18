import { useMemo, useState } from "react";
import { CheckCircle2, Loader2, WandSparkles } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "../../../app/store";
import { testPointsApi } from "../../../api/client";
import { useProjectData } from "../useProjectData";
import { useConfigError } from "../../../shared/hooks/useConfigError";
import { startGenerateTestPoints } from "../../../shared/hooks/aiTaskManager";
import { useUnsavedChanges } from "../../../shared/hooks/useUnsavedChanges";
import { DataTable } from "../../../shared/components/DataTable";
import { SectionHeader } from "../../../shared/components/SectionHeader";
import { StatusPill } from "../../../shared/components/StatusPill";
import { ConfirmDialog } from "../../../shared/components/ConfirmDialog";
import { Modal } from "../../../shared/components/Modal";
import { formatProjectTime as formatTime, priorityTone, reviewTone } from "./projectDetail.config";

// ═══════════════════════════════════════
// 测试点（AI 生成 + 评审）
// ═══════════════════════════════════════

export function TestPointsTab({ projectId }: { projectId: string }) {
  const { testPoints, files, requirements, refresh, refreshTestPoints, loading, initialLoading } = useProjectData(projectId);
  const { state, dispatch } = useStore();
  const generating = useMemo(() => state.activeAITasks.includes(`${projectId}:测试点生成`), [state.activeAITasks, projectId]);
  const { showConfigError, dialog: configErrorDialog } = useConfigError();
  const [isStreaming, setIsStreaming] = useState(false);
  const [isReceiving, setIsReceiving] = useState(false);
  const [streamCount, setStreamCount] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showGenerateConfirm, setShowGenerateConfirm] = useState(false);
  const [viewTP, setViewTP] = useState<typeof testPoints[0] | null>(null);
  const [editTP, setEditTP] = useState<typeof testPoints[0] | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const tpDirty = useUnsavedChanges("测试点");

  const hasPrerequisite = requirements.length > 0;
  const invalidReqCount = requirements.filter((r) => (r as any).validityStatus === "已失效").length;
  const unreviewedReqCount = requirements.filter((r) => (r as any).reviewStatus !== "已通过").length;

  const handleGenerate = async () => {
    if (!hasPrerequisite) { toast.warning("请先在「需求列表」页面完成需求解析"); return; }
    if (invalidReqCount > 0) { toast.warning(`还有 ${invalidReqCount} 条需求已失效，请先重新解析需求`); return; }
    if (unreviewedReqCount > 0) { toast.warning(`还有 ${unreviewedReqCount} 条需求未评审通过，请先完成需求评审`); return; }
    if (testPoints.length > 0 && !showGenerateConfirm) { setShowGenerateConfirm(true); return; }
    setShowGenerateConfirm(false);
    await startGenerateTestPoints(projectId);
    await refresh();
  };
  const allSelected = testPoints.length > 0 && testPoints.every((tp) => selectedIds.has(tp.id));
  const toggleSelectAll = () => setSelectedIds(allSelected ? new Set() : new Set(testPoints.map((tp) => tp.id)));
  const toggleSelect = (id: string) => setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleReview = async (tp: any) => {
    const newStatus = tp.reviewStatus === "已通过" ? "待评审" : "已通过";
    try { await testPointsApi.update(tp.id, { reviewStatus: newStatus } as any); } catch {}
    dispatch({ type: "UPDATE_TEST_POINT", payload: { ...tp, reviewStatus: newStatus } });
    await refreshTestPoints();
  };
  const [showBatchApproveConfirm, setShowBatchApproveConfirm] = useState(false);
  const batchApprove = async () => {
    for (const id of selectedIds) {
      const tp = testPoints.find((t) => t.id === id);
      if (tp && tp.reviewStatus !== "已通过") {
        try { await testPointsApi.update(tp.id, { reviewStatus: "已通过" } as any); } catch {}
        dispatch({ type: "UPDATE_TEST_POINT", payload: { ...tp, reviewStatus: "已通过" } });
      }
    }
    toast.success(`已通过 ${selectedIds.size} 个测试点`);
    setSelectedIds(new Set());
    await refreshTestPoints();
  };

  const handleSaveEdit = async () => {
    if (!editTP) return;
    try {
      const updatedTP = await testPointsApi.update(editTP.id, { title: editTitle, description: editDesc } as any);
      dispatch({ type: "UPDATE_TEST_POINT", payload: { ...editTP, title: editTitle, description: editDesc, createdAt: updatedTP.createdAt, updatedAt: updatedTP.updatedAt } });
      toast.success("保存成功");
      tpDirty.markClean();
      setEditTP(null);
    } catch {
      toast.error("保存失败");
    }
  };

  return (
    <div className="page-stack page-stack--spaced page-stack--fill">
      <SectionHeader title="测试点生成" description="AI 从文档中提取测试点，支持评审。" meta={<>共 <strong>{testPoints.length}</strong> 个测试点</>}
        actions={<>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
            <div style={{ display: "flex", gap: 8 }}>
              {selectedIds.size > 0 && <button className="ghost-button" type="button" onClick={() => setShowBatchApproveConfirm(true)}><CheckCircle2 size={13} /> 评审通过（{selectedIds.size}）</button>}
              <button className="primary-button" type="button" onClick={handleGenerate} disabled={generating}>{generating ? <><Loader2 size={13} className="animate-spin" /> 生成中...</> : <><WandSparkles size={13} /> 生成测试点</>}</button>
            </div>
          </div>
        </>} />
      <section className="work-panel">
        {initialLoading && testPoints.length === 0 ? <div className="empty-state"><Loader2 size={20} className="animate-spin" style={{ color: "var(--muted)" }} /><p style={{ marginTop: 8, color: "var(--muted)" }}>加载中...</p></div> : testPoints.length === 0 ? <div className="empty-state"><p>暂无测试点</p></div> : (
          <DataTable rows={testPoints} getRowKey={(r) => r.id} columns={[
            { key: "select", label: <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />, width: "40px", sticky: "left" as const, render: (r) => <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleSelect(r.id)} /> },
            { key: "pointCode", label: "测试点编号", render: (r) => r.pointCode || <span style={{ color: "var(--muted)" }}>-</span> },
            { key: "module", label: "模块", render: (r) => r.module },
            { key: "type", label: "类型", render: (r) => r.type },
            { key: "title", label: "测试点", align: "left", lineClamp: 2, render: (r) => r.title },
            { key: "priority", label: "优先级", align: "center", render: (r) => <StatusPill tone={priorityTone(r.priority)}>{r.priority}</StatusPill> },
            { key: "reviewStatus", label: "评审", align: "center", render: (r) => <button type="button" className="text-button" onClick={() => toggleReview(r)}><StatusPill tone={reviewTone(r.reviewStatus)}>{r.reviewStatus}</StatusPill></button> },
            { key: "validityStatus", label: "数据状态", align: "center", render: (r) => <span title={r.invalidReason || ""}><StatusPill tone={r.validityStatus === "已失效" ? "amber" : "green"}>{r.validityStatus || "有效"}</StatusPill></span> },
            { key: "createdAt", label: "生成时间", render: (r) => formatTime(r.createdAt) },
            { key: "updatedAt", label: "更新时间", render: (r) => formatTime(r.updatedAt) },
            { key: "actions", label: "操作", width: "120px", sticky: "right" as const, align: "center", render: (r) => (
              <div className="inline-actions">
                <button className="text-button" type="button" onClick={() => setViewTP(r)}>查看</button>
                <button className="text-button" type="button" onClick={() => { setEditTP(r); setEditTitle(r.title); setEditDesc(r.description); }}>编辑</button>
              </div>
            )},
          ]} />
        )}
      </section>

      {/* 查看测试点弹窗 */}
      <Modal open={!!viewTP} onClose={() => setViewTP(null)} title="测试点详情" width={640}>
        {viewTP && (
          <div className="detail-grid">
            <div className="detail-row"><span className="detail-label">测试点编号</span><span>{viewTP.pointCode || "-"}</span></div>
            <div className="detail-row"><span className="detail-label">模块</span><span>{viewTP.module}</span></div>
            <div className="detail-row"><span className="detail-label">类型</span><span>{viewTP.type}</span></div>
            <div className="detail-row detail-row--full"><span className="detail-label">测试点</span><span>{viewTP.title}</span></div>
            <div className="detail-row"><span className="detail-label">优先级</span><StatusPill tone={priorityTone(viewTP.priority)}>{viewTP.priority}</StatusPill></div>
            <div className="detail-row"><span className="detail-label">评审状态</span><StatusPill tone={reviewTone(viewTP.reviewStatus)}>{viewTP.reviewStatus}</StatusPill></div>
            <div className="detail-row detail-row--full"><span className="detail-label">描述</span><pre className="detail-pre">{viewTP.description || "无"}</pre></div>
            <div className="detail-row"><span className="detail-label">生成时间</span><span>{formatTime(viewTP.createdAt)}</span></div>
            <div className="detail-row"><span className="detail-label">更新时间</span><span>{formatTime(viewTP.updatedAt)}</span></div>
          </div>
        )}
      </Modal>

      {/* 编辑测试点弹窗 */}
      <Modal open={!!editTP} onClose={() => tpDirty.requestClose(() => setEditTP(null))} title="编辑测试点" width={640}
        footer={<>
          <button className="ghost-button" type="button" onClick={() => tpDirty.requestClose(() => setEditTP(null))}>取消</button>
          <button className="primary-button" type="button" onClick={handleSaveEdit}>保存</button>
        </>}
      >
        {editTP && (
          <div className="detail-grid">
            <div className="detail-row"><span className="detail-label">测试点编号</span><span>{editTP.pointCode || "-"}</span></div>
            <div className="detail-row"><span className="detail-label">模块</span><span>{editTP.module}</span></div>
            <div className="detail-row"><span className="detail-label">类型</span><span>{editTP.type}</span></div>
            <div className="detail-row"><span className="detail-label">优先级</span><StatusPill tone={priorityTone(editTP.priority)}>{editTP.priority}</StatusPill></div>
            <div className="detail-row"><span className="detail-label">评审状态</span><StatusPill tone={reviewTone(editTP.reviewStatus)}>{editTP.reviewStatus}</StatusPill></div>
            <div className="detail-row detail-row--full"><span className="detail-label">测试点</span><input className="form-input" style={{ flex: 1 }} value={editTitle} onChange={(e) => { setEditTitle(e.target.value); tpDirty.markDirty(); }} /></div>
            <div className="detail-row detail-row--full"><span className="detail-label">描述</span><textarea className="form-textarea" style={{ flex: 1 }} rows={6} value={editDesc} onChange={(e) => { setEditDesc(e.target.value); tpDirty.markDirty(); }} /></div>

          </div>
        )}
      </Modal>

      <ConfirmDialog open={showGenerateConfirm} title="重新生成测试点" message={`当前已有 ${testPoints.length} 个测试点，再次生成将覆盖之前的数据，是否继续？`} confirmLabel="继续生成" onConfirm={handleGenerate} onCancel={() => setShowGenerateConfirm(false)} />
      <ConfirmDialog open={showBatchApproveConfirm} title="批量评审通过" message={`确定将选中的 ${selectedIds.size} 个测试点标记为评审通过？`} confirmLabel="确认通过" onConfirm={() => { setShowBatchApproveConfirm(false); batchApprove(); }} onCancel={() => setShowBatchApproveConfirm(false)} />
      {configErrorDialog}
      {tpDirty.confirmDialog}

    </div>
  );
}
