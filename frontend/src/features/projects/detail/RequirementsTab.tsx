import { useMemo, useState } from "react";
import { CheckCircle2, Loader2, WandSparkles } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "../../../app/store";
import { filesApi, requirementsApi } from "../../../api/client";
import { useProjectData } from "../useProjectData";
import { useConfigError } from "../../../shared/hooks/useConfigError";
import { startParseRequirements } from "../../../shared/hooks/aiTaskManager";
import { useUnsavedChanges } from "../../../shared/hooks/useUnsavedChanges";
import { DataTable } from "../../../shared/components/DataTable";
import { SectionHeader } from "../../../shared/components/SectionHeader";
import { StatusPill } from "../../../shared/components/StatusPill";
import { ConfirmDialog } from "../../../shared/components/ConfirmDialog";
import { Modal } from "../../../shared/components/Modal";
import { formatProjectTime as formatTime, reviewTone } from "./projectDetail.config";

// ═══════════════════════════════════════

const truncateText = (text: string, maxLen = 50) => text.length > maxLen ? text.slice(0, maxLen) + "..." : text;

export function RequirementsTab({ projectId }: { projectId: string }) {
  const { files, requirements, refresh, loading, initialLoading } = useProjectData(projectId);
  const { state, dispatch } = useStore();
  const parsing = useMemo(() => state.activeAITasks.includes(`${projectId}:需求解析`), [state.activeAITasks, projectId]);
  const { showConfigError, dialog: configErrorDialog } = useConfigError();
  const [showReparseConfirm, setShowReparseConfirm] = useState(false);
  const [viewReq, setViewReq] = useState<typeof requirements[0] | null>(null);
  const [editReq, setEditReq] = useState<typeof requirements[0] | null>(null);
  const [editRule, setEditRule] = useState("");
  const [editQuestion, setEditQuestion] = useState("");
  const [deletingReq, setDeletingReq] = useState<{ id: string; name: string } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const reqDirty = useUnsavedChanges("需求");

  const hasFiles = files.length > 0;
  const hasParsedFiles = requirements.length > 0;
  const allSelected = requirements.length > 0 && requirements.every((r) => selectedIds.has(r.id));
  const toggleSelectAll = () => setSelectedIds(allSelected ? new Set() : new Set(requirements.map((r) => r.id)));
  const toggleSelect = (id: string) => setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);
  const [showBatchApproveConfirm, setShowBatchApproveConfirm] = useState(false);

  const toggleReview = async (r: any) => {
    const newStatus = (r.reviewStatus === "已通过") ? "待评审" : "已通过";
    try { await requirementsApi.update(r.id, { reviewStatus: newStatus } as any); } catch {}
    dispatch({ type: "UPDATE_REQUIREMENT", payload: { ...r, reviewStatus: newStatus } });
    await refresh();
  };
  const batchApprove = async () => {
    for (const id of selectedIds) {
      const r = requirements.find((x) => x.id === id);
      if (r && r.reviewStatus !== "已通过") {
        try { await requirementsApi.update(r.id, { reviewStatus: "已通过" } as any); } catch {}
        dispatch({ type: "UPDATE_REQUIREMENT", payload: { ...r, reviewStatus: "已通过" } });
      }
    }
    toast.success(`已通过 ${selectedIds.size} 条需求`);
    setSelectedIds(new Set());
    await refresh();
  };

  const doParse = async () => {
    if (files.length === 0) { toast.warning("请先在「输入资料」页面上传文件"); return; }
    await startParseRequirements(projectId);
    await refresh();
    window.dispatchEvent(new CustomEvent("aitestlink:files-refresh", { detail: { projectId } }));
  };

  const handleParse = async () => {
    if (parsing) return;
    // 直接调 API 检查文件数量，避免跨实例状态不同步
    try {
      const freshFiles = await filesApi.list(projectId);
      if (!Array.isArray(freshFiles) || freshFiles.length === 0) {
        toast.warning("请先在「输入资料」页面上传文件");
        return;
      }
    } catch {
      toast.warning("请先在「输入资料」页面上传文件");
      return;
    }
    if (hasParsedFiles) { setShowReparseConfirm(true); return; }
    await doParse();
  };

  return (
    <div className="page-stack page-stack--spaced page-stack--fill">
      <SectionHeader title="需求列表" description="从上传的文档中解析需求，支持查看和确认。"
        actions={<>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
            <div style={{ display: "flex", gap: 8 }}>
              {selectedIds.size > 0 && <button className="ghost-button" type="button" onClick={() => setShowBatchApproveConfirm(true)}><CheckCircle2 size={13} /> 评审通过（{selectedIds.size}）</button>}
              <button className="primary-button" type="button" onClick={handleParse} disabled={parsing}>
                {parsing ? <><Loader2 size={13} className="animate-spin" /> 解析中...</> : <><WandSparkles size={13} /> 需求解析</>}
              </button>
            </div>
            <span style={{ color: "var(--muted)", fontSize: 12 }}>共 <strong style={{ color: "var(--text)" }}>{requirements.length}</strong> 条需求</span>
          </div>
        </>} />
      <section className="work-panel">
        {initialLoading && requirements.length === 0 ? (
          <div className="empty-state"><Loader2 size={20} className="animate-spin" style={{ color: "var(--muted)" }} /><p style={{ marginTop: 8, color: "var(--muted)" }}>加载中...</p></div>
        ) : requirements.length === 0 ? (
          <div className="empty-state">
            {hasFiles ? <p>暂无需求数据，请点击「需求解析」按钮</p> : <p>暂无需求数据，请先在「输入资料」页面上传文件</p>}
          </div>
        ) : (
          <DataTable rows={requirements} getRowKey={(r) => r.id} columns={[
            { key: "select", label: <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />, width: "40px", sticky: "left" as const, render: (r) => <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleSelect(r.id)} /> },
            { key: "reqId", label: "需求编号", width: "12%", render: (r) => r.reqId || <span style={{ color: "var(--muted)" }}>-</span> },
            { key: "module", label: "模块", width: "10%", render: (r) => r.module },
            { key: "feature", label: "功能点", width: "10%", align: "left", render: (r) => r.feature },
            { key: "source", label: "来源", width: "10%", render: (r) => r.source },
            { key: "risk", label: "风险", align: "center", render: (r) => <StatusPill tone={r.risk === "高" ? "red" : r.risk === "中" ? "amber" : "green"}>{r.risk}</StatusPill> },
            { key: "rule", label: "业务规则", width: "20%", align: "left", render: (r) => <span title={r.rule}>{truncateText(r.rule)}</span> },
            { key: "question", label: "待确认", width: "20%", align: "left", render: (r) => r.question ? <span title={r.question}>{truncateText(r.question)}</span> : <span style={{ color: "var(--muted)" }}>-</span> },
            { key: "reviewStatus", label: "评审", width: "8%", align: "center", render: (r) => <button type="button" className="text-button" onClick={() => toggleReview(r)}><StatusPill tone={r.reviewStatus === "已通过" ? "green" : "slate"}>{r.reviewStatus || "待评审"}</StatusPill></button> },
            { key: "createdAt", label: "生成时间", render: (r) => formatTime(r.createdAt) },
            { key: "updatedAt", label: "更新时间", render: (r) => formatTime(r.updatedAt) },
            { key: "actions", label: "操作", width: "120px", sticky: "right" as const, align: "center", render: (r) => (
              <div className="inline-actions">
                <button className="text-button" type="button" onClick={() => setViewReq(r)}>查看</button>
                <button className="text-button" type="button" onClick={() => { setEditReq(r); setEditRule(r.rule); setEditQuestion(r.question); }}>编辑</button>

              </div>
            )},
          ]} />
        )}
      </section>

      {/* 查看需求弹窗 */}
      <Modal open={!!viewReq} onClose={() => setViewReq(null)} title="需求详情" width={640}>
        {viewReq && (
          <div className="detail-grid">
            <div className="detail-row"><span className="detail-label">需求编号</span><span>{viewReq.reqId || "-"}</span></div>
            <div className="detail-row"><span className="detail-label">模块</span><span>{viewReq.module}</span></div>
            <div className="detail-row"><span className="detail-label">功能点</span><span>{viewReq.feature}</span></div>
            <div className="detail-row"><span className="detail-label">来源</span><span>{viewReq.source}</span></div>
            <div className="detail-row"><span className="detail-label">风险等级</span><StatusPill tone={viewReq.risk === "高" ? "red" : viewReq.risk === "中" ? "amber" : "green"}>{viewReq.risk}</StatusPill></div>
            <div className="detail-row detail-row--full"><span className="detail-label">业务规则</span><pre className="detail-pre">{viewReq.rule || "无"}</pre></div>
            <div className="detail-row detail-row--full"><span className="detail-label">待确认问题</span><pre className="detail-pre">{viewReq.question || "无"}</pre></div>
            <div className="detail-row"><span className="detail-label">评审状态</span><StatusPill tone={viewReq.reviewStatus === "已通过" ? "green" : "slate"}>{viewReq.reviewStatus || "待评审"}</StatusPill></div>
          </div>
        )}
      </Modal>

      {/* 编辑需求弹窗 */}
      <Modal open={!!editReq} onClose={() => reqDirty.requestClose(() => setEditReq(null))} title="编辑需求" width={640}
        footer={<>
          <button className="ghost-button" type="button" onClick={() => reqDirty.requestClose(() => setEditReq(null))}>取消</button>
          <button className="primary-button" type="button" onClick={async () => {
            if (!editReq) return;
            try {
              const updatedReq = await requirementsApi.update(editReq.id, { rule: editRule, question: editQuestion } as any);
              dispatch({ type: "UPDATE_REQUIREMENT", payload: { ...editReq, rule: editRule, question: editQuestion, createdAt: updatedReq.createdAt, updatedAt: updatedReq.updatedAt } });
              toast.success("保存成功");
              reqDirty.markClean();
              setEditReq(null);
            } catch { toast.error("保存失败"); }
          }}>保存</button>
        </>}
      >
        {editReq && (
          <div className="detail-grid">
            <div className="detail-row"><span className="detail-label">需求编号</span><span>{editReq.reqId || "-"}</span></div>
            <div className="detail-row"><span className="detail-label">模块</span><span>{editReq.module}</span></div>
            <div className="detail-row"><span className="detail-label">功能点</span><span>{editReq.feature}</span></div>
            <div className="detail-row"><span className="detail-label">来源</span><span>{editReq.source}</span></div>
            <div className="detail-row"><span className="detail-label">风险等级</span><StatusPill tone={editReq.risk === "高" ? "red" : editReq.risk === "中" ? "amber" : "green"}>{editReq.risk}</StatusPill></div>
            <div className="detail-row detail-row--full"><span className="detail-label">业务规则</span><textarea className="form-textarea" style={{ flex: 1 }} rows={5} value={editRule} onChange={(e) => { setEditRule(e.target.value); reqDirty.markDirty(); }} /></div>
            <div className="detail-row detail-row--full"><span className="detail-label">待确认问题</span><textarea className="form-textarea" style={{ flex: 1 }} rows={5} value={editQuestion} onChange={(e) => { setEditQuestion(e.target.value); reqDirty.markDirty(); }} /></div>
            <div className="detail-row"><span className="detail-label">生成时间</span><span>{formatTime(editReq.createdAt)}</span></div>
            <div className="detail-row"><span className="detail-label">更新时间</span><span>{formatTime(editReq.updatedAt)}</span></div>

          </div>
        )}
      </Modal>

      <ConfirmDialog open={showReparseConfirm} title="重新解析" message="部分文件已解析完成，再次解析将覆盖之前的解析数据和需求，是否继续？" confirmLabel="继续解析" onConfirm={() => { setShowReparseConfirm(false); doParse(); }} onCancel={() => setShowReparseConfirm(false)} />
      <ConfirmDialog open={showBatchApproveConfirm} title="批量评审通过" message={`确定将选中的 ${selectedIds.size} 条需求标记为评审通过？`} confirmLabel="确认通过" onConfirm={() => { setShowBatchApproveConfirm(false); batchApprove(); }} onCancel={() => setShowBatchApproveConfirm(false)} />
      {configErrorDialog}
      {reqDirty.confirmDialog}

    </div>
  );
}
