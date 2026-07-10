import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, WandSparkles, Loader2, FileUp, Upload, Trash2, Download, CheckCircle2, Play, Code, Eye } from "lucide-react";
import { renderAsync } from "docx-preview";
import { useStore, useProjectTestCases } from "../../app/store";
import { useProjectData } from "./useProjectData";
import { useAPISync } from "../../api/useAPISync";
import { useAIAction } from "../../shared/hooks/useAIAction";
import { useConfigError } from "../../shared/hooks/useConfigError";
import { aiApi, modelConfigApi, filesApi, requirementsApi, scriptsApi, testCasesApi, testPointsApi, docGenApi, type ApiFile, type ApiRequirement, type ApiTestPoint, type ApiTestCase, type ApiScript } from "../../api/client";
import { DataTable } from "../../shared/components/DataTable";
import { SectionHeader } from "../../shared/components/SectionHeader";
import { StatusPill } from "../../shared/components/StatusPill";
import { ConfirmDialog } from "../../shared/components/ConfirmDialog";
import { Modal } from "../../shared/components/Modal";
import { TestCaseDetailModal } from "../test-design/TestCaseDetailModal";
import { toast } from "sonner";
import { startParseRequirements, startGenerateDocs } from "../../shared/hooks/aiTaskManager";
import type { Priority, TestCase, AutomationScript } from "../../shared/types/platform";
import { exportManualTestCasesToExcel } from "../../shared/utils/exportExcel";
import { TOKEN_KEY } from "../../shared/config/storage";
import { API_BASE } from "../../shared/config/deploy";

function formatTime(iso: string | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

type TabKey =
  | "overview" | "files" | "requirements" | "testPoints" | "testCases" | "scripts" | "executeScripts"
  | "docFusion" | "summary" | "docGenerate";

const allTabs: { key: TabKey; label: string }[] = [
  { key: "overview", label: "概览" },
  { key: "files", label: "输入资料" },
  { key: "requirements", label: "需求列表" },
  { key: "testPoints", label: "测试点" },
  { key: "testCases", label: "测试用例" },
  { key: "scripts", label: "自动化脚本" },
  { key: "executeScripts", label: "执行脚本" },
  { key: "docFusion", label: "数据汇总" },
  { key: "summary", label: "测试总结" },
  { key: "docGenerate", label: "文档生成" },
];

function priorityTone(p: Priority) {
  if (p === "P0") return "red" as const;
  if (p === "P1") return "amber" as const;
  if (p === "P2") return "blue" as const;
  return "slate" as const;
}

function reviewTone(s: string) {
  if (s === "已通过") return "green" as const;
  if (s === "需修改") return "red" as const;
  return "amber" as const;
}



// ═══════════════════════════════════════
// 概览
// ═══════════════════════════════════════

function OverviewTab({ projectId }: { projectId: string }) {
  const { project, files, testPoints, testCases, scripts, loading, initialLoading } = useProjectData(projectId);


  if (initialLoading && !project) return <div className="empty-state"><Loader2 size={20} className="animate-spin" style={{ color: "var(--muted)" }} /><p style={{ marginTop: 8, color: "var(--muted)" }}>加载中...</p></div>;
  if (!project) return null;
  const p0Cases = testCases.filter((c) => c.priority === "P0").length;
  const autoCount = testCases.filter((c) => c.automation === "适合").length;
  const autoRate = testCases.length > 0 ? Math.round(autoCount / testCases.length * 100) : 0;
  const cards = [
    { label: "优先级", value: <StatusPill tone={project.priority === "高" ? "red" : project.priority === "中" ? "amber" : "green"}>{project.priority}</StatusPill> },
    { label: "文档数量", value: files.length },
    { label: "测试点", value: testPoints.length },
    { label: "测试用例", value: testCases.length },
    { label: "P0 用例", value: p0Cases },
    { label: "自动化覆盖", value: `${autoRate}%` },
    { label: "自动化脚本", value: scripts.length },
    { label: "测试类型", value: project.testType },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-sm)", paddingTop: "var(--sp-sm)", flex: 1 }}>
      <div className="overview-grid">
        {cards.map((c) => (
          <div className="overview-stat" key={c.label}>
            <span className="overview-stat__label">{c.label}</span>
            <strong className="overview-stat-value">{c.value}</strong>
          </div>
        ))}
      </div>
      <section className="work-panel" style={{ flex: 1, minHeight: 0 }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>项目说明</h3>
        {project.description ? (
          <p style={{ margin: 0, color: "var(--muted)", fontSize: 14, lineHeight: 22 }}>{project.description}</p>
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "20px 0" }}>
            <div className="empty-state" style={{ padding: 0 }}>
              <svg width="80" height="70" viewBox="0 0 120 100" fill="none"><rect x="10" y="30" width="100" height="60" rx="8" fill="#f1f5f9" stroke="#e2e8f0" strokeWidth="1.5"/><path d="M10 38C10 33.58 13.58 30 18 30H42L50 22H102C106.42 22 110 25.58 110 30V38H10Z" fill="#e2e8f0"/><path d="M10 38H110V72C110 76.42 106.42 80 102 80H18C13.58 80 10 76.42 10 72V38Z" fill="#f8fafc"/><circle cx="60" cy="56" r="12" fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="1.5" strokeDasharray="4 3"/></svg>
              <p style={{ marginTop: 8, color: "#94a3b8", fontSize: 13 }}>暂无项目说明</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

// ═══════════════════════════════════════
// 输入资料（仅上传 + 管理）
// ═══════════════════════════════════════

function FilesTab({ projectId }: { projectId: string }) {
  const { files, refreshFiles, loading, initialLoading } = useProjectData(projectId);
  const { uploadFile, deleteFile } = useAPISync();
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deletingFile, setDeletingFile] = useState<{ id: string; name: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 监听 AI 任务完成后刷新文件列表
  useEffect(() => {
    const handler = (e: Event) => {
      const { projectId: pid } = (e as CustomEvent).detail || {};
      if (pid === projectId) refreshFiles();
    };
    window.addEventListener("aitestlink:files-refresh", handler);
    return () => window.removeEventListener("aitestlink:files-refresh", handler);
  }, [projectId, refreshFiles]);

  const allSelected = files.length > 0 && files.every((f) => selectedIds.has(f.id));
  const toggleSelectAll = () => setSelectedIds(allSelected ? new Set() : new Set(files.map((f) => f.id)));
  const toggleSelect = (id: string) => setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const handleUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const existingNames = new Set(files.map((f) => f.name));
    const newFiles = Array.from(fileList).filter((f) => !existingNames.has(f.name));
    const skipped = fileList.length - newFiles.length;
    if (newFiles.length === 0) { toast.warning("所选文件已全部存在"); return; }
    setUploading(true);
    try {
      for (const file of newFiles) { await uploadFile(projectId, file); }
      toast.success(skipped > 0 ? `上传 ${newFiles.length} 个，跳过 ${skipped} 个重复` : `上传成功，共 ${newFiles.length} 个文件`); await refreshFiles();
      window.dispatchEvent(new CustomEvent('aitestlink:data-refresh', { detail: { projectId } }));
    } catch (err) { toast.error(err instanceof Error ? err.message : "上传失败"); }
    finally { setUploading(false); if (inputRef.current) inputRef.current.value = ""; }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false); handleUpload(e.dataTransfer.files);
  }, [projectId, files]);



  const handleDelete = async () => {
    if (!deletingFile) return;
    try { 
      const result = await deleteFile(deletingFile.id);
      toast.success("删除成功，关联的需求、测试点、用例和脚本已一并清除"); 
      await refreshFiles();
      // 通知其他 tab 刷新数据
      window.dispatchEvent(new CustomEvent("aitestlink:data-refresh", { detail: { projectId } })); 
    } catch { toast.error("删除失败"); }
    setDeletingFile(null);
  };

  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);


  return (
    <div className="page-stack page-stack--spaced page-stack--fill">
      <SectionHeader title="文档管理" description="上传需求文档、接口文档、原型和变更说明，支持拖拽上传。"
        actions={<>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <input ref={inputRef} type="file" multiple accept=".docx,.doc,.pdf,.md,.json,.yaml,.yml,.xlsx,.xls,.csv" style={{ display: "none" }} onChange={(e) => handleUpload(e.target.files)} />
              <button className="ghost-button" type="button" onClick={() => inputRef.current?.click()} disabled={uploading}>手动上传</button>
            </div>
            <span style={{ color: "var(--muted)", fontSize: 12 }}>共 <strong style={{ color: "var(--text)" }}>{files.length}</strong> 个文件</span>
          </div>
        </>} />
      <div onDrop={handleDrop} onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
        style={{ border: `2px dashed ${dragOver ? "#6366f1" : "var(--line)"}`, borderRadius: "var(--radius-l2)", padding: "32px 20px", textAlign: "center", background: dragOver ? "rgba(99,102,241,0.05)" : "transparent", transition: "all 0.2s", cursor: "pointer" }}
        onClick={() => inputRef.current?.click()}>
        <Upload size={32} style={{ color: dragOver ? "#6366f1" : "var(--muted)", margin: "0 auto 8px" }} />
        <p style={{ margin: 0, color: dragOver ? "#6366f1" : "var(--muted)", fontSize: 14 }}>{uploading ? "上传中..." : "拖拽文件到此处，或点击上传"}</p>
        <p style={{ margin: "4px 0 0", color: "var(--subtle)", fontSize: 12 }}>支持 .docx .doc .pdf .md .json .yaml .xlsx .csv 等格式</p>
      </div>
      <section className="work-panel">
        {initialLoading && files.length === 0 ? <div className="empty-state"><Loader2 size={20} className="animate-spin" style={{ color: "var(--muted)" }} /><p style={{ marginTop: 8, color: "var(--muted)" }}>加载中...</p></div> : files.length === 0 ? <div className="empty-state"><p>暂无文档，请上传文件。</p></div> : (
          <DataTable rows={files} getRowKey={(r) => r.id} columns={[
            { key: "select", label: <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />, width: "40px", sticky: "left" as const, render: (r) => <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleSelect(r.id)} /> },
            { key: "name", label: "文件名称", align: "left", render: (r) => <strong>{r.name}</strong> },
            { key: "type", label: "文件类型", render: (r) => r.fileType },
            { key: "size", label: "文件大小", render: (r) => r.size },
            { key: "parseStatus", label: "解析状态", align: "center", render: (r) => <span title={r.parseError || undefined}><StatusPill tone={r.parseStatus === "已完成" ? "green" : r.parseStatus === "解析中" ? "blue" : r.parseStatus === "失败" ? "red" : "slate"}>{r.parseStatus}</StatusPill></span> },
            { key: "date", label: "上传时间", render: (r) => formatTime(r.uploadedAt) },
            { key: "actions", label: "操作", width: "120px", sticky: "right" as const, align: "center", render: (r) => <button className="text-button text-button--danger" type="button" onClick={() => setDeletingFile({ id: r.id, name: r.name })}>删除</button> },

          ]} />
        )}
      </section>

      <ConfirmDialog
        open={!!deletingFile}
        title="删除文件"
        message={`确定删除文件「${deletingFile?.name}」？\n\n⚠️ 删除文件将同时清除该项目已生成的需求、测试点、测试用例和自动化脚本。`}
        confirmLabel="删除"
        onConfirm={handleDelete}
        onCancel={() => setDeletingFile(null)}
      />
    </div>
  );
}

