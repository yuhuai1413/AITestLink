import { useMemo, useState } from "react";
import { CheckCircle2, Loader2, Radar, WandSparkles } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "../../../app/store";
import { filesApi, requirementsApi } from "../../../api/client";
import { useProjectData } from "../useProjectData";
import { useConfigError } from "../../../shared/hooks/useConfigError";
import { startParseRequirements, startReverseRequirements } from "../../../shared/hooks/aiTaskManager";
import { useUnsavedChanges } from "../../../shared/hooks/useUnsavedChanges";
import { DataTable } from "../../../shared/components/DataTable";
import { SectionHeader } from "../../../shared/components/SectionHeader";
import { StatusPill } from "../../../shared/components/StatusPill";
import { ConfirmDialog } from "../../../shared/components/ConfirmDialog";
import { Modal } from "../../../shared/components/Modal";
import { MenuSelect } from "../../../shared/components/MenuSelect";
import { formatProjectTime as formatTime, reviewTone } from "./projectDetail.config";
import { riskTone, validityTone } from "../../../shared/utils/statusTone";

// ═══════════════════════════════════════

const CLARIFICATION_PENDING = "待确认";
const CLARIFICATION_CONFIRMED = "已确认";
const CLARIFICATION_NOT_REQUIRED = "无需确认";
const reverseScopeOptions = [
  { value: "recognized", label: "仅已识别页面" },
  { value: "default", label: "默认环境可见功能" },
  { value: "all", label: "全部识别结果" },
  { value: "keywords", label: "指定关键词/菜单" },
];
const reverseTargetOptions = [
  { value: "冒烟测试", label: "冒烟测试" },
  { value: "回归测试", label: "回归测试" },
  { value: "增量测试", label: "增量测试" },
  { value: "全量测试", label: "全量测试" },
];
const reverseWriteModeOptions = [
  { value: "append", label: "追加到当前需求" },
  { value: "overwrite", label: "覆盖当前需求" },
];

function apiErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function hasRealClarificationQuestion(question?: string) {
  const parts = (question || "")
    .split(/[\n；;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return false;
  const emptyValues = new Set(["无", "暂无", "无。", "暂无。", "无待确认问题", "无待确认问题。"]);
  return parts.some((part) => !emptyValues.has(part) && !part.startsWith("【辅助文档信息】") && !part.startsWith("辅助文档信息"));
}

function getClarificationStatus(r: any) {
  if (!hasRealClarificationQuestion(r.question)) return CLARIFICATION_NOT_REQUIRED;
  if ((r.clarificationAnswer || "").trim()) return CLARIFICATION_CONFIRMED;
  return CLARIFICATION_PENDING;
}

function isClarificationResolved(r: any) {
  const status = getClarificationStatus(r);
  return status === CLARIFICATION_CONFIRMED || status === CLARIFICATION_NOT_REQUIRED;
}

function clarificationTone(status: string): "green" | "amber" | "slate" {
  if (status === CLARIFICATION_PENDING) return "amber";
  if (status === CLARIFICATION_CONFIRMED || status === CLARIFICATION_NOT_REQUIRED) return "green";
  return "slate";
}

export function RequirementsTab({ projectId }: { projectId: string }) {
  const { files, requirements, refresh, loading, initialLoading } = useProjectData(projectId);
  const { state, dispatch } = useStore();
  const parsing = useMemo(() => state.activeAITasks.includes(`${projectId}:需求解析`), [state.activeAITasks, projectId]);
  const reversing = useMemo(() => state.activeAITasks.includes(`${projectId}:AI反推需求`), [state.activeAITasks, projectId]);
  const { showConfigError, dialog: configErrorDialog } = useConfigError();
  const [showReparseConfirm, setShowReparseConfirm] = useState(false);
  const [showReverseModal, setShowReverseModal] = useState(false);
  const [reverseScope, setReverseScope] = useState("recognized");
  const [reverseTarget, setReverseTarget] = useState("冒烟测试");
  const [reverseWriteMode, setReverseWriteMode] = useState("append");
  const [reverseMaxPages, setReverseMaxPages] = useState(20);
  const [reverseMaxRequirements, setReverseMaxRequirements] = useState(30);
  const [reverseKeywords, setReverseKeywords] = useState("");
  const [viewReq, setViewReq] = useState<typeof requirements[0] | null>(null);
  const [editReq, setEditReq] = useState<typeof requirements[0] | null>(null);
  const [editRule, setEditRule] = useState("");
  const [editQuestion, setEditQuestion] = useState("");
  const [editClarificationAnswer, setEditClarificationAnswer] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const reqDirty = useUnsavedChanges("需求");

  const hasFiles = files.length > 0;
  const hasParsedFiles = requirements.length > 0;
  const allSelected = requirements.length > 0 && requirements.every((r) => selectedIds.has(r.id));
  const toggleSelectAll = () => setSelectedIds(allSelected ? new Set() : new Set(requirements.map((r) => r.id)));
  const toggleSelect = (id: string) => setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const [showBatchApproveConfirm, setShowBatchApproveConfirm] = useState(false);

  const toggleReview = async (r: any) => {
    const newStatus = (r.reviewStatus === "已通过") ? "待评审" : "已通过";
    try {
      const updated = await requirementsApi.update(r.id, { reviewStatus: newStatus } as any);
      dispatch({ type: "UPDATE_REQUIREMENT", payload: { ...r, ...updated } });
    } catch (error) {
      toast.error(apiErrorMessage(error, "评审状态更新失败"));
      return;
    }
    await refresh();
  };
  const batchApprove = async () => {
    const pending = requirements.filter((r) => selectedIds.has(r.id) && r.reviewStatus !== "已通过" && !isClarificationResolved(r));
    if (pending.length > 0) {
      toast.warning(`有 ${pending.length} 条需求存在待确认问题，请先处理确认结论`);
      return;
    }
    for (const id of selectedIds) {
      const r = requirements.find((x) => x.id === id);
      if (r && r.reviewStatus !== "已通过") {
        try {
          const updated = await requirementsApi.update(r.id, { reviewStatus: "已通过" } as any);
          dispatch({ type: "UPDATE_REQUIREMENT", payload: { ...r, ...updated } });
        } catch (error) {
          toast.error(apiErrorMessage(error, "批量评审失败"));
          return;
        }
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

  const handleReverseRequirements = async () => {
    if (reversing) return;
    setShowReverseModal(false);
    const result = await startReverseRequirements(projectId, {
      scope: reverseScope,
      testTarget: reverseTarget,
      writeMode: reverseWriteMode,
      maxPages: reverseMaxPages,
      maxRequirements: reverseMaxRequirements,
      keywords: reverseKeywords,
    });
    if (!result.success && result.error) {
      toast.error(result.error);
    }
    await refresh();
  };

  return (
    <div className="page-stack page-stack--spaced page-stack--fill">
      <SectionHeader title="需求列表" description="从上传的文档中解析需求，支持查看和确认。" meta={<>共 <strong>{requirements.length}</strong> 条需求</>}
        actions={<>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
            <div style={{ display: "flex", gap: 8 }}>
              {selectedIds.size > 0 && <button className="ghost-button" type="button" onClick={() => setShowBatchApproveConfirm(true)}><CheckCircle2 size={13} /> 评审通过（{selectedIds.size}）</button>}
              <button className="ghost-button" type="button" onClick={() => setShowReverseModal(true)} disabled={reversing}>
                {reversing ? <><Loader2 size={13} className="animate-spin" /> 反推中...</> : <><Radar size={13} /> AI 反推需求</>}
              </button>
              <button className="primary-button" type="button" onClick={handleParse} disabled={parsing}>
                {parsing ? <><Loader2 size={13} className="animate-spin" /> 解析中...</> : <><WandSparkles size={13} /> 需求解析</>}
              </button>
            </div>
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
            { key: "reqId", label: "需求编号", width: "12%", render: (r) => r.reqId || <span className="text-muted">-</span> },
            { key: "module", label: "模块", width: "10%", render: (r) => r.module },
            { key: "feature", label: "功能点", width: "10%", align: "left", lineClamp: 2, render: (r) => r.feature },
            { key: "source", label: "来源", width: "10%", render: (r) => r.source },
            { key: "risk", label: "风险", align: "center", render: (r) => <StatusPill tone={riskTone(r.risk)}>{r.risk}</StatusPill> },
            { key: "rule", label: "业务规则", width: "20%", align: "left", lineClamp: 2, render: (r) => <span title={r.rule}>{r.rule}</span> },
            { key: "question", label: "待确认问题", width: "20%", align: "left", lineClamp: 2, render: (r) => (
              r.question ? <span title={r.question}>{r.question}</span> : <span className="text-muted">-</span>
            ) },
            { key: "clarificationStatus", label: "确认状态", width: "8%", align: "center", render: (r) => {
              const status = getClarificationStatus(r);
              return <StatusPill tone={clarificationTone(status)}>{status}</StatusPill>;
            } },
            { key: "reviewStatus", label: "评审", width: "8%", align: "center", render: (r) => <button type="button" className="text-button" onClick={() => toggleReview(r)}><StatusPill tone={reviewTone(r.reviewStatus)}>{r.reviewStatus || "待评审"}</StatusPill></button> },
            { key: "validityStatus", label: "数据状态", align: "center", render: (r) => <span title={r.invalidReason || ""}><StatusPill tone={validityTone(r.validityStatus)}>{r.validityStatus || "有效"}</StatusPill></span> },
            { key: "createdAt", label: "生成时间", render: (r) => formatTime(r.createdAt) },
            { key: "updatedAt", label: "更新时间", render: (r) => formatTime(r.updatedAt) },
            { key: "actions", label: "操作", width: "120px", sticky: "right" as const, align: "center", render: (r) => (
              <div className="inline-actions">
                <button className="text-button" type="button" onClick={() => setViewReq(r)}>查看</button>
                <button className="text-button" type="button" onClick={() => { setEditReq(r); setEditRule(r.rule); setEditQuestion(r.question); setEditClarificationAnswer(r.clarificationAnswer || ""); }}>编辑</button>
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
            <div className="detail-row"><span className="detail-label">风险等级</span><StatusPill tone={riskTone(viewReq.risk)}>{viewReq.risk}</StatusPill></div>
            <div className="detail-row detail-row--full"><span className="detail-label">业务规则</span><pre className="detail-pre">{viewReq.rule || "无"}</pre></div>
            <div className="detail-row detail-row--full"><span className="detail-label">待确认问题</span><pre className="detail-pre">{viewReq.question || "无"}</pre></div>
            <div className="detail-row"><span className="detail-label">确认状态</span><StatusPill tone={clarificationTone(getClarificationStatus(viewReq))}>{getClarificationStatus(viewReq)}</StatusPill></div>
            <div className="detail-row detail-row--full"><span className="detail-label">确认结论</span><pre className="detail-pre">{viewReq.clarificationAnswer || "无"}</pre></div>
            <div className="detail-row"><span className="detail-label">评审状态</span><StatusPill tone={reviewTone(viewReq.reviewStatus)}>{viewReq.reviewStatus || "待评审"}</StatusPill></div>
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
              const updatedReq = await requirementsApi.update(editReq.id, {
                rule: editRule,
                question: editQuestion,
                clarificationAnswer: hasRealClarificationQuestion(editQuestion) ? editClarificationAnswer : "",
              } as any);
              dispatch({ type: "UPDATE_REQUIREMENT", payload: { ...editReq, ...updatedReq } });
              toast.success("保存成功");
              reqDirty.markClean();
              setEditReq(null);
            } catch (error) { toast.error(apiErrorMessage(error, "保存失败")); }
          }}>保存</button>
        </>}
      >
        {editReq && (
          <div className="detail-grid">
            <div className="detail-row"><span className="detail-label">需求编号</span><span>{editReq.reqId || "-"}</span></div>
            <div className="detail-row"><span className="detail-label">模块</span><span>{editReq.module}</span></div>
            <div className="detail-row"><span className="detail-label">功能点</span><span>{editReq.feature}</span></div>
            <div className="detail-row"><span className="detail-label">来源</span><span>{editReq.source}</span></div>
            <div className="detail-row"><span className="detail-label">风险等级</span><StatusPill tone={riskTone(editReq.risk)}>{editReq.risk}</StatusPill></div>
            <div className="detail-row detail-row--full"><span className="detail-label">业务规则</span><textarea className="form-textarea" style={{ flex: 1 }} rows={5} value={editRule} onChange={(e) => { setEditRule(e.target.value); reqDirty.markDirty(); }} /></div>
            {hasRealClarificationQuestion(editQuestion) && (
              <>
                <div className="detail-row detail-row--full"><span className="detail-label">待确认问题</span><textarea className="form-textarea" style={{ flex: 1 }} rows={5} value={editQuestion} onChange={(e) => { setEditQuestion(e.target.value); reqDirty.markDirty(); }} /></div>
                <div className="detail-row detail-row--full"><span className="detail-label">确认结论</span><textarea className="form-textarea" style={{ flex: 1 }} rows={4} placeholder="填写用户确认后的结论，例如：部门需求仅覆盖销售部，财务部暂不纳入本次测试。" value={editClarificationAnswer} onChange={(e) => { setEditClarificationAnswer(e.target.value); reqDirty.markDirty(); }} /></div>
              </>
            )}
            <div className="detail-row"><span className="detail-label">生成时间</span><span>{formatTime(editReq.createdAt)}</span></div>
            <div className="detail-row"><span className="detail-label">更新时间</span><span>{formatTime(editReq.updatedAt)}</span></div>

          </div>
        )}
      </Modal>

      <ConfirmDialog open={showReparseConfirm} title="重新解析" message="部分文件已解析完成，再次解析将覆盖之前的解析数据和需求，是否继续？" confirmLabel="继续解析" onConfirm={() => { setShowReparseConfirm(false); doParse(); }} onCancel={() => setShowReparseConfirm(false)} />
      <ConfirmDialog open={showBatchApproveConfirm} title="批量评审通过" message={`确定将选中的 ${selectedIds.size} 条需求标记为评审通过？`} confirmLabel="确认通过" onConfirm={() => { setShowBatchApproveConfirm(false); batchApprove(); }} onCancel={() => setShowBatchApproveConfirm(false)} />
      <Modal open={showReverseModal} onClose={() => setShowReverseModal(false)} title="AI 反推需求" width={620}
        footer={<>
          <button className="ghost-button" type="button" onClick={() => setShowReverseModal(false)}>取消</button>
          <button className="primary-button" type="button" onClick={handleReverseRequirements} disabled={reversing}>
            {reversing ? <><Loader2 size={13} className="animate-spin" /> 反推中...</> : "开始反推"}
          </button>
        </>}
      >
        <div className="detail-grid reverse-requirements-form">
          <div className="detail-row detail-row--full">
            <span className="detail-label">反推说明</span>
            <div style={{ color: "var(--muted)", lineHeight: 1.7 }}>
              AI 将基于环境配置、测试账号和最近一次成功的系统识别结果生成候选需求。生成后进入需求列表，默认待评审，后续流程不变。
            </div>
          </div>
          <div className="detail-row">
            <span className="detail-label">反推范围</span>
            <MenuSelect className="detail-row__menu-select" value={reverseScope} options={reverseScopeOptions} onChange={setReverseScope} />
          </div>
          <div className="detail-row">
            <span className="detail-label">测试目标</span>
            <MenuSelect className="detail-row__menu-select" value={reverseTarget} options={reverseTargetOptions} onChange={setReverseTarget} />
          </div>
          <div className="detail-row">
            <span className="detail-label">写入规则</span>
            <MenuSelect className="detail-row__menu-select" value={reverseWriteMode} options={reverseWriteModeOptions} onChange={setReverseWriteMode} />
          </div>
          <div className="detail-row">
            <span className="detail-label">最大页面数</span>
            <input className="menu-field-input" type="number" min={1} max={100} value={reverseMaxPages} onChange={(e) => setReverseMaxPages(Number(e.target.value) || 20)} />
          </div>
          <div className="detail-row">
            <span className="detail-label">最大需求数</span>
            <input className="menu-field-input" type="number" min={1} max={100} value={reverseMaxRequirements} onChange={(e) => setReverseMaxRequirements(Number(e.target.value) || 30)} />
          </div>
          <div className="detail-row detail-row--full">
            <span className="detail-label">关键词/菜单</span>
            <textarea className="form-textarea" style={{ flex: 1 }} rows={3} placeholder="可选。指定要反推的菜单、模块或关键词，例如：用户管理、文件上传、审批流程" value={reverseKeywords} onChange={(e) => setReverseKeywords(e.target.value)} />
          </div>
        </div>
      </Modal>
      {configErrorDialog}
      {reqDirty.confirmDialog}

    </div>
  );
}
