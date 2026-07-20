import { useMemo, useState } from "react";
import { CheckCircle2, Code, Loader2, WandSparkles } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "../../../app/store";
import { scriptsApi } from "../../../api/client";
import { useProjectData } from "../useProjectData";
import { useConfigError } from "../../../shared/hooks/useConfigError";
import { startGenerateScripts } from "../../../shared/hooks/aiTaskManager";
import { useUnsavedChanges } from "../../../shared/hooks/useUnsavedChanges";
import { DataTable } from "../../../shared/components/DataTable";
import { SectionHeader } from "../../../shared/components/SectionHeader";
import { StatusPill } from "../../../shared/components/StatusPill";
import { ConfirmDialog } from "../../../shared/components/ConfirmDialog";
import { Modal } from "../../../shared/components/Modal";
import type { AutomationScript } from "../../../shared/types/platform";
import { formatProjectTime as formatTime, reviewTone } from "./projectDetail.config";
import { passFailTone, validityTone } from "../../../shared/utils/statusTone";

// ═══════════════════════════════════════
// 自动化脚本（只读）
// ═══════════════════════════════════════

export function ScriptsTab({ projectId }: { projectId: string }) {
  const { testCases, scripts, refresh, refreshScripts, loading, initialLoading } = useProjectData(projectId);
  const { state, dispatch } = useStore();
  const generating = useMemo(() => state.activeAITasks.includes(`${projectId}:脚本生成`), [state.activeAITasks, projectId]);
  const { showConfigError, dialog: configErrorDialog } = useConfigError();
  const [showGenerateConfirm, setShowGenerateConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewScript, setViewScript] = useState<AutomationScript | null>(null);
  const [scriptViewTab, setScriptViewTab] = useState<"basic" | "script">("basic");
  const [editScript, setEditScript] = useState<AutomationScript | null>(null);
  const [editCode, setEditCode] = useState("");
  const scriptDirty = useUnsavedChanges("脚本");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBatchApproveConfirm, setShowBatchApproveConfirm] = useState(false);

  const automatable = useMemo(() => testCases.filter((tc) => tc.automation === "是"), [testCases]);
  const existingScriptCount = scripts.length;
  const hasPrerequisite = automatable.length > 0;
  const invalidTCCount = automatable.filter((tc) => (tc as any).validityStatus === "已失效").length;
  const unreviewedTCCount = automatable.filter((tc) => tc.reviewStatus !== "已通过").length;
  const allSelected = scripts.length > 0 && scripts.every((s) => selectedIds.has(s.id));
  const toggleSelectAll = () => setSelectedIds(allSelected ? new Set() : new Set(scripts.map((s) => s.id)));
  const toggleSelect = (id: string) => setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const normalizeTestStatus = (status?: string | null) => status === "通过" ? "通过" : status === "失败" ? "失败" : "未测试";
  const getRelatedTestCase = (script: AutomationScript | null) => script ? testCases.find((t) => t.id === script.testCaseId) : undefined;

  const toggleReview = async (script: AutomationScript) => {
    const newStatus = (script as any).reviewStatus === "已通过" ? "待评审" : "已通过";
    try { await scriptsApi.update(script.id, { reviewStatus: newStatus } as any); } catch {}
    dispatch({ type: "UPDATE_SCRIPT", payload: { ...script, reviewStatus: newStatus } as any });
    await refreshScripts();
  };
  const batchApprove = async () => {
    for (const id of selectedIds) {
      const script = scripts.find((s) => s.id === id);
      if (script && (script as any).reviewStatus !== "已通过") {
        try { await scriptsApi.update(script.id, { reviewStatus: "已通过" } as any); } catch {}
        dispatch({ type: "UPDATE_SCRIPT", payload: { ...script, reviewStatus: "已通过" } as any });
      }
    }
    toast.success(`已通过 ${selectedIds.size} 个脚本`);
    setSelectedIds(new Set());
    await refreshScripts();
  };

  const [isStreaming, setIsStreaming] = useState(false);
  const [isReceiving, setIsReceiving] = useState(false);
  const [streamCount, setStreamCount] = useState(0);

  const handleGenerate = async () => {
    if (!hasPrerequisite) { toast.warning("请先生成测试用例并标记适合自动化的用例"); return; }
    if (invalidTCCount > 0) { toast.warning(`还有 ${invalidTCCount} 条适合自动化的用例已失效，请先重新生成测试用例`); return; }
    if (unreviewedTCCount > 0) { toast.warning(`还有 ${unreviewedTCCount} 条适合自动化的用例未评审通过，请先完成用例评审`); return; }
    if (existingScriptCount > 0 && !showGenerateConfirm) { setShowGenerateConfirm(true); return; }
    setShowGenerateConfirm(false);
    await startGenerateScripts(projectId);
    await refreshScripts();
  };

  const handleSaveEdit = async () => {
    if (!editScript) return;
    try {
      const updated = await scriptsApi.update(editScript.id, { code: editCode });
      dispatch({ type: "UPDATE_SCRIPT", payload: {
        ...editScript, code: updated.code, updatedAt: updated.updatedAt,
      } as AutomationScript });
      toast.success("保存成功");
      scriptDirty.markClean();
      setEditScript(null);
    } catch {
      toast.error("保存失败");
    }
  };

  return (
    <div className="page-stack page-stack--spaced page-stack--fill">
      <SectionHeader title="自动化脚本" description="适合自动化的测试用例列表，可一键生成 Playwright 脚本。" meta={<>共 <strong>{scripts.length}</strong> 个脚本</>}
        actions={<>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
            <div style={{ display: "flex", gap: 8 }}>
              {selectedIds.size > 0 && <button className="ghost-button" type="button" onClick={() => setShowBatchApproveConfirm(true)}><CheckCircle2 size={13} /> 评审通过（{selectedIds.size}）</button>}
              <button className="primary-button" type="button" onClick={() => {
                if (!hasPrerequisite) { toast.warning("请先生成测试用例并标记适合自动化的用例"); return; }
                if (invalidTCCount > 0) { toast.warning(`还有 ${invalidTCCount} 条适合自动化的用例已失效，请先重新生成测试用例`); return; }
                if (unreviewedTCCount > 0) { toast.warning(`还有 ${unreviewedTCCount} 条适合自动化的用例未评审通过，请先完成用例评审`); return; }
                if (existingScriptCount > 0) { setShowGenerateConfirm(true); return; }
                handleGenerate();
              }} disabled={generating}>
                {generating ? <><Loader2 size={13} className="animate-spin" /> 生成中...</> : <><Code size={13} /> 生成自动化脚本</>}
              </button>
            </div>
          </div>
        </>} />
      {error && <div className="error-banner"><span>{error}</span></div>}
      <section className="work-panel" style={{ minHeight: 0 }}>
        {initialLoading && scripts.length === 0 ? <div className="empty-state"><Loader2 size={20} className="animate-spin" style={{ color: "var(--muted)" }} /><p style={{ marginTop: 8, color: "var(--muted)" }}>加载中...</p></div> : scripts.length === 0 ? <div className="empty-state"><p>暂无自动化脚本，请点击上方「生成自动化脚本」按钮生成</p></div> : (
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <DataTable rows={scripts} getRowKey={(r) => r.id} columns={[
              { key: "select", label: <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />, width: "40px", sticky: "left" as const, render: (r) => <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleSelect(r.id)} /> },
              { key: "scriptCode", label: "脚本编号", render: (r) => r.scriptCode || <span style={{ color: "var(--muted)" }}>-</span> },
              { key: "testCase", label: "关联用例", align: "left", lineClamp: 2, render: (r) => {
                const tc = testCases.find((t) => t.id === r.testCaseId);
                return tc ? <span title={`${tc.caseCode} ${tc.title}`}>{tc.caseCode} · {tc.title}</span> : <span style={{ color: "var(--muted)" }}>-</span>;
              }},
              { key: "testType", label: "测试类型", align: "center", render: (r) => {
                const tc = testCases.find((t) => t.id === r.testCaseId);
                return tc ? (tc.testType || "功能测试") : <span style={{ color: "var(--muted)" }}>-</span>;
              }},
              { key: "module", label: "模块", align: "center", render: (r) => {
                const tc = testCases.find((t) => t.id === r.testCaseId);
                return tc ? tc.module : <span style={{ color: "var(--muted)" }}>-</span>;
              }},
              { key: "scriptType", label: "脚本类型", align: "center", render: (r) => r.scriptType },
              { key: "framework", label: "框架", align: "center", render: (r) => r.framework },
              { key: "status", label: "测试状态", align: "center", render: (r) => <StatusPill tone={passFailTone(normalizeTestStatus(r.status))}>{normalizeTestStatus(r.status)}</StatusPill> },
              { key: "review", label: "评审", align: "center", render: (r) => {
                const rev = (r as any).reviewStatus || "待评审";
                return <button type="button" className="text-button" onClick={() => toggleReview(r)}><StatusPill tone={rev === "已通过" ? "green" : "slate"}>{rev}</StatusPill></button>;
              }},
              { key: "validityStatus", label: "数据状态", align: "center", render: (r) => <span title={(r as any).invalidReason || ""}><StatusPill tone={validityTone((r as any).validityStatus)}>{(r as any).validityStatus || "有效"}</StatusPill></span> },
              { key: "createdAt", label: "生成时间", align: "center", render: (r) => formatTime(r.createdAt) },
              { key: "updatedAt", label: "更新时间", align: "center", render: (r) => formatTime(r.updatedAt) },
              { key: "actions", label: "操作", width: "120px", sticky: "right" as const, align: "center", render: (r) => (
                <div className="inline-actions">
                  <button className="text-button" type="button" onClick={() => { setScriptViewTab("basic"); setViewScript(r); }}>查看</button>
                  <button className="text-button" type="button" onClick={() => { setEditScript(r); setEditCode(r.code); }}>编辑</button>
                </div>
              )},
            ]} /></div>
        )}
      </section>

      {/* 查看脚本弹窗 */}
      <Modal open={!!viewScript} onClose={() => setViewScript(null)} title={`查看脚本 - ${viewScript?.scriptCode || viewScript?.framework || ""}`} width={960} height="88vh" bodyOverflow="hidden">
        {viewScript && (() => {
          const tc = getRelatedTestCase(viewScript);
          const reviewStatus = (viewScript as any).reviewStatus || "待评审";
          const validityStatus = (viewScript as any).validityStatus || "有效";
          const tabs: { key: typeof scriptViewTab; label: string }[] = [
            { key: "basic", label: "基本信息" },
            { key: "script", label: "脚本信息" },
          ];
          return (
            <div className="script-modal-layout">
              <div className="result-tabs">
                <div className="result-tabs__inner">
                  {tabs.map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setScriptViewTab(tab.key)}
                      className={scriptViewTab === tab.key ? "result-tabs__button result-tabs__button--active" : "result-tabs__button"}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="scroll-fill">
                {scriptViewTab === "basic" ? (
                  <div className="detail-grid script-modal-grid script-modal-grid--single">
                    <div className="detail-row"><span className="detail-label">脚本编号</span><span>{viewScript.scriptCode || "-"}</span></div>
                    <div className="detail-row"><span className="detail-label">关联用例</span><span className="text-anywhere">{tc ? `${tc.caseCode} · ${tc.title}` : "-"}</span></div>
                    <div className="detail-row"><span className="detail-label">模块</span><span>{tc?.module || "-"}</span></div>
                    <div className="detail-row"><span className="detail-label">测试类型</span><span>{tc?.testType || "功能测试"}</span></div>
                    <div className="detail-row"><span className="detail-label">测试端</span><span>{tc?.targetPlatform || "-"}</span></div>
                    <div className="detail-row"><span className="detail-label">所需角色</span><span>{tc?.requiredRole || "无"}</span></div>
                    <div className="detail-row"><span className="detail-label">脚本类型</span><span>{viewScript.scriptType}</span></div>
                    <div className="detail-row"><span className="detail-label">框架/语言</span><span>{viewScript.framework} / {viewScript.language}</span></div>
                    <div className="detail-row"><span className="detail-label">测试状态</span><StatusPill tone={passFailTone(normalizeTestStatus(viewScript.status))}>{normalizeTestStatus(viewScript.status)}</StatusPill></div>
                    <div className="detail-row"><span className="detail-label">评审状态</span><StatusPill tone={reviewTone(reviewStatus)}>{reviewStatus}</StatusPill></div>
                    <div className="detail-row"><span className="detail-label">数据状态</span><StatusPill tone={validityTone(validityStatus)}>{validityStatus}</StatusPill></div>
                    <div className="detail-row"><span className="detail-label">生成时间</span><span>{formatTime(viewScript.createdAt)}</span></div>
                    <div className="detail-row"><span className="detail-label">更新时间</span><span>{formatTime(viewScript.updatedAt)}</span></div>
                    <div className="detail-row detail-row--full script-modal-grid__full"><span className="detail-label">测试地址</span><span className="text-anywhere">{tc?.testUrl || "未配置"}</span></div>
                    {(viewScript as any).invalidReason ? (
                      <div className="detail-row detail-row--full script-modal-grid__full"><span className="detail-label">失效原因</span><span className="text-anywhere">{(viewScript as any).invalidReason}</span></div>
                    ) : null}
                  </div>
                ) : (
                  <pre className="code-block code-block--tall script-code-block">
                    {viewScript.code || "// 暂无代码"}
                  </pre>
                )}
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* 编辑脚本弹窗 */}
      <Modal
        open={!!editScript}
        onClose={() => scriptDirty.requestClose(() => setEditScript(null))}
        title={`编辑脚本 - ${editScript?.scriptCode || editScript?.framework || ""}`}
        width={980}
        height="88vh"
        flushTop
        bodyOverflow="hidden"
        footer={<>
          <button className="ghost-button" type="button" onClick={() => scriptDirty.requestClose(() => setEditScript(null))}>取消</button>
          <button className="primary-button" type="button" onClick={handleSaveEdit}>保存</button>
        </>}
      >
        {editScript && (
          <div className="script-modal-layout script-modal-layout--edit">
            <textarea
              className="script-code-editor"
              value={editCode}
              onChange={(e) => { setEditCode(e.target.value); scriptDirty.markDirty(); }}
            />
          </div>
        )}
      </Modal>

      <ConfirmDialog open={showGenerateConfirm} title="重新生成脚本" message={`当前已有 ${existingScriptCount} 个脚本，再次生成将覆盖之前的数据，是否继续？`} confirmLabel="继续生成" confirmLoading={isStreaming} onConfirm={handleGenerate} onCancel={() => setShowGenerateConfirm(false)} />
      <ConfirmDialog open={showBatchApproveConfirm} title="批量评审通过" message={`确定将选中的 ${selectedIds.size} 个脚本标记为评审通过？`} confirmLabel="确认通过" onConfirm={() => { setShowBatchApproveConfirm(false); batchApprove(); }} onCancel={() => setShowBatchApproveConfirm(false)} />
      {configErrorDialog}
      {scriptDirty.confirmDialog}

    </div>
  );
}