// ═══════════════════════════════════════
// 需求列表（解析 + 展示）
// ═══════════════════════════════════════

const truncateText = (text: string, maxLen = 50) => text.length > maxLen ? text.slice(0, maxLen) + "..." : text;

function RequirementsTab({ projectId }: { projectId: string }) {
  const { files, requirements, refresh, loading, initialLoading } = useProjectData(projectId);
  const { state, dispatch } = useStore();
  const parsing = useMemo(() => state.activeAITasks.includes("需求解析"), [state.activeAITasks]);
  const { showConfigError, dialog: configErrorDialog } = useConfigError();
  const [showReparseConfirm, setShowReparseConfirm] = useState(false);
  const [viewReq, setViewReq] = useState<typeof requirements[0] | null>(null);
  const [editReq, setEditReq] = useState<typeof requirements[0] | null>(null);
  const [editRule, setEditRule] = useState("");
  const [editQuestion, setEditQuestion] = useState("");
  const [deletingReq, setDeletingReq] = useState<{ id: string; name: string } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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
    try {
      const result = await startParseRequirements(projectId);
      if (result.success) {
        toast.success("需求解析完成！");
        await refresh();
        window.dispatchEvent(new CustomEvent("aitestlink:files-refresh", { detail: { projectId } }));
      } else if (result.error) {
        showConfigError(result.error);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "解析失败");
    }
  };

  const handleParse = async () => {
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
    doParse();
  };

  return (
    <div className="page-stack page-stack--spaced page-stack--fill">
      <SectionHeader title="需求列表" description="从上传的文档中解析需求，支持查看和确认。"
        actions={<>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
            <div style={{ display: "flex", gap: 8 }}>
              {selectedIds.size > 0 && <button className="ghost-button" type="button" onClick={() => setShowBatchApproveConfirm(true)}><CheckCircle2 size={13} /> 评审通过（{selectedIds.size}）</button>}
              <button className="primary-button" type="button" onClick={handleParse} disabled={parsing}>
                {parsing ? <Loader2 size={13} className="animate-spin" /> : <WandSparkles size={13} />}
                {parsing ? "解析中..." : "需求解析"}
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
      <Modal open={!!viewReq} onClose={() => setViewReq(null)} title="需求详情" width={520}>
        {viewReq && (
          <div className="detail-grid">
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
      <Modal open={!!editReq} onClose={() => setEditReq(null)} title="编辑需求" width={520}>
        {editReq && (
          <div className="detail-grid">
            <div className="detail-row"><span className="detail-label">模块</span><span>{editReq.module}</span></div>
            <div className="detail-row"><span className="detail-label">功能点</span><span>{editReq.feature}</span></div>
            <div className="detail-row"><span className="detail-label">来源</span><span>{editReq.source}</span></div>
            <div className="detail-row"><span className="detail-label">风险等级</span><StatusPill tone={editReq.risk === "高" ? "red" : editReq.risk === "中" ? "amber" : "green"}>{editReq.risk}</StatusPill></div>
            <div className="detail-row detail-row--full"><span className="detail-label">业务规则</span><textarea className="form-textarea" style={{ flex: 1 }} rows={3} value={editRule} onChange={(e) => setEditRule(e.target.value)} /></div>
            <div className="detail-row detail-row--full"><span className="detail-label">待确认问题</span><textarea className="form-textarea" style={{ flex: 1 }} rows={3} value={editQuestion} onChange={(e) => setEditQuestion(e.target.value)} /></div>
            <div className="detail-row"><span className="detail-label">生成时间</span><span>{formatTime(editReq.createdAt)}</span></div>
            <div className="detail-row"><span className="detail-label">更新时间</span><span>{formatTime(editReq.updatedAt)}</span></div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 12 }}>
              <button className="ghost-button" type="button" onClick={() => setEditReq(null)}>取消</button>
              <button className="primary-button" type="button" onClick={async () => {
                if (!editReq) return;
                try {
                  const updatedReq = await requirementsApi.update(editReq.id, { rule: editRule, question: editQuestion } as any);
                  dispatch({ type: "UPDATE_REQUIREMENT", payload: { ...editReq, rule: editRule, question: editQuestion, createdAt: updatedReq.createdAt, updatedAt: updatedReq.updatedAt } });
                  toast.success("保存成功");
                  setEditReq(null);
                } catch { toast.error("保存失败"); }
              }}>保存</button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog open={showReparseConfirm} title="重新解析" message="部分文件已解析完成，再次解析将覆盖之前的解析数据和需求，是否继续？" confirmLabel="继续解析" onConfirm={() => { setShowReparseConfirm(false); doParse(); }} onCancel={() => setShowReparseConfirm(false)} />
      <ConfirmDialog open={showBatchApproveConfirm} title="批量评审通过" message={`确定将选中的 ${selectedIds.size} 条需求标记为评审通过？`} confirmLabel="确认通过" onConfirm={() => { setShowBatchApproveConfirm(false); batchApprove(); }} onCancel={() => setShowBatchApproveConfirm(false)} />
      {configErrorDialog}

    </div>
  );
}

// ═══════════════════════════════════════
// 测试点（AI 生成 + 评审）
// ═══════════════════════════════════════

function TestPointsTab({ projectId }: { projectId: string }) {
  const { testPoints, files, requirements, refresh, refreshTestPoints, loading, initialLoading } = useProjectData(projectId);
  const { dispatch } = useStore();
  const { showConfigError, dialog: configErrorDialog } = useConfigError();
  const { loadingTestPoints, error, generateTestPoints } = useAIAction(projectId, showConfigError);
  const prevLoadingRef = useRef(loadingTestPoints);
  useEffect(() => { if (prevLoadingRef.current && !loadingTestPoints) { refreshTestPoints(); } prevLoadingRef.current = loadingTestPoints; }, [loadingTestPoints, refreshTestPoints]);
  const [moduleFilter, setModuleFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showGenerateConfirm, setShowGenerateConfirm] = useState(false);
  const [viewTP, setViewTP] = useState<typeof testPoints[0] | null>(null);
  const [editTP, setEditTP] = useState<typeof testPoints[0] | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");

  const hasPrerequisite = requirements.length > 0;
  const unreviewedReqCount = requirements.filter((r) => (r as any).reviewStatus !== "已通过").length;
  const handleGenerate = () => {
    if (!hasPrerequisite) { toast.warning("请先在「需求列表」页面完成需求解析"); return; }
    if (unreviewedReqCount > 0) { toast.warning(`还有 ${unreviewedReqCount} 条需求未评审通过，请先完成需求评审`); return; }
    if (testPoints.length > 0) { setShowGenerateConfirm(true); return; }
    generateTestPoints();
  };
  const modules = useMemo(() => Array.from(new Set(testPoints.map((tp) => tp.module))), [testPoints]);
  const filtered = useMemo(() => moduleFilter === "all" ? testPoints : testPoints.filter((tp) => tp.module === moduleFilter), [testPoints, moduleFilter]);
  const allSelected = filtered.length > 0 && filtered.every((tp) => selectedIds.has(tp.id));
  const toggleSelectAll = () => setSelectedIds(allSelected ? new Set() : new Set(filtered.map((tp) => tp.id)));
  const toggleSelect = (id: string) => setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleReview = async (tp: any) => {
    const newStatus = tp.reviewStatus === "已通过" ? "待评审" : "已通过";
    try { await testPointsApi.update(tp.id, { reviewStatus: newStatus } as any); } catch {}
    dispatch({ type: "UPDATE_TEST_POINT", payload: { ...tp, reviewStatus: newStatus } });
    await refreshTestPoints();
  };
  const [showBatchApproveConfirm, setShowBatchApproveConfirm] = useState(false);
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);
  const batchDelete = async () => {
    for (const id of selectedIds) { try { await testPointsApi.delete(id); } catch {} }
    selectedIds.forEach((id) => dispatch({ type: "DELETE_TEST_POINT", payload: id }));
    toast.success(`已删除 ${selectedIds.size} 个测试点`);
    setSelectedIds(new Set());
    await refreshTestPoints();
  };
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
      setEditTP(null);
    } catch {
      toast.error("保存失败");
    }
  };

  return (
    <div className="page-stack page-stack--spaced page-stack--fill">
      <SectionHeader title="测试点生成" description="AI 从文档中提取测试点，支持评审。"
        actions={<>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
            <div style={{ display: "flex", gap: 8 }}>
              {selectedIds.size > 0 && <button className="ghost-button" type="button" onClick={() => setShowBatchApproveConfirm(true)}><CheckCircle2 size={13} /> 评审通过（{selectedIds.size}）</button>}
              <button className="primary-button" type="button" onClick={handleGenerate} disabled={loadingTestPoints}>{loadingTestPoints ? <Loader2 size={13} className="animate-spin" /> : <WandSparkles size={13} />}{loadingTestPoints ? "生成中..." : "生成测试点"}</button>
            </div>
            <span style={{ color: "var(--muted)", fontSize: 12 }}>共 <strong style={{ color: "var(--text)" }}>{testPoints.length}</strong> 个测试点</span>
          </div>
        </>} />
      {error && <div className="error-banner"><span>{error}</span></div>}
      {modules.length > 0 && <div className="filter-bar"><span className="filter-label">模块筛选</span><select className="filter-select" value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)}><option value="all">全部模块</option>{modules.map((m) => <option key={m} value={m}>{m}</option>)}</select></div>}
      <section className="work-panel">
        {initialLoading && filtered.length === 0 ? <div className="empty-state"><Loader2 size={20} className="animate-spin" style={{ color: "var(--muted)" }} /><p style={{ marginTop: 8, color: "var(--muted)" }}>加载中...</p></div> : filtered.length === 0 ? <div className="empty-state"><p>暂无测试点</p></div> : (
          <DataTable rows={filtered} getRowKey={(r) => r.id} columns={[
            { key: "select", label: <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />, width: "40px", sticky: "left" as const, render: (r) => <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleSelect(r.id)} /> },
            { key: "id", label: "编号", render: (r) => r.id },
            { key: "module", label: "模块", render: (r) => r.module },
            { key: "type", label: "类型", render: (r) => r.type },
            { key: "title", label: "测试点", align: "left", render: (r) => r.title },
            { key: "priority", label: "优先级", align: "center", render: (r) => <StatusPill tone={priorityTone(r.priority)}>{r.priority}</StatusPill> },
            { key: "reviewStatus", label: "评审", align: "center", render: (r) => <button type="button" className="text-button" onClick={() => toggleReview(r)}><StatusPill tone={reviewTone(r.reviewStatus)}>{r.reviewStatus}</StatusPill></button> },
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
      <Modal open={!!viewTP} onClose={() => setViewTP(null)} title="测试点详情" width={520}>
        {viewTP && (
          <div className="detail-grid">
            <div className="detail-row"><span className="detail-label">编号</span><span>{viewTP.id}</span></div>
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
      <Modal open={!!editTP} onClose={() => setEditTP(null)} title="编辑测试点" width={520}>
        {editTP && (
          <div className="detail-grid">
            <div className="detail-row"><span className="detail-label">编号</span><span>{editTP.id}</span></div>
            <div className="detail-row"><span className="detail-label">模块</span><span>{editTP.module}</span></div>
            <div className="detail-row"><span className="detail-label">类型</span><span>{editTP.type}</span></div>
            <div className="detail-row"><span className="detail-label">优先级</span><StatusPill tone={priorityTone(editTP.priority)}>{editTP.priority}</StatusPill></div>
            <div className="detail-row"><span className="detail-label">评审状态</span><StatusPill tone={reviewTone(editTP.reviewStatus)}>{editTP.reviewStatus}</StatusPill></div>
            <div className="detail-row detail-row--full"><span className="detail-label">测试点</span><input className="form-input" style={{ flex: 1 }} value={editTitle} onChange={(e) => setEditTitle(e.target.value)} /></div>
            <div className="detail-row detail-row--full"><span className="detail-label">描述</span><textarea className="form-textarea" style={{ flex: 1 }} rows={4} value={editDesc} onChange={(e) => setEditDesc(e.target.value)} /></div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 12 }}>
              <button className="ghost-button" type="button" onClick={() => setEditTP(null)}>取消</button>
              <button className="primary-button" type="button" onClick={handleSaveEdit}>保存</button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog open={showGenerateConfirm} title="重新生成测试点" message={`当前已有 ${testPoints.length} 个测试点，再次生成将覆盖之前的数据，是否继续？`} confirmLabel="继续生成" onConfirm={() => { setShowGenerateConfirm(false); generateTestPoints(); }} onCancel={() => setShowGenerateConfirm(false)} />
      <ConfirmDialog open={showBatchApproveConfirm} title="批量评审通过" message={`确定将选中的 ${selectedIds.size} 个测试点标记为评审通过？`} confirmLabel="确认通过" onConfirm={() => { setShowBatchApproveConfirm(false); batchApprove(); }} onCancel={() => setShowBatchApproveConfirm(false)} />
      {configErrorDialog}

    </div>
  );
}

// ═══════════════════════════════════════
// 测试用例（AI 生成 + 评审）
// ═══════════════════════════════════════

function TestCasesTab({ projectId }: { projectId: string }) {
  const { project, testCases, testPoints, refresh, refreshTestCases, refreshTestPoints, loading, initialLoading } = useProjectData(projectId);
  const { dispatch } = useStore();
  const { showConfigError, dialog: configErrorDialog } = useConfigError();
  const { loadingTestCases, loadingReview, error, generateTestCases, reviewTestCases } = useAIAction(projectId, showConfigError);
  const prevLoadingRef = useRef(loadingTestCases);
  useEffect(() => { if (prevLoadingRef.current && !loadingTestCases) { refreshTestCases(); setReviewResult(null); setShowReviewResult(false); } prevLoadingRef.current = loadingTestCases; }, [loadingTestCases, refreshTestCases]);
  const [detailCase, setDetailCase] = useState<TestCase | null>(null);
  const [editCase, setEditCase] = useState<TestCase | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editSteps, setEditSteps] = useState("");
  const [editExpected, setEditExpected] = useState("");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showGenerateConfirm, setShowGenerateConfirm] = useState(false);
  const [showBatchApproveConfirm, setShowBatchApproveConfirm] = useState(false);
  const busy = loadingTestCases || loadingReview;
  const [reviewResult, setReviewResult] = useState<any>(null);
  const [showReviewResult, setShowReviewResult] = useState(false);

  // 组件挂载时加载最近一次评审结果
  useEffect(() => {
    (async () => {
      try {
        const tasks = await aiApi.listTasks(projectId);
        const latestReview = tasks.find((t: any) => t.type === "用例评审" && t.status === "成功");
        if (latestReview && latestReview.result) {
          const parsed = typeof latestReview.result === "string" ? JSON.parse(latestReview.result) : latestReview.result;
          setReviewResult(parsed);
        }
      } catch {}
    })();
  }, [projectId]);

  const handleAIReview = async () => {
    if (testCases.length === 0) { toast.warning("暂无测试用例，请先生成"); return; }
    const result = await reviewTestCases();
    if (result.success) {
      try {
        const tasks = await aiApi.listTasks(projectId);
        const latestReview = tasks.find((t: any) => t.type === "用例评审" && t.status === "成功");
        if (latestReview && latestReview.result) {
          const parsed = typeof latestReview.result === "string" ? JSON.parse(latestReview.result) : latestReview.result;
          setReviewResult(parsed);
          setShowReviewResult(true);
        }
      } catch {}
    }
  };

  const hasPrerequisite = testPoints.length > 0;
  const unreviewedTPCount = testPoints.filter((tp) => tp.reviewStatus !== "已通过").length;
  const handleGenerate = () => {
    if (!hasPrerequisite) { toast.warning("请先生成测试点"); return; }
    if (unreviewedTPCount > 0) { toast.warning(`还有 ${unreviewedTPCount} 个测试点未评审通过，请先完成测试点评审`); return; }
    if (testCases.length > 0) { setShowGenerateConfirm(true); return; }
    generateTestCases();
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
      setEditCase(null);
    } catch {
      toast.error("保存失败");
    }
  };

  const handleExportManual = () => {
    if (testCases.length === 0) { toast.warning("暂无测试用例，请先生成用例"); return; }
    const manualCases = testCases.filter((tc) => tc.automation !== "适合");
    if (manualCases.length === 0) { toast.warning("所有用例均标记为自动化，暂无可导出的手动用例"); return; }
    exportManualTestCasesToExcel(manualCases, project?.name || "未命名项目");
    toast.success(`已导出 ${manualCases.length} 条手动测试用例`);
  };

  return (
    <div className="page-stack page-stack--spaced page-stack--fill">
      <SectionHeader title="用例生成" description="从测试点生成可执行用例，支持评审。"
        actions={<>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
            <div style={{ display: "flex", gap: 8 }}>
              {selectedIds.size > 0 && <button className="ghost-button" type="button" disabled={busy} onClick={() => setShowBatchApproveConfirm(true)}><CheckCircle2 size={13} /> 评审通过（{selectedIds.size}）</button>}
              <button className="ghost-button" type="button" disabled={busy} onClick={() => { if (!reviewResult) { toast.warning("暂无评审报告，请先执行 AI 评审"); return; } setShowReviewResult(true); }}><Eye size={13} /> 查看评审报告</button>
              <button className="primary-button" type="button" onClick={handleAIReview} disabled={busy}>{loadingReview ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}{loadingReview ? "评审中..." : "AI 评审"}</button>
              <button className="primary-button" type="button" onClick={handleExportManual} disabled={busy}><Download size={13} /> 导出手动测试用例</button>
              <button className="primary-button" type="button" onClick={handleGenerate} disabled={busy}>{loadingTestCases ? <Loader2 size={13} className="animate-spin" /> : <WandSparkles size={13} />}{loadingTestCases ? "生成中..." : "生成用例"}</button>
            </div>
            <span style={{ color: "var(--muted)", fontSize: 12 }}>共 <strong style={{ color: "var(--text)" }}>{testCases.length}</strong> 条用例</span>
          </div>
        </>} />
      {error && <div className="error-banner"><span>{error}</span></div>}
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
            { key: "priority", label: "优先级", align: "center", render: (r) => <StatusPill tone={priorityTone(r.priority)}>{r.priority}</StatusPill> },
            { key: "steps", label: "测试步骤", align: "left", render: (r) => <span title={r.steps}>{truncateText(r.steps, 40)}</span> },
            { key: "expectedResult", label: "预期结果", align: "left", render: (r) => <span title={r.expectedResult}>{truncateText(r.expectedResult, 35)}</span> },
            { key: "reviewStatus", label: "评审", align: "center", render: (r) => <button type="button" className="text-button" onClick={() => toggleReview(r)}><StatusPill tone={reviewTone(r.reviewStatus)}>{r.reviewStatus}</StatusPill></button> },
            { key: "automation", label: "是否自动化", align: "center", render: (r) => <StatusPill tone={r.automation === "适合" ? "green" : "slate"}>{r.automation === "适合" ? "适合" : "不适合"}</StatusPill> },
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
      <Modal open={!!editCase} onClose={() => setEditCase(null)} title="编辑用例" width={520}>
        {editCase && (
          <div className="detail-grid">
            <div className="detail-row"><span className="detail-label">用例编号</span><span>{editCase.caseCode}</span></div>
            <div className="detail-row"><span className="detail-label">模块</span><span>{editCase.module}</span></div>
            <div className="detail-row detail-row--full"><span className="detail-label">测试点</span><span>{editCase.feature}</span></div>
            <div className="detail-row detail-row--full"><span className="detail-label">用例标题</span><input className="form-input" style={{ flex: 1 }} value={editTitle} onChange={(e) => setEditTitle(e.target.value)} /></div>
            <div className="detail-row"><span className="detail-label">优先级</span><StatusPill tone={priorityTone(editCase.priority)}>{editCase.priority}</StatusPill></div>
            <div className="detail-row"><span className="detail-label">评审状态</span><StatusPill tone={reviewTone(editCase.reviewStatus)}>{editCase.reviewStatus}</StatusPill></div>
            <div className="detail-row"><span className="detail-label">是否自动化</span><span>{editCase.automation === "适合" ? "是" : "否"}</span></div>
            <div className="detail-row detail-row--full"><span className="detail-label">测试步骤</span><textarea className="form-textarea" style={{ flex: 1 }} rows={4} value={editSteps} onChange={(e) => setEditSteps(e.target.value)} /></div>
            <div className="detail-row detail-row--full"><span className="detail-label">预期结果</span><textarea className="form-textarea" style={{ flex: 1 }} rows={4} value={editExpected} onChange={(e) => setEditExpected(e.target.value)} /></div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 12 }}>
              <button className="ghost-button" type="button" onClick={() => setEditCase(null)}>取消</button>
              <button className="primary-button" type="button" onClick={handleSaveEdit}>保存</button>
            </div>
          </div>
        )}
      </Modal>

      {/* AI 评审结果弹窗 */}
      <Modal open={showReviewResult} onClose={() => setShowReviewResult(false)} title="AI 用例评审报告" width={640}>
        {reviewResult && (
          <div className="review-report">
            <div className="review-score-section" style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 20, padding: 16, background: "var(--bg-secondary)", borderRadius: 8 }}>
              <div style={{ fontSize: 48, fontWeight: 700, color: reviewResult.overallScore >= 80 ? "var(--green)" : reviewResult.overallScore >= 60 ? "var(--amber)" : "var(--red)" }}>{reviewResult.overallScore ?? "-"}</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>总体评分</div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{reviewResult.overallLevel ?? ""}</div>
              </div>
            </div>
            {reviewResult.summary && <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16 }}>{reviewResult.summary}</p>}
            {Array.isArray(reviewResult.dimensions) && reviewResult.dimensions.map((dim: any, i: number) => (
              <div key={i} style={{ marginBottom: 12, padding: 12, border: "1px solid var(--border)", borderRadius: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{dim.name}</span>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{dim.score}/5</span>
                </div>
                {Array.isArray(dim.issues) && dim.issues.length > 0 && (
                  <div style={{ marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--red)" }}>问题：</span>
                    {dim.issues.map((issue: string, j: number) => <div key={j} style={{ fontSize: 12, color: "var(--text-secondary)", paddingLeft: 8 }}>• {issue}</div>)}
                  </div>
                )}
                {Array.isArray(dim.suggestions) && dim.suggestions.length > 0 && (
                  <div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--green)" }}>建议：</span>
                    {dim.suggestions.map((sug: string, j: number) => <div key={j} style={{ fontSize: 12, color: "var(--text-secondary)", paddingLeft: 8 }}>• {sug}</div>)}
                  </div>
                )}
              </div>
            ))}
            {Array.isArray(reviewResult.mustFix) && reviewResult.mustFix.length > 0 && (
              <div style={{ marginTop: 12, padding: 12, background: "#fef2f2", borderRadius: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--red)", marginBottom: 4 }}>必须修复</div>
                {reviewResult.mustFix.map((item: string, i: number) => <div key={i} style={{ fontSize: 12, paddingLeft: 8 }}>• {item}</div>)}
              </div>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog open={showGenerateConfirm} title="重新生成用例" message={`当前已有 ${testCases.length} 条用例，再次生成将覆盖之前的数据，是否继续？`} confirmLabel="继续生成" onConfirm={() => { setShowGenerateConfirm(false); generateTestCases(); }} onCancel={() => setShowGenerateConfirm(false)} />

      <ConfirmDialog open={showBatchApproveConfirm} title="批量评审通过" message={`确定将选中的 ${selectedIds.size} 条用例标记为评审通过？`} confirmLabel="确认通过" onConfirm={() => { setShowBatchApproveConfirm(false); batchApprove(); }} onCancel={() => setShowBatchApproveConfirm(false)} />
      {configErrorDialog}
    </div>
  );
}

// ═══════════════════════════════════════
// 自动化脚本（只读）
// ═══════════════════════════════════════

function ScriptsTab({ projectId }: { projectId: string }) {
  const { testCases, scripts, refresh, refreshScripts, loading, initialLoading } = useProjectData(projectId);
  const { dispatch } = useStore();
  const { showConfigError, dialog: configErrorDialog } = useConfigError();
  const [generating, setGenerating] = useState(false);
  const [showGenerateConfirm, setShowGenerateConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewScript, setViewScript] = useState<AutomationScript | null>(null);
  const [editScript, setEditScript] = useState<AutomationScript | null>(null);
  const [editCode, setEditCode] = useState("");
  const [deletingScript, setDeletingScript] = useState<{ id: string; name: string } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);
  const [showBatchApproveConfirm, setShowBatchApproveConfirm] = useState(false);

  const automatable = useMemo(() => testCases.filter((tc) => tc.automation === "适合"), [testCases]);
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
      const script = scripts.find((s) => s.testCaseId === id);
      if (script && (script as any).reviewStatus !== "已通过") {
        try { await scriptsApi.update(script.id, { reviewStatus: "已通过" } as any); } catch {}
        dispatch({ type: "UPDATE_SCRIPT", payload: { ...script, reviewStatus: "已通过" } as any });
      }
    }
    toast.success(`已通过 ${selectedIds.size} 个脚本`);
    setSelectedIds(new Set());
    await refreshScripts();
  };

  const handleGenerate = async () => {
    if (!hasPrerequisite) { toast.warning("请先生成测试用例并标记适合自动化的用例"); return; }
    if (unreviewedTCCount > 0) { toast.warning(`还有 ${unreviewedTCCount} 条用例未评审通过，请先完成用例评审`); return; }
    // 检查模型配置 + 连通性
    try {
      const config = await aiApi.checkConfig(projectId, "脚本生成");
      if (!config.configured) {
        showConfigError(config.message || "模型未配置，请先在模型配置中设置");
        return;
      }
      if (config.configId) {
        const test = await modelConfigApi.test(config.configId);
        if (!test.ok) {
          showConfigError(test.message || "模型连通测试失败");
          return;
        }
      }
    } catch { /* 配置检查失败，继续尝试（后端会再次校验） */ }
    setGenerating(true);
    setError(null);
    try {
      const result = await scriptsApi.generate(projectId);
      if (result.ok && result.scripts) {
        dispatch({ type: "CLEAR_SCRIPTS", payload: projectId });
        result.scripts.forEach((s) => dispatch({ type: "ADD_SCRIPT", payload: {
          id: s.id, projectId: s.projectId, testCaseId: s.testCaseId ?? undefined,
          scriptType: s.scriptType as AutomationScript["scriptType"],
          framework: s.framework as AutomationScript["framework"],
          language: s.language, code: s.code,
          status: s.status as AutomationScript["status"],
          generatedByAi: s.generatedByAi,
          createdAt: s.createdAt, updatedAt: s.updatedAt,
        }}));
        toast.success(`成功生成 ${result.count} 个自动化脚本`);
        await refreshScripts();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "生成失败";
      setError(msg);
      toast.error(msg);
    } finally {
      setGenerating(false);
      setShowGenerateConfirm(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editScript) return;
    try {
      const updated = await scriptsApi.update(editScript.id, { code: editCode });
      dispatch({ type: "UPDATE_SCRIPT", payload: {
        ...editScript, code: updated.code, updatedAt: updated.updatedAt,
      } as AutomationScript });
      toast.success("保存成功");
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
                if (unreviewedTCCount > 0) { toast.warning(`还有 ${unreviewedTCCount} 条用例未评审通过，请先完成用例评审`); return; }
                if (existingScriptCount > 0) { setShowGenerateConfirm(true); return; }
                handleGenerate();
              }} disabled={generating}>
                {generating ? <Loader2 size={13} className="animate-spin" /> : <Code size={13} />}
                {generating ? "生成中..." : "生成自动化脚本"}
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
      {viewScript && (
        <div className="confirm-overlay" onClick={() => setViewScript(null)}>
          <div className="confirm-dialog" style={{ width: 700, maxWidth: "90vw" }} onClick={(e) => e.stopPropagation()}>
            <div className="confirm-dialog__body" style={{ flexDirection: "column", gap: 12 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>脚本代码 - {viewScript.framework}</h3>
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
                maxHeight: 400,
                margin: 0,
              }}>
                {viewScript.code || "// 暂无代码"}
              </pre>
            </div>
            <div className="confirm-dialog__actions">
              <button className="ghost-button" type="button" onClick={() => setViewScript(null)}>关闭</button>
            </div>
          </div>
        </div>
      )}

      {/* 编辑脚本弹窗 */}
      {editScript && (
        <div className="confirm-overlay" onClick={() => setEditScript(null)}>
          <div className="confirm-dialog" style={{ width: 700, maxWidth: "90vw" }} onClick={(e) => e.stopPropagation()}>
            <div className="confirm-dialog__body" style={{ flexDirection: "column", gap: 12 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>编辑脚本 - {editScript.framework}</h3>
              <textarea
                value={editCode}
                onChange={(e) => setEditCode(e.target.value)}
                style={{
                  width: "100%",
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
                }}
              />
            </div>
            <div className="confirm-dialog__actions">
              <button className="ghost-button" type="button" onClick={() => setEditScript(null)}>取消</button>
              <button className="primary-button" type="button" onClick={handleSaveEdit}>保存</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog open={showGenerateConfirm} title="重新生成脚本" message={`当前已有 ${existingScriptCount} 个脚本，再次生成将覆盖之前的数据，是否继续？`} confirmLabel="继续生成" confirmLoading={generating} onConfirm={() => { setShowGenerateConfirm(false); handleGenerate(); }} onCancel={() => setShowGenerateConfirm(false)} />
      <ConfirmDialog open={showBatchApproveConfirm} title="批量评审通过" message={`确定将选中的 ${selectedIds.size} 个脚本标记为评审通过？`} confirmLabel="确认通过" onConfirm={() => { setShowBatchApproveConfirm(false); batchApprove(); }} onCancel={() => setShowBatchApproveConfirm(false)} />
      {configErrorDialog}

    </div>
  );
}

// ═══════════════════════════════════════
// 执行脚本
// ═══════════════════════════════════════

function ExecuteScriptsTab({ projectId }: { projectId: string }) {
  const { scripts, testCases, refreshScripts, loading, initialLoading } = useProjectData(projectId);
  const { dispatch } = useStore();
  const [viewScript, setViewScript] = useState<AutomationScript | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [runningAll, setRunningAll] = useState(false);

  const allSelected = scripts.length > 0 && scripts.every((s) => selectedIds.has(s.id));
  const toggleSelectAll = () => setSelectedIds(allSelected ? new Set() : new Set(scripts.map((s) => s.id)));
  const toggleSelect = (id: string) => setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const unreviewedScriptCount = scripts.filter((s) => (s as any).reviewStatus !== "已通过").length;

  const runAll = async () => {
    if (scripts.length === 0) { toast.warning("请先在「自动化脚本」页面生成脚本"); return; }
    if (unreviewedScriptCount > 0) { toast.warning(`还有 ${unreviewedScriptCount} 个脚本未评审通过，请先完成脚本评审后再执行`); return; }
    setRunningAll(true);
    for (const script of scripts) {
      if (script.status === "成功") continue;
      dispatch({ type: "UPDATE_SCRIPT", payload: { ...script, status: "执行中" } });
      await new Promise((r) => setTimeout(r, 1000));
      const success = Math.random() > 0.3;
      const now = new Date().toISOString();
      dispatch({ type: "UPDATE_SCRIPT", payload: { ...script, status: success ? "成功" : "失败", executedAt: now } });
      toast[success ? "success" : "error"](`${script.scriptCode || script.id.slice(0, 8)} ${success ? "执行成功" : "执行失败"}`);
    }
    setRunningAll(false);
  };

  const handleRun = async (script: AutomationScript) => {
    if ((script as any).reviewStatus !== "已通过") { toast.warning("该脚本未评审通过，请先在「自动化脚本」页面完成评审"); return; }
    setRunningId(script.id);
    dispatch({ type: "UPDATE_SCRIPT", payload: { ...script, status: "执行中" } });
    setTimeout(() => {
      const success = Math.random() > 0.3;
      const now = new Date().toISOString();
      dispatch({ type: "UPDATE_SCRIPT", payload: { ...script, status: success ? "成功" : "失败", executedAt: now } });
      setRunningId(null);
      toast[success ? "success" : "error"](`脚本 ${script.scriptCode || script.id.slice(0, 8)} ${success ? "执行成功" : "执行失败"}`);
    }, 2000);
  };

  const getTestCaseTitle = (testCaseId: string | null | undefined) => {
    if (!testCaseId) return "-";
    const tc = testCases.find((t) => t.id === testCaseId);
    return tc ? tc.title : "-";
  };

  // 模拟执行结果数据
  const getMockResults = (script: AutomationScript) => {
    const passed = script.status === "成功";
    return {
      duration: `${(Math.random() * 8 + 1).toFixed(1)}s`,
      steps: [
        { name: "打开页面", status: "通过" as const, time: "0.3s" },
        { name: "填写表单", status: passed ? ("通过" as const) : ("失败" as const), time: "1.2s" },
        { name: "提交数据", status: "通过" as const, time: "0.8s" },
        { name: "验证结果", status: passed ? ("通过" as const) : ("失败" as const), time: "0.5s" },
      ],
      screenshots: passed
        ? ["页面加载完成", "表单填写成功", "提交确认页面"]
        : ["页面加载完成", "表单填写失败 - 元素未找到"],
      errors: passed ? [] : ["TimeoutError: 等待元素 #submit-btn 超时 (30s)", "ElementNotFound: 无法定位 XPath //div[@class='result']"],
    };
  };

  return (
    <div className="page-stack page-stack--spaced page-stack--fill">
      <SectionHeader title="执行脚本" description="管理和执行已生成的自动化脚本。"
        actions={<>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="primary-button" type="button" onClick={runAll} disabled={runningAll}>
                {runningAll ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                {runningAll ? "执行中..." : "全部执行"}
              </button>
            </div>
            <span style={{ color: "var(--muted)", fontSize: 12 }}>共 <strong style={{ color: "var(--text)" }}>{scripts.length}</strong> 个脚本</span>
          </div>
        </>} />
      <section className="work-panel">
        {initialLoading && scripts.length === 0 ? (
          <div className="empty-state"><Loader2 size={20} className="animate-spin" style={{ color: "var(--muted)" }} /><p style={{ marginTop: 8, color: "var(--muted)" }}>加载中...</p></div>
        ) : scripts.length === 0 ? (
          <div className="empty-state">
            <p>暂无脚本，请先在「自动化脚本」页面生成脚本</p>
          </div>
        ) : (
          <DataTable rows={scripts} getRowKey={(r) => r.id} columns={[
            { key: "select", label: <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />, width: "40px", sticky: "left" as const, render: (r) => <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleSelect(r.id)} /> },
            { key: "scriptCode", label: "脚本编号", render: (r) => r.scriptCode || <span style={{ color: "var(--muted)" }}>-</span> },
            { key: "testCase", label: "关联用例", align: "left", render: (r) => getTestCaseTitle(r.testCaseId) },
            { key: "testType", label: "测试类型", align: "center", render: (r) => {
              const tc = testCases.find((t) => t.id === r.testCaseId);
              return tc ? (tc.testType || "功能测试") : <span style={{ color: "var(--muted)" }}>-</span>;
            }},
            { key: "framework", label: "框架", render: (r) => r.framework },
            { key: "scriptType", label: "脚本类型", render: (r) => r.scriptType },
            { key: "status", label: "状态", align: "center", render: (r) => (
              <StatusPill tone={r.status === "成功" ? "green" : r.status === "失败" ? "red" : r.status === "执行中" ? "blue" : "slate"}>
                {r.status}
              </StatusPill>
            )},
            { key: "review", label: "评审", align: "center", render: (r) => {
              const rev = (r as any).reviewStatus || "待评审";
              return <StatusPill tone={rev === "已通过" ? "green" : "slate"}>{rev}</StatusPill>;
            }},
            { key: "executedAt", label: "执行时间", render: (r) => r.executedAt ? formatTime(r.executedAt) : <span style={{ color: "var(--muted)" }}>-</span> },
            { key: "actions", label: "操作", width: "120px", sticky: "right" as const, align: "center", render: (r) => (
              <div className="inline-actions">
                <button className="text-button" type="button" onClick={() => handleRun(r)} disabled={runningId === r.id}>
                  {runningId === r.id ? "执行中" : "执行"}
                </button>
                <button className="text-button" type="button" onClick={() => setViewScript(r)}>查看</button>
              </div>
            )},
          ]} />
        )}
      </section>

      {/* 执行结果查看弹窗 */}
      {viewScript && (() => {
        const results = getMockResults(viewScript);
        return (
          <div className="confirm-overlay" onClick={() => setViewScript(null)}>
            <div className="confirm-dialog" style={{ width: 780, maxWidth: "92vw", maxHeight: "85vh" }} onClick={(e) => e.stopPropagation()}>
              <div className="confirm-dialog__body" style={{ flexDirection: "column", gap: 16, overflow: "auto" }}>
                {/* 头部：脚本信息 + 总体状态 */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>执行结果 - {viewScript.framework}</h3>
                    <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--muted)" }}>
                      脚本 ID: {viewScript.id.slice(0, 8)} | 脚本类型: {viewScript.scriptType}
                      {(() => { const tc = testCases.find((t) => t.id === viewScript.testCaseId); return tc ? <> | 测试类型: {tc.testType || "功能测试"}</> : null; })()}
                    </p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>执行时间</div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{viewScript.executedAt ? formatTime(viewScript.executedAt) : "未执行"}</div>
                    </div>
                    <StatusPill tone={viewScript.status === "成功" ? "green" : viewScript.status === "失败" ? "red" : "slate"}>
                      {viewScript.status}
                    </StatusPill>
                  </div>
                </div>

                {/* 执行耗时 */}
                <div style={{ display: "flex", gap: 16 }}>
                  <div style={{ flex: 1, padding: 12, background: "var(--bg-secondary)", borderRadius: 8 }}>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>执行耗时</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text)" }}>{results.duration}</div>
                  </div>
                  <div style={{ flex: 1, padding: 12, background: "var(--bg-secondary)", borderRadius: 8 }}>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>步骤统计</div>
                    <div style={{ fontSize: 20, fontWeight: 700 }}>
                      <span style={{ color: "var(--green)" }}>{results.steps.filter((s) => s.status === "通过").length}</span>
                      <span style={{ color: "var(--muted)", fontSize: 14 }}> / {results.steps.length}</span>
                    </div>
                  </div>
                </div>

                {/* 步骤详情 */}
                <div>
                  <h4 style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600 }}>执行步骤</h4>
                  <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                    {results.steps.map((step, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", padding: "8px 12px", borderBottom: i < results.steps.length - 1 ? "1px solid var(--border)" : "none", gap: 10 }}>
                        <StatusPill tone={step.status === "通过" ? "green" : "red"}>{step.status}</StatusPill>
                        <span style={{ flex: 1, fontSize: 13 }}>{step.name}</span>
                        <span style={{ fontSize: 12, color: "var(--muted)" }}>{step.time}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 截图/快照 */}
                <div>
                  <h4 style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600 }}>执行截图</h4>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
                    {results.screenshots.map((desc, i) => (
                      <div key={i} style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                        <div style={{ height: 120, background: "linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-tertiary, var(--bg-secondary)) 100%)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)", fontSize: 12 }}>
                          截图 {i + 1}
                        </div>
                        <div style={{ padding: "6px 10px", fontSize: 12, color: "var(--text-secondary)" }}>{desc}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 错误信息 */}
                {results.errors.length > 0 && (
                  <div>
                    <h4 style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "var(--red)" }}>错误日志</h4>
                    <pre style={{ background: "#1e1e2e", color: "#f38ba8", padding: 12, borderRadius: 8, fontSize: 12, lineHeight: 1.6, margin: 0, overflow: "auto", maxHeight: 150 }}>
                      {results.errors.join("\n")}
                    </pre>
                  </div>
                )}

                {/* 脚本代码 */}
                <div>
                  <h4 style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600 }}>脚本代码</h4>
                  <pre style={{ background: "#1e1e2e", color: "#cdd6f4", padding: 12, borderRadius: 8, fontSize: 12, lineHeight: 1.6, margin: 0, overflow: "auto", maxHeight: 200 }}>
                    {viewScript.code || "// 暂无代码"}
                  </pre>
                </div>
              </div>
              <div className="confirm-dialog__actions">
                <button className="ghost-button" type="button" onClick={() => setViewScript(null)}>关闭</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ═══════════════════════════════════════
// 测试汇总
// ═══════════════════════════════════════

function SummaryTab({ projectId }: { projectId: string }) {
  const { files, testPoints, testCases, refresh, loading, initialLoading } = useProjectData(projectId);

  // 判断用例是否通过：实测结果与预期结果一致
  const isCasePassed = (c: ApiTestCase) => {
    if (!c.actualResult || !c.actualResult.trim()) return false;
    return c.actualResult.trim() === (c.expectedResult || "").trim();
  };
  const isCaseFailed = (c: ApiTestCase) => {
    if (!c.actualResult || !c.actualResult.trim()) return false;
    return c.actualResult.trim() !== (c.expectedResult || "").trim();
  };

  const total = testCases.length;
  const passed = testCases.filter(isCasePassed).length;
  const failed = testCases.filter(isCaseFailed).length;
  const unexecuted = testCases.filter((c) => !c.actualResult || !c.actualResult.trim()).length;
  const passRate = total > 0 ? Math.round(passed / total * 100) : 0;
  const isPass = passRate >= 80 && failed === 0;
  const autoCount = testCases.filter((c) => c.automation === "适合").length;

  // 按模块统计
  const modules = useMemo(() => {
    const map = new Map<string, { total: number; passed: number; failed: number; unexecuted: number }>();
    testCases.forEach((c) => {
      const m = map.get(c.module) || { total: 0, passed: 0, failed: 0, unexecuted: 0 };
      m.total++;
      if (isCasePassed(c)) m.passed++;
      else if (isCaseFailed(c)) m.failed++;
      else m.unexecuted++;
      map.set(c.module, m);
    });
    return Array.from(map.entries()).map(([name, data]) => ({
      name, ...data,
      rate: data.total > 0 ? Math.round(data.passed / data.total * 100) : 0,
    }));
  }, [testCases]);

  // 按优先级统计
  const priorities = useMemo(() => {
    const map = new Map<string, { total: number; passed: number; failed: number }>();
    const order = ["P0", "P1", "P2", "P3"];
    testCases.forEach((c) => {
      const p = map.get(c.priority) || { total: 0, passed: 0, failed: 0 };
      p.total++;
      if (isCasePassed(c)) p.passed++;
      else if (isCaseFailed(c)) p.failed++;
      map.set(c.priority, p);
    });
    return Array.from(map.entries())
      .map(([name, data]) => ({ name, ...data, rate: data.total > 0 ? Math.round(data.passed / data.total * 100) : 0 }))
      .sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
  }, [testCases]);

  const toneForRate = (r: number) => r >= 80 ? "green" : r >= 50 ? "amber" : "red";

  return (
    <div className="page-stack page-stack--spaced page-stack--fill">
      {/* 测试结论 */}
      <div style={{ padding: 20, borderRadius: 8, background: isPass ? "#f0fdf4" : "#fef2f2", border: `1px solid ${isPass ? "#bbf7d0" : "#fecaca"}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <StatusPill tone={isPass ? "green" : "red"}>{isPass ? "测试通过" : "测试未通过"}</StatusPill>
          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            用例通过率 <strong>{passRate}%</strong>（{passed}/{total}）
            {!isPass && passRate < 80 && `，低于 80% 阈值`}
          </span>
        </div>
        {!isPass && <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)" }}>存在 {failed} 条失败用例和 {unexecuted} 条未执行用例，建议排查后重新执行。</p>}
      </div>

      {/* 核心指标 */}
      <div className="dash-stats" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        {[
          { label: "用例总数", value: total },
          { label: "通过", value: passed, sub: `${passRate}%`, color: "var(--green)" },
          { label: "失败", value: failed, sub: failed > 0 ? "需排查" : "", color: "var(--red)" },
          { label: "未执行", value: unexecuted, sub: unexecuted > 0 ? "待执行" : "", color: "var(--amber)" },
        ].map((s) => <div className="dash-stat-card" key={s.label}><div className="dash-stat-body"><span className="dash-stat-label">{s.label}</span><strong className="dash-stat-value" style={s.color ? { color: s.color } : undefined}>{s.value}</strong>{s.sub && <span className="dash-stat-sub">{s.sub}</span>}</div></div>)}
      </div>

      {/* 模块通过率 + 优先级通过率 并排 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, flex: 1 }}>
        {/* 模块通过率 */}
        <section className="work-panel" style={{ display: "flex", flexDirection: "column" }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 12px" }}>模块通过率</h3>
          {initialLoading && modules.length === 0 ? <div className="empty-state"><Loader2 size={20} className="animate-spin" style={{ color: "var(--muted)" }} /><p style={{ marginTop: 8, color: "var(--muted)" }}>加载中...</p></div> : modules.length === 0 ? <div className="empty-state"><p>暂无数据</p></div> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
              {modules.map((m) => (
                <div key={m.name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 80, fontSize: 13, flexShrink: 0, textAlign: "right", fontWeight: 500 }}>{m.name}</span>
                  <div style={{ flex: 1, height: 12, background: "var(--line)", borderRadius: 999, overflow: "hidden", display: "flex" }}>
                    {m.total > 0 && (
                      <>
                        <div style={{ width: `${(m.passed / m.total) * 100}%`, height: "100%", background: "var(--green)", borderRadius: "5px 0 0 5px", transition: "width 0.3s" }} />
                        <div style={{ width: `${(m.failed / m.total) * 100}%`, height: "100%", background: "var(--red)", transition: "width 0.3s" }} />
                      </>
                    )}
                  </div>
                  <span style={{ width: 46, fontSize: 12, color: "var(--text-secondary)", textAlign: "right", flexShrink: 0 }}>{m.passed}/{m.total}</span>
                  <StatusPill tone={toneForRate(m.rate)}>{m.rate}%</StatusPill>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 优先级通过率 */}
        <section className="work-panel" style={{ display: "flex", flexDirection: "column" }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 12px" }}>优先级通过率</h3>
          {initialLoading && priorities.length === 0 ? <div className="empty-state"><Loader2 size={20} className="animate-spin" style={{ color: "var(--muted)" }} /><p style={{ marginTop: 8, color: "var(--muted)" }}>加载中...</p></div> : priorities.length === 0 ? <div className="empty-state"><p>暂无数据</p></div> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
              {priorities.map((p) => (
                <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 80, fontSize: 13, flexShrink: 0, textAlign: "right", fontWeight: 500 }}>{p.name}</span>
                  <div style={{ flex: 1, height: 12, background: "var(--line)", borderRadius: 999, overflow: "hidden", display: "flex" }}>
                    {p.total > 0 && (
                      <>
                        <div style={{ width: `${(p.passed / p.total) * 100}%`, height: "100%", background: "var(--green)", borderRadius: "5px 0 0 5px", transition: "width 0.3s" }} />
                        <div style={{ width: `${(p.failed / p.total) * 100}%`, height: "100%", background: "var(--red)", transition: "width 0.3s" }} />
                      </>
                    )}
                  </div>
                  <span style={{ width: 46, fontSize: 12, color: "var(--text-secondary)", textAlign: "right", flexShrink: 0 }}>{p.passed}/{p.total}</span>
                  <StatusPill tone={toneForRate(p.rate)}>{p.rate}%</StatusPill>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* 补充信息 */}
      <div className="dash-stats" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        {[
          { label: "测试点", value: testPoints.length, sub: `通过 ${testPoints.filter((tp) => tp.reviewStatus === "已通过").length}` },
          { label: "自动化用例", value: autoCount, sub: `覆盖率 ${total > 0 ? Math.round(autoCount / total * 100) : 0}%` },
          { label: "需求文档", value: files.length },
        ].map((s) => <div className="dash-stat-card" key={s.label}><div className="dash-stat-body"><span className="dash-stat-label">{s.label}</span><strong className="dash-stat-value">{s.value}</strong>{s.sub && <span className="dash-stat-sub">{s.sub}</span>}</div></div>)}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
// 文档管理（只读）
// ═══════════════════════════════════════

function DocManageTab({ projectId }: { projectId: string }) {
  const { files, refresh, loading } = useProjectData(projectId);
  return (
    <div className="page-stack page-stack--spaced page-stack--fill">
      <SectionHeader title="项目文档" description="项目已上传的文档列表。" actions={<span style={{ color: "var(--muted)", fontSize: 12 }}>共 <strong style={{ color: "var(--text)" }}>{files.length}</strong> 个文件</span>} />
      <section className="work-panel">
        {files.length === 0 ? <div className="empty-state"><p>暂无文档</p></div> : (
          <DataTable rows={files} getRowKey={(r) => r.id} columns={[
            { key: "name", label: "文件名", align: "left", render: (r) => <strong>{r.name}</strong> },
            { key: "type", label: "类型", render: (r) => r.fileType },
            { key: "size", label: "大小", render: (r) => r.size },
            { key: "parseStatus", label: "解析状态", align: "center", render: (r) => <StatusPill tone={r.parseStatus === "已完成" ? "green" : r.parseStatus === "解析中" ? "blue" : "slate"}>{r.parseStatus}</StatusPill> },
            { key: "date", label: "上传时间", render: (r) => { const d = new Date(r.uploadedAt); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}:${String(d.getSeconds()).padStart(2,"0")}`; } },
          ]} />
        )}
      </section>
    </div>
  );
}

// ═══════════════════════════════════════
// 数据融合（上传手动结果 + 合并展示）
// ═══════════════════════════════════════

function DocFusionTab({ projectId }: { projectId: string }) {
  const { dispatch } = useStore();
  const { testCases, scripts } = useProjectData(projectId);
  const [manualResults, setManualResults] = useState<Record<string, string>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [viewCase, setViewCase] = useState<typeof testCases[0] | null>(null);
  const [editCase, setEditCase] = useState<typeof testCases[0] | null>(null);
  const [editActual, setEditActual] = useState("");
  const [showBatchApproveConfirm, setShowBatchApproveConfirm] = useState(false);

  const allSelected = testCases.length > 0 && testCases.every((tc) => selectedIds.has(tc.id));
  const toggleSelectAll = () => setSelectedIds(allSelected ? new Set() : new Set(testCases.map((tc) => tc.id)));
  const toggleSelect = (id: string) => setSelectedIds((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

  const handleUploadManual = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const mockResults: Record<string, string> = {};
    testCases.slice(0, Math.min(5, testCases.length)).forEach((tc, i) => { mockResults[tc.caseCode] = i % 3 === 0 ? "通过" : i % 3 === 1 ? "失败" : "阻塞"; });
    setManualResults(mockResults);
    toast.success("手动测试结果已导入");
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleSaveEdit = async () => {
    if (!editCase) return;
    try {
      const updated = await testCasesApi.update(editCase.id, { actualResult: editActual } as any);
      dispatch({ type: "UPDATE_TEST_CASE", payload: { ...editCase, actualResult: updated.actualResult, createdAt: updated.createdAt, updatedAt: updated.updatedAt } });
      toast.success("保存成功");
      setEditCase(null);
    } catch { toast.error("保存失败"); }
  };

    const toggleReview = async (tc: typeof testCases[0]) => {
    const newStatus = tc.reviewStatus === "已通过" ? "待评审" : "已通过";
    try {
      const updated = await testCasesApi.update(tc.id, { reviewStatus: newStatus } as any);
      dispatch({ type: "UPDATE_TEST_CASE", payload: { ...tc, reviewStatus: newStatus, createdAt: updated.createdAt, updatedAt: updated.updatedAt } });
      toast.success(newStatus === "已通过" ? "评审已通过" : "已取消评审");
    } catch (e) {
      toast.error("评审操作失败: " + (e as Error).message);
    }
  };

  const batchApprove = async () => {
    let successCount = 0;
    for (const id of selectedIds) {
      const tc = testCases.find((c) => c.id === id);
      if (tc && tc.reviewStatus !== "已通过") {
        try {
          const updated = await testCasesApi.update(tc.id, { reviewStatus: "已通过" } as any);
          dispatch({ type: "UPDATE_TEST_CASE", payload: { ...tc, reviewStatus: "已通过", createdAt: updated.createdAt, updatedAt: updated.updatedAt } });
          successCount++;
        } catch (e) {
          toast.error(`用例 ${tc.caseCode} 评审失败`);
        }
      }
    }
    toast.success(`已通过 ${successCount} 条用例`);
    setSelectedIds(new Set());
  };

  const getScriptTime = (tc: typeof testCases[0]) => {
    const script = scripts.find((s) => s.testCaseId === tc.id);
    return script ? formatTime(script.updatedAt) : "-";
  };

  return (
    <div className="page-stack page-stack--spaced page-stack--fill">
      <SectionHeader title="手动 + 自动化结果合并" description="上传手动测试结果文档，与自动化测试数据按用例编号合并展示。"
        actions={<>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
            <div style={{ display: "flex", gap: 8 }}>
              {selectedIds.size > 0 && <button className="primary-button" type="button" onClick={() => setShowBatchApproveConfirm(true)}>批量评审通过 ({selectedIds.size})</button>}
              <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: "none" }} onChange={handleUploadManual} />
              <button className="primary-button" type="button" onClick={() => inputRef.current?.click()}><FileUp size={13} /> 上传手动测试结果</button>
            </div>
            <span style={{ color: "var(--muted)", fontSize: 12 }}>共 <strong style={{ color: "var(--text)" }}>{testCases.length}</strong> 条用例</span>
          </div>
        </>} />
      <section className="work-panel">
        {testCases.length === 0 ? <div className="empty-state"><p>暂无测试用例数据</p></div> : (
          <DataTable rows={testCases} getRowKey={(r) => r.id} columns={[
            { key: "select", label: <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />, width: "40px", sticky: "left" as const, render: (r) => <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleSelect(r.id)} /> },
            { key: "module", label: "模块", render: (r) => r.module },
            { key: "caseCode", label: "用例编号", render: (r) => r.caseCode },
            { key: "feature", label: "测试点", align: "left", render: (r) => <span title={r.feature}>{truncateText(r.feature, 25)}</span> },
            { key: "title", label: "用例标题", align: "left", render: (r) => <span title={r.title}>{truncateText(r.title, 30)}</span> },
            { key: "priority", label: "优先级", align: "center", render: (r) => <StatusPill tone={priorityTone(r.priority)}>{r.priority}</StatusPill> },
            { key: "testType", label: "测试类型", align: "center", render: (r) => r.testType || "功能测试" },
            { key: "steps", label: "测试步骤", align: "left", render: (r) => <span title={r.steps}>{truncateText(r.steps, 40)}</span> },
            { key: "expectedResult", label: "预期结果", align: "left", render: (r) => <span title={r.expectedResult}>{truncateText(r.expectedResult, 35)}</span> },
            { key: "actualResult", label: "实测结果", align: "left", render: (r) => <span style={{ fontSize: 12, maxWidth: 200, display: "inline-block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.actualResult || "-"}</span> },
            { key: "passed", label: "是否通过", align: "center", render: (r) => {
              const matched = r.actualResult && r.expectedResult && r.actualResult.trim() === r.expectedResult.trim();
              return matched ? <StatusPill tone="green">通过</StatusPill> : r.actualResult ? <StatusPill tone="red">未通过</StatusPill> : <StatusPill tone="slate">未执行</StatusPill>;
            }},
            { key: "reviewStatus", label: "评审状态", align: "center", render: (r) => <button type="button" className="text-button" onClick={() => toggleReview(r)}><StatusPill tone={r.reviewStatus === "已通过" ? "green" : "slate"}>{r.reviewStatus || "待评审"}</StatusPill></button> },
            { key: "automation", label: "是否自动化", align: "center", render: (r) => r.automation === "适合" ? "是" : r.automation === "不适合" ? "否" : "待评估" },
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
      <Modal open={!!viewCase} onClose={() => setViewCase(null)} title="用例详情" width={560}>
        {viewCase && (() => {
          const matched = viewCase.actualResult && viewCase.expectedResult && viewCase.actualResult.trim() === viewCase.expectedResult.trim();
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
              <div className="detail-row detail-row--full"><span className="detail-label">实测结果</span><pre className="detail-pre">{viewCase.actualResult || "-"}</pre></div>
              <div className="detail-row"><span className="detail-label">是否通过</span>{matched ? <StatusPill tone="green">通过</StatusPill> : viewCase.actualResult ? <StatusPill tone="red">未通过</StatusPill> : <StatusPill tone="slate">未执行</StatusPill>}</div>
              <div className="detail-row"><span className="detail-label">是否自动化</span><span>{viewCase.automation === "适合" ? "是" : viewCase.automation === "不适合" ? "否" : "待评估"}</span></div>
              <div className="detail-row"><span className="detail-label">测试时间</span><span>{getScriptTime(viewCase)}</span></div>
            </div>
          );
        })()}
      </Modal>

      {/* 编辑弹窗 - 只能编辑实测结果，是否通过自动计算 */}
      <Modal open={!!editCase} onClose={() => setEditCase(null)} title="编辑实测结果" width={560}>
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
            <div className="detail-row detail-row--full"><span className="detail-label">实测结果</span><textarea className="form-textarea" style={{ flex: 1 }} rows={3} value={editActual} onChange={(e) => setEditActual(e.target.value)} placeholder="输入实际测试结果" /></div>
            <div className="detail-row"><span className="detail-label">是否通过</span><StatusPill tone={editActual && editCase.expectedResult && editActual.trim() === editCase.expectedResult.trim() ? "green" : editActual ? "red" : "slate"}>{editActual && editCase.expectedResult && editActual.trim() === editCase.expectedResult.trim() ? "通过" : editActual ? "未通过" : "未执行"}</StatusPill></div>
            <div className="detail-row"><span className="detail-label">是否自动化</span><span>{editCase.automation === "适合" ? "是" : editCase.automation === "不适合" ? "否" : "待评估"}</span></div>
            <div className="detail-row"><span className="detail-label">测试时间</span><span>{getScriptTime(editCase)}</span></div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 12 }}>
              <button className="ghost-button" type="button" onClick={() => setEditCase(null)}>取消</button>
              <button className="primary-button" type="button" onClick={handleSaveEdit}>保存</button>
            </div>
          </div>
        )}
      </Modal>
      <ConfirmDialog open={showBatchApproveConfirm} title="批量评审通过" message={`确定将选中的 ${selectedIds.size} 条用例标记为评审通过？`} confirmLabel="确认通过" onConfirm={() => { setShowBatchApproveConfirm(false); batchApprove(); }} onCancel={() => setShowBatchApproveConfirm(false)} />
    </div>
  );
}

// ═══════════════════════════════════════
// ═══════════════════════════════════════
// 文档生成（模板 + 生成 + 下载）
// ═══════════════════════════════════════

function DocGenerateTab({ projectId }: { projectId: string }) {
  const { files, testCases, refresh, loading, initialLoading } = useProjectData(projectId);
  const templates = [
    { id: "tpl-plan", name: "软件测试计划", desc: "测试范围、策略、资源、进度安排", needs: ["files"] },
    { id: "tpl-spec", name: "软件测试说明", desc: "测试环境、用例设计、执行方法", needs: ["files", "testCases"] },
    { id: "tpl-report", name: "软件测试报告", desc: "执行结果、缺陷统计、风险分析", needs: ["testCases"] },
    { id: "tpl-pc", name: "PC端操作手册", desc: "系统操作流程、功能说明", needs: ["files"] },
    { id: "tpl-app", name: "APP端操作手册", desc: "移动端操作流程、功能说明", needs: ["files"] },
  ];
  const [generating, setGenerating] = useState<string | null>(null);
  const [statusMap, setStatusMap] = useState<Record<string, { status: string; generatedAt: string | null }>>({});
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [reGenerateId, setReGenerateId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  // 从数据库加载状态
  useEffect(() => {
    docGenApi.getStatus(projectId).then((data) => {
      if (data) setStatusMap(data);
    }).catch(() => {}).finally(() => setStatusLoaded(true));
  }, [projectId]);

  const getTemplateStatus = (tpl: typeof templates[0]): string => {
    // 数据库状态未加载完，显示加载中
    if (!statusLoaded || initialLoading) return "加载中";
    const stored = statusMap[tpl.id];
    if (stored) return stored.status;
    // 数据库没有记录时，根据数据计算初始状态
    if (tpl.needs.includes("files") && files.length === 0) return "数据不足";
    if (tpl.needs.includes("testCases") && testCases.length === 0) return "数据不足";
    return "待生成";
  };

  const isReady = (needs: string[]) => {
    if (initialLoading) return false;
    if (needs.includes("files") && files.length === 0) return false;
    if (needs.includes("testCases") && testCases.length === 0) return false;
    return true;
  };

  const handleGenerateClick = (id: string) => {
    if (statusMap[id]?.status === "已生成") {
      setReGenerateId(id);
      return;
    }
    handleGenerate(id);
  };

  const handleGenerate = async (id: string) => {
    setGenerating(id);
    const tpl = templates.find((t) => t.id === id);

    // 立即设置状态为「生成中」
    await docGenApi.updateStatus(projectId, id, "生成中");
    setStatusMap((prev) => ({ ...prev, [id]: { status: "生成中", generatedAt: null } }));

    try {
      const result = await startGenerateDocs(projectId, id);

      if (result.success) {
        await docGenApi.updateStatus(projectId, id, "已生成");
        setStatusMap((prev) => ({ ...prev, [id]: { status: "已生成", generatedAt: new Date().toISOString() } }));
      } else {
        await docGenApi.updateStatus(projectId, id, "待生成");
        setStatusMap((prev) => ({ ...prev, [id]: { status: "待生成", generatedAt: null } }));
        if (result.error) toast.error(result.error);
      }
    } catch (err) {
      await docGenApi.updateStatus(projectId, id, "待生成").catch(() => {});
      setStatusMap((prev) => ({ ...prev, [id]: { status: "待生成", generatedAt: null } }));
      const msg = err instanceof Error ? err.message : "文档生成失败";
      toast.error(msg);
    } finally {
      setGenerating(null);
    }
  };

  const handlePreview = useCallback(async (id: string) => {
    if (statusMap[id]?.status !== "已生成") { toast.warning("该文档尚未生成，请先点击「生成」"); return; }
    const tpl = templates.find((t) => t.id === id);
    setPreviewId(id);
    setPreviewLoading(true);
    try {
      const response = await fetch(`${API_BASE}/projects/${projectId}/ai/tasks`, {
        headers: { Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY) || ""}` },
      });
      if (response.ok) {
        const tasks = await response.json();
        const docTask = tasks.find((t: any) => t.type === "文档生成" && t.status === "成功" && t.result);
        if (docTask && docTask.result) {
          const docData = JSON.parse(docTask.result);
          // 优先使用 docxBase64 渲染真正的 Word 预览
          if (docData.docxBase64 && previewRef.current) {
            const binaryStr = atob(docData.docxBase64);
            const bytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
            const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
            previewRef.current.innerHTML = "";
            await renderAsync(blob, previewRef.current, undefined, {
              className: "docx-preview",
              inWrapper: true,
              ignoreWidth: false,
              ignoreHeight: false,
              ignoreFonts: false,
              breakPages: true,
              ignoreLastRenderedPageBreak: true,
              experimental: true,
            });
            setPreviewLoading(false);
            return;
          }
          // 降级：使用 content 渲染
          if (docData.content && previewRef.current) {
            const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:"宋体",serif;padding:20px;line-height:1.8;}h1{font-size:20px;border-bottom:2px solid #333;padding-bottom:8px;}h2{font-size:16px;margin-top:20px;}table{border-collapse:collapse;width:100%;margin:10px 0;}th,td{border:1px solid #ccc;padding:6px 10px;text-align:left;}th{background:#f5f5f5;}</style></head><body>${docData.content.replace(/\n/g, "<br>")}</body></html>`;
            const htmlBlob = new Blob([html], { type: "text/html;charset=utf-8" });
            previewRef.current.innerHTML = "";
            const iframe = document.createElement("iframe");
            iframe.style.width = "100%";
            iframe.style.height = "100%";
            iframe.style.border = "none";
            iframe.src = URL.createObjectURL(htmlBlob);
            previewRef.current.appendChild(iframe);
            setPreviewLoading(false);
            return;
          }
        }
      }
      if (previewRef.current) {
        previewRef.current.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:#94a3b8;"><p style="font-size:16px;margin-bottom:8px;">「${tpl?.name || ""}」文档预览</p><p style="font-size:13px;">文档已生成，可点击下方「下载」按钮获取 Word 文件</p></div>`;
      }
    } catch {
      if (previewRef.current) {
        previewRef.current.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:#94a3b8;"><p style="font-size:16px;margin-bottom:8px;">「${tpl?.name || ""}」文档预览</p><p style="font-size:13px;">文档已生成，可点击下方「下载」按钮获取 Word 文件</p></div>`;
      }
    } finally {
      setPreviewLoading(false);
    }
  }, [statusMap, projectId]);

  const handleDownload = async (id: string) => {
    if (statusMap[id]?.status !== "已生成") { toast.warning("该文档尚未生成，请先点击「生成」"); return; }
    const tpl = templates.find((t) => t.id === id);
    try {
      const response = await fetch(`${API_BASE}/projects/${projectId}/ai/tasks`, {
        headers: { Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY) || ""}` },
      });
      if (!response.ok) throw new Error("获取任务失败");
      const tasks = await response.json();
      const docTask = tasks.find((t: any) => t.type === "文档生成" && t.status === "成功" && t.result);
      if (docTask && docTask.result) {
        const docData = JSON.parse(docTask.result);
        if (docData.docxBase64) {
          const binaryStr = atob(docData.docxBase64);
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
          const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = docData.docxFileName || `${tpl?.name || id}.docx`;
          a.click();
          URL.revokeObjectURL(url);
          toast.success(`正在下载「${docData.docxFileName || tpl?.name || id}」`);
          return;
        }
      }
      toast.error("未找到可下载的文档文件");
    } catch {
      toast.error("下载失败");
    }
  };

  const handleBatchDownload = async () => {
    const doneIds = [...selectedIds].filter((id) => statusMap[id]?.status === "已生成");
    if (doneIds.length === 0) { toast.warning("所选模板暂无可下载的文档，请先生成"); return; }
    for (const id of doneIds) {
      await handleDownload(id);
    }
  };

  const [showBatchReGenConfirm, setShowBatchReGenConfirm] = useState(false);

  const handleBatchGenerate = async () => {
    // 检查是否有已生成的模板需要重新生成
    const alreadyDone = [...selectedIds].filter((id) => statusMap[id]?.status === "已生成");
    if (alreadyDone.length > 0) {
      setShowBatchReGenConfirm(true);
      return;
    }
    await doBatchGenerate();
  };

  const doBatchGenerate = async () => {
    const readyIds = [...selectedIds].filter((id) => {
      const tpl = templates.find((t) => t.id === id);
      return tpl && isReady(tpl.needs);
    });
    if (readyIds.length === 0) { toast.warning("所选模板无可用数据"); return; }

    try {
      for (const id of readyIds) {
        await docGenApi.updateStatus(projectId, id, "生成中");
        setStatusMap((prev) => ({ ...prev, [id]: { status: "生成中", generatedAt: null } }));

        const result = await startGenerateDocs(projectId, id);

        if (result.success) {
          await docGenApi.updateStatus(projectId, id, "已生成");
          setStatusMap((prev) => ({ ...prev, [id]: { status: "已生成", generatedAt: new Date().toISOString() } }));
        } else {
          await docGenApi.updateStatus(projectId, id, "待生成");
          setStatusMap((prev) => ({ ...prev, [id]: { status: "待生成", generatedAt: null } }));
        }
      }
      toast.success(`批量生成完成，共 ${readyIds.length} 个文档`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "文档生成失败");
    }
    setSelectedIds(new Set());
  };

  const allSelected = selectedIds.size === templates.length;
  const toggleSelectAll = () => setSelectedIds(allSelected ? new Set() : new Set(templates.map((t) => t.id)));
  const toggleSelect = (id: string) => setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="page-stack page-stack--spaced page-stack--fill">
      <SectionHeader title="文档生成" description="选择文档模板，系统将根据项目数据自动生成 Word 文档。" actions={<>
        <div style={{ display: "flex", gap: 8 }}>
          {selectedIds.size > 0 && <button className="primary-button" type="button" onClick={handleBatchGenerate} disabled={!!generating}><WandSparkles size={13} /> 批量生成（{selectedIds.size}）</button>}
          {selectedIds.size > 0 && <button className="primary-button" type="button" onClick={handleBatchDownload}><Download size={13} /> 批量下载（{selectedIds.size}）</button>}
        </div>
      </>} />
      <section className="work-panel">
        <DataTable rows={templates} getRowKey={(r) => r.id} columns={[
          { key: "select", label: <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />, width: "40px", sticky: "left" as const, render: (r) => <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleSelect(r.id)} /> },
          { key: "name", label: "模板名称", render: (r) => r.name },
          { key: "desc", label: "说明", render: (r) => r.desc },
          { key: "needs", label: "前置数据", render: (r) => r.needs.map((n) => n === "files" ? "文档" : "用例").join("、") },
          { key: "status", label: "状态", align: "center", render: (r) => {
            const st = getTemplateStatus(r);
            if (st === "已生成") return <StatusPill tone="green">已生成</StatusPill>;
            if (st === "生成中") return <StatusPill tone="blue">生成中</StatusPill>;
            if (st === "数据不足") return <StatusPill tone="amber">数据不足</StatusPill>;
            if (st === "加载中") return <StatusPill tone="slate">加载中</StatusPill>;
            return <StatusPill tone="slate">待生成</StatusPill>;
          }},
          { key: "time", label: "生成时间", width: "160px", align: "center", render: (r) => <span style={{ display: "inline-block", width: 160 }}>{statusMap[r.id]?.generatedAt ? formatTime(statusMap[r.id].generatedAt!) : "-"}</span> },
          { key: "actions", label: "操作", width: "160px", sticky: "right" as const, align: "center", render: (r) => {
            const ready = isReady(r.needs);
            const done = statusMap[r.id]?.status === "已生成";
            return (
              <div className="inline-actions">
                <button className="text-button" type="button" onClick={() => handleGenerateClick(r.id)} disabled={!!generating || !ready}>
                  生成
                </button>
                <button className="text-button" type="button" onClick={() => handlePreview(r.id)}>查看</button>
                <button className="text-button" type="button" onClick={() => handleDownload(r.id)}>下载</button>
              </div>
            );
          }},
        ]} />
      </section>

      {/* 文档预览弹窗 */}
      <Modal
        open={!!previewId}
        onClose={() => { setPreviewId(null); if (previewRef.current) previewRef.current.innerHTML = ""; }}
        title={previewId ? `预览 - ${templates.find((t) => t.id === previewId)?.name || ""}` : "文档预览"}
        width={1100}
        height="90vh"
        flushTop
        footer={<>
          <button className="ghost-button" type="button" onClick={() => { setPreviewId(null); if (previewRef.current) previewRef.current.innerHTML = ""; }}>关闭</button>
          <button className="primary-button" type="button" onClick={() => { if (previewId) handleDownload(previewId); }}><Download size={13} /> 下载</button>
        </>}
      >
        <div style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
          {previewLoading && (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "40px" }}>
              <Loader2 size={24} className="animate-spin" style={{ marginRight: 8 }} />
              <span>加载文档中...</span>
            </div>
          )}
          <div ref={previewRef} style={{ flex: 1, overflow: "auto", background: "#fff", borderRadius: 8, padding: "0 16px 0 16px" }} />
        </div>
      </Modal>

      {/* 重新生成确认弹窗 */}
      <ConfirmDialog
        open={!!reGenerateId}
        title="重新生成文档"
        message={`「${reGenerateId ? templates.find((t) => t.id === reGenerateId)?.name : ""}」已生成过，再次生成将覆盖之前的数据，是否继续？`}
        confirmLabel="继续生成"
        confirmLoading={!!generating}
        onConfirm={() => { const id = reGenerateId!; setReGenerateId(null); handleGenerate(id); }}
        onCancel={() => setReGenerateId(null)}
      />

      {/* 批量重新生成确认弹窗 */}
      <ConfirmDialog
        open={showBatchReGenConfirm}
        title="批量重新生成"
        message={`所选模板中包含已生成的文档，再次生成将覆盖之前的数据，是否继续？`}
        confirmLabel="继续生成"
        confirmLoading={!!generating}
        onConfirm={() => { setShowBatchReGenConfirm(false); doBatchGenerate(); }}
        onCancel={() => setShowBatchReGenConfirm(false)}
      />
    </div>
  );
}

// ═══════════════════════════════════════
// ═══════════════════════════════════════
// 主页面
// ═══════════════════════════════════════

const tabComponents: Record<TabKey, React.FC<{ projectId: string }>> = {
  overview: OverviewTab, files: FilesTab, requirements: RequirementsTab, testPoints: TestPointsTab, testCases: TestCasesTab,
  scripts: ScriptsTab, executeScripts: ExecuteScriptsTab, docFusion: DocFusionTab, summary: SummaryTab,
  docGenerate: DocGenerateTab,
};



function TabLoadingSkeleton() {
  return (
    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="skeleton-line" style={{ width: '40%', height: 20, borderRadius: 4, background: 'var(--line)' }} />
      <div className="skeleton-line" style={{ width: '70%', height: 14, borderRadius: 4, background: 'var(--line)' }} />
      <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
        {[1,2,3,4].map(i => (
          <div key={i} className="skeleton-card" style={{ flex: 1, height: 80, borderRadius: 'var(--radius-l1)', background: 'var(--line)', opacity: 0.5 }} />
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
        {[1,2,3,4,5].map(i => (
          <div key={i} className="skeleton-line" style={{ width: `${60 + Math.random() * 35}%`, height: 14, borderRadius: 4, background: 'var(--line)', opacity: 0.4 }} />
        ))}
      </div>
    </div>
  );
}

const TAB_STORAGE_PREFIX = "aitestlink-project-tab-";

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { project, loading } = useProjectData(id);
  const prevIdRef = useRef<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    if (id) {
      const stored = localStorage.getItem(TAB_STORAGE_PREFIX + id);
      if (stored) return stored as TabKey;
    }
    return "overview";
  });
  const tabContentRef = useRef<HTMLDivElement>(null);
  const handleTabChange = (tab: TabKey) => { setActiveTab(tab); if (id) localStorage.setItem(TAB_STORAGE_PREFIX + id, tab); };

  // 仅在项目 ID 真正切换时重置到概览页，页面刷新时恢复已保存的 tab
  useEffect(() => {
    if (prevIdRef.current !== null && prevIdRef.current !== id) {
      setActiveTab("overview");
      if (id) localStorage.setItem(TAB_STORAGE_PREFIX + id, "overview");
    }
    prevIdRef.current = id;
  }, [id]);

  // 监听通知点击的 CustomEvent，实时切换 tab 并持久化
  useEffect(() => {
    const handler = (e: Event) => {
      const { tab, projectId } = (e as CustomEvent).detail;
      if (projectId === id && tab) {
        setActiveTab(tab as TabKey);
        if (id) localStorage.setItem(TAB_STORAGE_PREFIX + id, tab);
      }
    };
    window.addEventListener("aitestlink:navigate-tab", handler);
    return () => window.removeEventListener("aitestlink:navigate-tab", handler);
  }, [id]);

  // tab 切换时通知所有 useProjectData 实例刷新数据
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("aitestlink:data-refresh", { detail: { projectId: id } }));
  }, [activeTab, id]);

  useEffect(() => {
    tabContentRef.current?.scrollTo({ top: 0 });
  }, [activeTab]);

  if (!project) {
    if (loading) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div className="detail-header">
            <button className="ghost-button" type="button" onClick={() => navigate("/projects")}><ArrowLeft size={13} /> 返回</button>
            <div className="skeleton-line" style={{ width: 200, height: 24, borderRadius: 4, background: 'var(--line)' }} />
          </div>
          <div className="tab-bar">
            {allTabs.map((tab) => <div key={tab.key} className="skeleton-line" style={{ width: 60, height: 16, borderRadius: 4, background: 'var(--line)', opacity: 0.4 }} />)}
          </div>
          <div className="tab-content"><TabLoadingSkeleton /></div>
        </div>
      );
    }
    return <div className="page-stack page-stack--spaced page-stack--fill"><div className="empty-state"><p>项目不存在或已删除。</p><button className="primary-button" type="button" onClick={() => navigate("/projects")}>返回项目列表</button></div></div>;
  }

  const ActiveComponent = tabComponents[activeTab];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="detail-header">
        <button className="ghost-button" type="button" onClick={() => navigate("/projects")}><ArrowLeft size={13} /> 返回</button>
        <h2 style={{ margin: 0 }}>{project.name}</h2>
      </div>
      <div className="tab-bar">
        {allTabs.map((tab) => <button key={tab.key} type="button" className={`tab-button ${activeTab === tab.key ? "tab-button--active" : ""}`} onClick={() => handleTabChange(tab.key)}>{tab.label}</button>)}
      </div>
      <div className="tab-content" ref={tabContentRef}>
        {allTabs.map((tab) => {
          const Comp = tabComponents[tab.key];
          if (!Comp) return null;
          return (
            <div key={tab.key} style={{ display: activeTab === tab.key ? "contents" : "none" }}>
              <Comp projectId={project.id} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
