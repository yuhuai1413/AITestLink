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
  const [editScript, setEditScript] = useState<AutomationScript | null>(null);
  const [editCode, setEditCode] = useState("");
  const scriptDirty = useUnsavedChanges("脚本");
  const [deletingScript, setDeletingScript] = useState<{ id: string; name: string } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);
  const [showBatchApproveConfirm, setShowBatchApproveConfirm] = useState(false);

  const automatable = useMemo(() => testCases.filter((tc) => tc.automation === "是"), [testCases]);
  const existingScriptCount = scripts.length;
  const hasPrerequisite = automatable.length > 0;
  const unreviewedTCCount = automatable.filter((tc) => tc.reviewStatus !== "已通过").length;
  const allSelected = scripts.length > 0 && scripts.every((s) => selectedIds.has(s.id));
  const toggleSelectAll = () => setSelectedIds(allSelected ? new Set() : new Set(scripts.map((s) => s.id)));
  const toggleSelect = (id: string) => setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const batchDelete = async () => {
    for (const id of selectedIds) {
      const script = scripts.find((s) => s.testCaseId === id);
      if (script) { try { await scriptsApi.delete(script.id); dispatch({ type: "DELETE_SCRIPT", payload: script.id }); } catch {} }
    }
    toast.success(`已删除 ${selectedIds.size} 个脚本`);
    setSelectedIds(new Set());
    await refreshScripts();
  };
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

  const handleDelete = async () => {
    if (!deletingScript) return;
    try {
      await scriptsApi.delete(deletingScript.id);
      dispatch({ type: "DELETE_SCRIPT", payload: deletingScript.id });
      toast.success("删除成功");
      await refreshScripts();
    } catch {
      toast.error("删除失败");
    }
    setDeletingScript(null);
  };

  const getTestCaseTitle = (testCaseId: string | null | undefined) => {
    if (!testCaseId) return "-";
    const tc = testCases.find((t) => t.id === testCaseId);
    return tc ? tc.title : "-";
  };

  return (
    <div className="page-stack page-stack--spaced page-stack--fill">
      <SectionHeader title="自动化脚本" description="适合自动化的测试用例列表，可一键生成 Playwright 脚本。"
        actions={<>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
            <div style={{ display: "flex", gap: 8 }}>
              {selectedIds.size > 0 && <button className="ghost-button" type="button" onClick={() => setShowBatchApproveConfirm(true)}><CheckCircle2 size={13} /> 评审通过（{selectedIds.size}）</button>}

              <button className="primary-button" type="button" onClick={() => {
                if (!hasPrerequisite) { toast.warning("请先生成测试用例并标记适合自动化的用例"); return; }
                if (existingScriptCount > 0) { setShowGenerateConfirm(true); return; }
                handleGenerate();
              }} disabled={generating}>
                {generating ? <><Loader2 size={13} className="animate-spin" /> 生成中...</> : <><Code size={13} /> 生成自动化脚本</>}
              </button>
            </div>
            <span style={{ color: "var(--muted)", fontSize: 12 }}>共 <strong style={{ color: "var(--text)" }}>{automatable.length}</strong> 条适合自动化的用例，已生成 <strong style={{ color: "var(--text)" }}>{existingScriptCount}</strong> 个脚本</span>
          </div>
        </>} />
      {error && <div className="error-banner"><span>{error}</span></div>}
      <section className="work-panel" style={{ minHeight: 0 }}>
        {initialLoading && scripts.length === 0 ? <div className="empty-state"><Loader2 size={20} className="animate-spin" style={{ color: "var(--muted)" }} /><p style={{ marginTop: 8, color: "var(--muted)" }}>加载中...</p></div> : scripts.length === 0 ? <div className="empty-state"><p>暂无自动化脚本，请点击上方「生成自动化脚本」按钮生成</p></div> : (
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <DataTable rows={scripts} getRowKey={(r) => r.id} columns={[
              { key: "select", label: <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />, width: "40px", sticky: "left" as const, render: (r) => <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleSelect(r.id)} /> },
              { key: "scriptCode", label: "脚本编号", render: (r) => r.scriptCode || <span style={{ color: "var(--muted)" }}>-</span> },
              { key: "testCase", label: "关联用例", align: "left", render: (r) => {
                const tc = testCases.find((t) => t.id === r.testCaseId);
                return tc ? <span title={tc.title} style={{ maxWidth: 200, display: "inline-block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tc.title}</span> : <span style={{ color: "var(--muted)" }}>-</span>;
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
              { key: "status", label: "状态", align: "center", render: (r) => <StatusPill tone={r.status === "成功" ? "green" : r.status === "失败" ? "red" : "blue"}>{r.status}</StatusPill> },
              { key: "review", label: "评审", align: "center", render: (r) => {
                const rev = (r as any).reviewStatus || "待评审";
                return <button type="button" className="text-button" onClick={() => toggleReview(r)}><StatusPill tone={rev === "已通过" ? "green" : "slate"}>{rev}</StatusPill></button>;
              }},
              { key: "createdAt", label: "生成时间", align: "center", render: (r) => formatTime(r.createdAt) },
              { key: "updatedAt", label: "更新时间", align: "center", render: (r) => formatTime(r.updatedAt) },
              { key: "actions", label: "操作", width: "120px", sticky: "right" as const, align: "center", render: (r) => (
                <div className="inline-actions">
                  <button className="text-button" type="button" onClick={() => setViewScript(r)}>查看</button>
                  <button className="text-button" type="button" onClick={() => { setEditScript(r); setEditCode(r.code); }}>编辑</button>
                </div>
              )},
            ]} /></div>
        )}
      </section>

      {/* 查看脚本弹窗 */}
      <Modal open={!!viewScript} onClose={() => setViewScript(null)} title={`脚本代码 - ${viewScript?.framework || ""}`} width={800} height="80vh">
        {viewScript && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
            <div style={{ display: "flex", gap: 24, fontSize: 13, color: "var(--muted)" }}>
              <span>脚本类型：{viewScript.scriptType}</span>
              {(() => { const tc = testCases.find((t) => t.id === viewScript.testCaseId); return tc ? <span>测试类型：{tc.testType || "功能测试"}</span> : null; })()}
              <span>生成时间：{formatTime(viewScript.createdAt)}</span>
              <span>更新时间：{formatTime(viewScript.updatedAt)}</span>
            </div>
            <pre style={{
              background: "#1e1e2e",
              color: "#cdd6f4",
              padding: 16,
              borderRadius: 8,
              fontSize: 13,
              lineHeight: 1.6,
              overflow: "auto",
              flex: 1,
              margin: 0,
            }}>
              {viewScript.code || "// 暂无代码"}
            </pre>
          </div>
        )}
      </Modal>

      {/* 编辑脚本弹窗 */}
      <Modal
        open={!!editScript}
        onClose={() => scriptDirty.requestClose(() => setEditScript(null))}
        title={`编辑脚本 - ${editScript?.framework || ""}`}
        width={800}
        height="80vh"
        footer={<>
          <button className="ghost-button" type="button" onClick={() => scriptDirty.requestClose(() => setEditScript(null))}>取消</button>
          <button className="primary-button" type="button" onClick={handleSaveEdit}>保存</button>
        </>}
      >
        {editScript && (
          <textarea
            value={editCode}
            onChange={(e) => { setEditCode(e.target.value); scriptDirty.markDirty(); }}
            style={{
              width: "100%",
              height: "100%",
              minHeight: 400,
              background: "#1e1e2e",
              color: "#cdd6f4",
              padding: 16,
              borderRadius: 8,
              fontSize: 13,
              lineHeight: 1.6,
              border: "none",
              resize: "vertical",
              fontFamily: "monospace",
              boxSizing: "border-box",
            }}
          />
        )}
      </Modal>

      <ConfirmDialog open={showGenerateConfirm} title="重新生成脚本" message={`当前已有 ${existingScriptCount} 个脚本，再次生成将覆盖之前的数据，是否继续？`} confirmLabel="继续生成" confirmLoading={isStreaming} onConfirm={handleGenerate} onCancel={() => setShowGenerateConfirm(false)} />
      <ConfirmDialog open={showBatchApproveConfirm} title="批量评审通过" message={`确定将选中的 ${selectedIds.size} 个脚本标记为评审通过？`} confirmLabel="确认通过" onConfirm={() => { setShowBatchApproveConfirm(false); batchApprove(); }} onCancel={() => setShowBatchApproveConfirm(false)} />
      {configErrorDialog}
      {scriptDirty.confirmDialog}

    </div>
  );
}
