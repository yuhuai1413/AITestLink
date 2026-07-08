import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, WandSparkles, Loader2, FileUp, Upload, Trash2, Download, CheckCircle2, Play, Code, Eye } from "lucide-react";
import { useStore } from "../../app/store";
import { useProjectData } from "./useProjectData";
import { useAPISync } from "../../api/useAPISync";
import { useAIAction } from "../../shared/hooks/useAIAction";
import { aiApi, requirementsApi, scriptsApi, testCasesApi, testPointsApi, type ApiFile, type ApiRequirement, type ApiTestPoint, type ApiTestCase, type ApiScript } from "../../api/client";
import { DataTable } from "../../shared/components/DataTable";
import { SectionHeader } from "../../shared/components/SectionHeader";
import { StatusPill } from "../../shared/components/StatusPill";
import { ConfirmDialog } from "../../shared/components/ConfirmDialog";
import { Modal } from "../../shared/components/Modal";
import { TestCaseDetailModal } from "../test-design/TestCaseDetailModal";
import { toast } from "sonner";
import { startParseRequirements } from "../../shared/hooks/aiTaskManager";
import type { Priority, TestCase, AutomationScript } from "../../shared/types/platform";

function formatTime(iso: string | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

type TabKey =
  | "overview" | "files" | "requirements" | "testPoints" | "testCases" | "scripts" | "executeScripts"
  | "docFusion" | "summary" | "docGenerate" | "docVerify";

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
  { key: "docVerify", label: "文档检验" },
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
  const { project, files, testPoints, testCases, scripts } = useProjectData(projectId);
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
  const { files, refreshFiles } = useProjectData(projectId);
  const { uploadFile, deleteFile } = useAPISync();
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deletingFile, setDeletingFile] = useState<{ id: string; name: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
    } catch (err) { toast.error(err instanceof Error ? err.message : "上传失败"); }
    finally { setUploading(false); if (inputRef.current) inputRef.current.value = ""; }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false); handleUpload(e.dataTransfer.files);
  }, [projectId, files]);

  const handleDelete = async () => {
    if (!deletingFile) return;
    try { await deleteFile(deletingFile.id); toast.success("删除成功"); await refreshFiles(); } catch { toast.error("删除失败"); }
    setDeletingFile(null);
  };

  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);
  const batchDelete = async () => {
    for (const id of selectedIds) { try { await deleteFile(id); } catch {} }
    toast.success(`已删除 ${selectedIds.size} 个文件`);
    await refreshFiles();
    setSelectedIds(new Set());
  };

  return (
    <div className="page-stack page-stack--spaced page-stack--fill">
      <SectionHeader title="文档管理" description="上传需求文档、接口文档、原型和变更说明，支持拖拽上传。"
        actions={<>
          {selectedIds.size > 0 && <button className="ghost-button" type="button" onClick={() => setShowBatchApproveConfirm(true)}><CheckCircle2 size={13} /> 评审通过（{selectedIds.size}）</button>}
              {selectedIds.size > 0 && <button className="ghost-button" type="button" style={{ color: "var(--red)" }} onClick={() => setShowBatchDeleteConfirm(true)}>删除选中（{selectedIds.size}）</button>}
          <input ref={inputRef} type="file" multiple accept=".docx,.doc,.pdf,.md,.json,.yaml,.yml,.xlsx,.xls,.csv" style={{ display: "none" }} onChange={(e) => handleUpload(e.target.files)} />
          <button className="ghost-button" type="button" onClick={() => inputRef.current?.click()} disabled={uploading}>手动上传</button>
        </>} />
      <div onDrop={handleDrop} onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
        style={{ border: `2px dashed ${dragOver ? "#6366f1" : "var(--line)"}`, borderRadius: "var(--radius-l2)", padding: "32px 20px", textAlign: "center", background: dragOver ? "rgba(99,102,241,0.05)" : "transparent", transition: "all 0.2s", cursor: "pointer" }}
        onClick={() => inputRef.current?.click()}>
        <Upload size={32} style={{ color: dragOver ? "#6366f1" : "var(--muted)", margin: "0 auto 8px" }} />
        <p style={{ margin: 0, color: dragOver ? "#6366f1" : "var(--muted)", fontSize: 14 }}>{uploading ? "上传中..." : "拖拽文件到此处，或点击上传"}</p>
        <p style={{ margin: "4px 0 0", color: "var(--subtle)", fontSize: 12 }}>支持 .docx .doc .pdf .md .json .yaml .xlsx .csv 等格式</p>
      </div>
      <section className="work-panel">
        {files.length === 0 ? <div className="empty-state"><p>暂无文档，请上传文件。</p></div> : (
          <DataTable rows={files} getRowKey={(r) => r.id} columns={[
            { key: "select", label: <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />, width: "40px", render: (r) => <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleSelect(r.id)} /> },
            { key: "name", label: "文件名称", align: "left", render: (r) => <strong>{r.name}</strong> },
            { key: "type", label: "文件类型", render: (r) => r.fileType },
            { key: "size", label: "文件大小", render: (r) => r.size },
            { key: "parseStatus", label: "解析状态", align: "center", render: (r) => <span title={r.parseError || undefined}><StatusPill tone={r.parseStatus === "已完成" ? "green" : r.parseStatus === "解析中" ? "blue" : r.parseStatus === "失败" ? "red" : "slate"}>{r.parseStatus}</StatusPill></span> },
            { key: "date", label: "上传时间", render: (r) => formatTime(r.uploadedAt) },
            { key: "actions", label: "操作", align: "center", render: (r) => <button className="text-button text-button--danger" type="button" onClick={() => setDeletingFile({ id: r.id, name: r.name })}>删除</button> },
          ]} />
        )}
      </section>
      <ConfirmDialog open={!!deletingFile} title="删除文件" message={`确定删除文件「${deletingFile?.name}」？`} confirmLabel="删除" onConfirm={handleDelete} onCancel={() => setDeletingFile(null)} />
      <ConfirmDialog open={showBatchDeleteConfirm} title="批量删除文件" message={`确定删除选中的 ${selectedIds.size} 个文件？`} confirmLabel="删除" onConfirm={() => { setShowBatchDeleteConfirm(false); batchDelete(); }} onCancel={() => setShowBatchDeleteConfirm(false)} />
    </div>
  );
}

// ═══════════════════════════════════════
// 需求列表（解析 + 展示）
// ═══════════════════════════════════════

function RequirementsTab({ projectId }: { projectId: string }) {
  const { files, requirements, refresh: refreshData } = useProjectData(projectId);
  const { state, dispatch } = useStore();
  const parsing = useMemo(() => state.activeAITasks.includes("需求解析"), [state.activeAITasks]);
  const [showReparseConfirm, setShowReparseConfirm] = useState(false);
  const [viewReq, setViewReq] = useState<typeof requirements[0] | null>(null);
  const [editReq, setEditReq] = useState<typeof requirements[0] | null>(null);
  const [editRule, setEditRule] = useState("");
  const [editQuestion, setEditQuestion] = useState("");
  const [deletingReq, setDeletingReq] = useState<{ id: string; name: string } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const hasFiles = files.length > 0;
  const hasParsedFiles = files.some((f) => f.parseStatus === "已完成");
  const allSelected = requirements.length > 0 && requirements.every((r) => selectedIds.has(r.id));
  const toggleSelectAll = () => setSelectedIds(allSelected ? new Set() : new Set(requirements.map((r) => r.id)));
  const toggleSelect = (id: string) => setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);
  const [showBatchApproveConfirm, setShowBatchApproveConfirm] = useState(false);
  const batchDelete = async () => {
    for (const id of selectedIds) { try { await requirementsApi.delete(id); } catch {} }
    selectedIds.forEach((id) => dispatch({ type: "DELETE_REQUIREMENT", payload: id }));
    toast.success(`已删除 ${selectedIds.size} 条需求`);
    setSelectedIds(new Set());
    await refreshData();
  };
  const toggleReview = async (r: any) => {
    const newStatus = (r.reviewStatus === "已通过") ? "待评审" : "已通过";
    try { await requirementsApi.update(r.id, { reviewStatus: newStatus } as any); } catch {}
    dispatch({ type: "UPDATE_REQUIREMENT", payload: { ...r, reviewStatus: newStatus } });
    await refreshData();
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
    await refreshData();
  };

  const doParse = async () => {
    try {
      const result = await startParseRequirements(projectId);
      if (result.success) {
        toast.success("需求解析完成！");
        await refreshData();
      } else if (result.error && result.error !== "模型未配置") {
        toast.error(result.error);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "解析失败");
    }
  };

  const handleParse = () => {
    if (!hasFiles) { toast.warning("请先在「输入资料」页面上传文件"); return; }
    if (hasParsedFiles) { setShowReparseConfirm(true); return; }
    doParse();
  };

  return (
    <div className="page-stack page-stack--spaced page-stack--fill">
      <SectionHeader title="需求列表" description="从上传的文档中解析需求，支持查看和确认。"
        actions={<>
          {selectedIds.size > 0 && <button className="ghost-button" type="button" onClick={() => setShowBatchApproveConfirm(true)}><CheckCircle2 size={13} /> 评审通过（{selectedIds.size}）</button>}
              {selectedIds.size > 0 && <button className="ghost-button" type="button" style={{ color: "var(--red)" }} onClick={() => setShowBatchDeleteConfirm(true)}>删除选中（{selectedIds.size}）</button>}
          <button className="primary-button" type="button" onClick={handleParse} disabled={parsing}>
            {parsing ? <Loader2 size={13} className="animate-spin" /> : <WandSparkles size={13} />}
            {parsing ? "解析中..." : "需求解析"}
          </button>
        </>} />
      <section className="work-panel">
        {requirements.length === 0 ? (
          <div className="empty-state">
            {hasFiles ? <p>暂无需求数据，请点击「需求解析」按钮</p> : <p>暂无需求数据，请先在「输入资料」页面上传文件</p>}
          </div>
        ) : (
          <DataTable rows={requirements} getRowKey={(r) => r.id} columns={[
            { key: "select", label: <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />, width: "40px", render: (r) => <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleSelect(r.id)} /> },
            { key: "module", label: "模块", width: "10%", render: (r) => r.module },
            { key: "feature", label: "功能点", width: "10%", align: "left", render: (r) => r.feature },
            { key: "source", label: "来源", width: "10%", render: (r) => r.source },
            { key: "risk", label: "风险", align: "center", render: (r) => <StatusPill tone={r.risk === "高" ? "red" : r.risk === "中" ? "amber" : "green"}>{r.risk}</StatusPill> },
            { key: "rule", label: "业务规则", width: "20%", align: "left", render: (r) => r.rule },
            { key: "question", label: "待确认", width: "20%", align: "left", render: (r) => r.question || <span style={{ color: "var(--muted)" }}>-</span> },
            { key: "reviewStatus", label: "评审", width: "8%", align: "center", render: (r) => <button type="button" className="text-button" onClick={() => toggleReview(r)}><StatusPill tone={r.reviewStatus === "已通过" ? "green" : "slate"}>{r.reviewStatus || "待评审"}</StatusPill></button> },
            { key: "actions", label: "操作", align: "center", render: (r) => (
              <div className="inline-actions">
                <button className="text-button" type="button" onClick={() => setViewReq(r)}>查看</button>
                <button className="text-button" type="button" onClick={() => { setEditReq(r); setEditRule(r.rule); setEditQuestion(r.question); }}>编辑</button>
                <button className="text-button text-button--danger" type="button" onClick={() => setDeletingReq({ id: r.id, name: `${r.module} - ${r.feature}` })}>删除</button>
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
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 12 }}>
              <button className="ghost-button" type="button" onClick={() => setEditReq(null)}>取消</button>
              <button className="primary-button" type="button" onClick={async () => {
                if (!editReq) return;
                try {
                  await requirementsApi.update(editReq.id, { rule: editRule, question: editQuestion } as any);
                  dispatch({ type: "UPDATE_REQUIREMENT", payload: { ...editReq, rule: editRule, question: editQuestion } });
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
      <ConfirmDialog open={showBatchDeleteConfirm} title="批量删除需求" message={`确定删除选中的 ${selectedIds.size} 条需求？`} confirmLabel="删除" onConfirm={() => { setShowBatchDeleteConfirm(false); batchDelete(); }} onCancel={() => setShowBatchDeleteConfirm(false)} />
      <ConfirmDialog open={!!deletingReq} title="删除需求" message={`确定删除需求「${deletingReq?.name}」？`} confirmLabel="删除" onConfirm={async () => {
        if (!deletingReq) return;
        try { await requirementsApi.delete(deletingReq.id); dispatch({ type: "DELETE_REQUIREMENT", payload: deletingReq.id }); toast.success("删除成功"); await refreshData(); } catch { toast.error("删除失败"); }
        setDeletingReq(null);
      }} onCancel={() => setDeletingReq(null)} />
    </div>
  );
}

// ═══════════════════════════════════════
// 测试点（AI 生成 + 评审 + 删除）
// ═══════════════════════════════════════

function TestPointsTab({ projectId }: { projectId: string }) {
  const { testPoints, files, requirements, refresh: refreshData, refreshTestPoints } = useProjectData(projectId);
  const { dispatch } = useStore();
  const { loadingTestPoints, error, generateTestPoints } = useAIAction(projectId);
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
      await testPointsApi.update(editTP.id, { title: editTitle, description: editDesc } as any);
      dispatch({ type: "UPDATE_TEST_POINT", payload: { ...editTP, title: editTitle, description: editDesc } });
      toast.success("保存成功");
      setEditTP(null);
    } catch {
      toast.error("保存失败");
    }
  };

  return (
    <div className="page-stack page-stack--spaced page-stack--fill">
      <SectionHeader title="测试点生成" description="AI 从文档中提取测试点，支持评审和删除。"
        actions={<>
          {selectedIds.size > 0 && <button className="ghost-button" type="button" onClick={() => setShowBatchApproveConfirm(true)}><CheckCircle2 size={13} /> 评审通过（{selectedIds.size}）</button>}
              {selectedIds.size > 0 && <button className="ghost-button" type="button" style={{ color: "var(--red)" }} onClick={() => setShowBatchDeleteConfirm(true)}>删除选中（{selectedIds.size}）</button>}
          <button className="primary-button" type="button" onClick={handleGenerate} disabled={loadingTestPoints}>{loadingTestPoints ? <Loader2 size={13} className="animate-spin" /> : <WandSparkles size={13} />}{loadingTestPoints ? "生成中..." : "生成测试点"}</button>
        </>} />
      {error && <div className="error-banner"><span>{error}</span></div>}
      {modules.length > 0 && <div className="filter-bar"><span className="filter-label">模块筛选</span><select className="filter-select" value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)}><option value="all">全部模块</option>{modules.map((m) => <option key={m} value={m}>{m}</option>)}</select></div>}
      <section className="work-panel">
        {filtered.length === 0 ? <div className="empty-state"><p>暂无测试点</p></div> : (
          <DataTable rows={filtered} getRowKey={(r) => r.id} columns={[
            { key: "select", label: <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />, width: "40px", render: (r) => <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleSelect(r.id)} /> },
            { key: "id", label: "编号", render: (r) => r.id },
            { key: "module", label: "模块", render: (r) => r.module },
            { key: "type", label: "类型", render: (r) => r.type },
            { key: "title", label: "测试点", align: "left", render: (r) => r.title },
            { key: "priority", label: "优先级", align: "center", render: (r) => <StatusPill tone={priorityTone(r.priority)}>{r.priority}</StatusPill> },
            { key: "reviewStatus", label: "评审", align: "center", render: (r) => <button type="button" className="text-button" onClick={() => toggleReview(r)}><StatusPill tone={reviewTone(r.reviewStatus)}>{r.reviewStatus}</StatusPill></button> },
            { key: "actions", label: "操作", align: "center", render: (r) => (
              <div className="inline-actions">
                <button className="text-button" type="button" onClick={() => setViewTP(r)}>查看</button>
                <button className="text-button" type="button" onClick={() => { setEditTP(r); setEditTitle(r.title); setEditDesc(r.description); }}>编辑</button>
                <button className="text-button text-button--danger" type="button" onClick={async () => { try { await testPointsApi.delete(r.id); } catch {} dispatch({ type: "DELETE_TEST_POINT", payload: r.id }); refreshTestPoints(); }}>删除</button>
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
      <ConfirmDialog open={showBatchDeleteConfirm} title="批量删除测试点" message={`确定删除选中的 ${selectedIds.size} 个测试点？`} confirmLabel="删除" onConfirm={() => { setShowBatchDeleteConfirm(false); batchDelete(); }} onCancel={() => setShowBatchDeleteConfirm(false)} />
    </div>
  );
}

// ═══════════════════════════════════════
// 测试用例（AI 生成 + 评审 + 删除）
// ═══════════════════════════════════════

function TestCasesTab({ projectId }: { projectId: string }) {
  const { testCases, testPoints, refreshTestCases, refreshTestPoints } = useProjectData(projectId);
  const { dispatch } = useStore();
  const { loadingTestCases, loadingReview, error, generateTestCases, reviewTestCases } = useAIAction(projectId);
  const prevLoadingRef = useRef(loadingTestCases);
  useEffect(() => { if (prevLoadingRef.current && !loadingTestCases) { refreshTestCases(); } prevLoadingRef.current = loadingTestCases; }, [loadingTestCases, refreshTestCases]);
  const [detailCase, setDetailCase] = useState<TestCase | null>(null);
  const [editCase, setEditCase] = useState<TestCase | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editSteps, setEditSteps] = useState("");
  const [editExpected, setEditExpected] = useState("");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showGenerateConfirm, setShowGenerateConfirm] = useState(false);
  const [showBatchApproveConfirm, setShowBatchApproveConfirm] = useState(false);
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
      await testCasesApi.update(editCase.id, { title: editTitle, steps: editSteps, expectedResult: editExpected } as any);
      dispatch({ type: "UPDATE_TEST_CASE", payload: { ...editCase, title: editTitle, steps: editSteps, expectedResult: editExpected } });
      toast.success("保存成功");
      setEditCase(null);
    } catch {
      toast.error("保存失败");
    }
  };

  const handleExportManual = () => {
    const manualCases = testCases.filter((tc) => tc.automation !== "适合");
    if (manualCases.length === 0) { toast.warning("暂无手动测试用例"); return; }
    const headers = ["编号", "模块", "功能点", "标题", "优先级", "前置条件", "测试步骤", "测试数据", "预期结果", "评审状态", "备注"];
    const rows = manualCases.map((tc) => [
      tc.caseCode, tc.module, tc.feature, tc.title, tc.priority,
      tc.precondition, tc.steps, tc.testData, tc.expectedResult,
      tc.reviewStatus, tc.remark,
    ]);
    const csvContent = [headers, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `手动测试用例_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`已导出 ${manualCases.length} 条手动测试用例`);
  };

  return (
    <div className="page-stack page-stack--spaced page-stack--fill">
      <SectionHeader title="用例生成" description="从测试点生成可执行用例，支持评审和删除。"
        actions={<>
          {selectedIds.size > 0 && <button className="ghost-button" type="button" onClick={() => setShowBatchApproveConfirm(true)}><CheckCircle2 size={13} /> 评审通过（{selectedIds.size}）</button>}
              {selectedIds.size > 0 && <button className="ghost-button" type="button" style={{ color: "var(--red)" }} onClick={() => setShowBatchDeleteConfirm(true)}>删除选中（{selectedIds.size}）</button>}
          {reviewResult && <button className="ghost-button" type="button" onClick={() => setShowReviewResult(true)}><Eye size={13} /> 查看评审报告</button>}
          <button className="primary-button" type="button" onClick={handleAIReview} disabled={loadingReview || testCases.length === 0}>{loadingReview ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}{loadingReview ? "评审中..." : "AI 评审"}</button>
          <button className="primary-button" type="button" onClick={handleExportManual} disabled={testCases.length === 0}><Download size={13} /> 导出手动测试用例</button>
          <button className="primary-button" type="button" onClick={handleGenerate} disabled={loadingTestCases}>{loadingTestCases ? <Loader2 size={13} className="animate-spin" /> : <WandSparkles size={13} />}{loadingTestCases ? "生成中..." : "生成用例"}</button>
        </>} />
      {error && <div className="error-banner"><span>{error}</span></div>}
      {modules.length > 0 && <div className="filter-bar"><span className="filter-label">模块筛选</span><select className="filter-select" value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)}><option value="all">全部模块</option>{modules.map((m) => <option key={m} value={m}>{m}</option>)}</select></div>}
      <section className="work-panel">
        {filtered.length === 0 ? <div className="empty-state"><p>暂无测试用例</p></div> : (
          <DataTable rows={filtered} getRowKey={(r) => r.id} columns={[
            { key: "select", label: <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />, width: "40px", render: (r) => <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleSelect(r.id)} /> },
            { key: "caseCode", label: "编号", render: (r) => r.caseCode },
            { key: "module", label: "模块", render: (r) => r.module },
            { key: "title", label: "用例标题", align: "left", render: (r) => r.title },
            { key: "priority", label: "优先级", align: "center", render: (r) => <StatusPill tone={priorityTone(r.priority)}>{r.priority}</StatusPill> },
            { key: "reviewStatus", label: "评审", align: "center", render: (r) => <button type="button" className="text-button" onClick={() => toggleReview(r)}><StatusPill tone={reviewTone(r.reviewStatus)}>{r.reviewStatus}</StatusPill></button> },
            { key: "automation", label: "是否自动化", align: "center", render: (r) => r.automation === "适合" ? "是" : "否" },
            { key: "actions", label: "操作", align: "center", render: (r) => (
              <div className="inline-actions">
                <button className="text-button" type="button" onClick={() => setDetailCase(r)}>查看</button>
                <button className="text-button" type="button" onClick={() => { setEditCase(r); setEditTitle(r.title); setEditSteps(r.steps); setEditExpected(r.expectedResult); }}>编辑</button>
                <button className="text-button text-button--danger" type="button" onClick={async () => { try { await testCasesApi.delete(r.id); } catch {} dispatch({ type: "DELETE_TEST_CASE", payload: r.id }); refreshTestCases(); }}>删除</button>
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
            <div className="detail-row"><span className="detail-label">所属模块</span><span>{editCase.module}</span></div>
            <div className="detail-row"><span className="detail-label">优先级</span><StatusPill tone={priorityTone(editCase.priority)}>{editCase.priority}</StatusPill></div>
            <div className="detail-row"><span className="detail-label">评审状态</span><StatusPill tone={reviewTone(editCase.reviewStatus)}>{editCase.reviewStatus}</StatusPill></div>
            <div className="detail-row detail-row--full"><span className="detail-label">用例标题</span><input className="form-input" style={{ flex: 1 }} value={editTitle} onChange={(e) => setEditTitle(e.target.value)} /></div>
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
      <ConfirmDialog open={showBatchDeleteConfirm} title="批量删除用例" message={`确定删除选中的 ${selectedIds.size} 条用例？`} confirmLabel="删除" onConfirm={() => { setShowBatchDeleteConfirm(false); batchDelete(); }} onCancel={() => setShowBatchDeleteConfirm(false)} />
      <ConfirmDialog open={showBatchApproveConfirm} title="批量评审通过" message={`确定将选中的 ${selectedIds.size} 条用例标记为评审通过？`} confirmLabel="确认通过" onConfirm={() => { setShowBatchApproveConfirm(false); batchApprove(); }} onCancel={() => setShowBatchApproveConfirm(false)} />
    </div>
  );
}

// ═══════════════════════════════════════
// 自动化脚本（只读）
// ═══════════════════════════════════════

function ScriptsTab({ projectId }: { projectId: string }) {
  const { testCases, scripts, refreshScripts } = useProjectData(projectId);
  const { dispatch } = useStore();
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
  const allSelected = automatable.length > 0 && automatable.every((tc) => selectedIds.has(tc.id));
  const toggleSelectAll = () => setSelectedIds(allSelected ? new Set() : new Set(automatable.map((tc) => tc.id)));
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
    setGenerating(true);
    setError(null);
    try {
      const result = await scriptsApi.generate(projectId);
      if (result.ok && result.scripts) {
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
              {selectedIds.size > 0 && <button className="ghost-button" type="button" style={{ color: "var(--red)" }} onClick={() => setShowBatchDeleteConfirm(true)}>删除选中（{selectedIds.size}）</button>}
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
      <section className="work-panel">
        {automatable.length === 0 ? <div className="empty-state"><p>暂无可自动化的用例，请先在测试用例中标记适合自动化的用例</p></div> : (
          <div>
            <DataTable rows={automatable} getRowKey={(r) => r.id} columns={[
              { key: "select", label: <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />, width: "40px", render: (r) => <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleSelect(r.id)} /> },
              { key: "caseCode", label: "用例编号", render: (r) => r.caseCode },
            { key: "module", label: "模块", render: (r) => r.module },
              { key: "title", label: "用例标题", align: "left", render: (r) => r.title },
              { key: "priority", label: "优先级", align: "center", render: (r) => <StatusPill tone={priorityTone(r.priority)}>{r.priority}</StatusPill> },
              { key: "script", label: "脚本状态", align: "center", render: (r) => {
                const script = scripts.find((s) => s.testCaseId === r.id);
                return script ? <StatusPill tone={script.status === "成功" ? "green" : script.status === "失败" ? "red" : "blue"}>{script.status}</StatusPill> : <span style={{ color: "var(--muted)" }}>未生成</span>;
              }},
              { key: "review", label: "评审", align: "center", render: (r) => {
                const script = scripts.find((s) => s.testCaseId === r.id);
                if (!script) return <span style={{ color: "var(--muted)" }}>-</span>;
                const rev = (script as any).reviewStatus || "待评审";
                return <button type="button" className="text-button" onClick={() => toggleReview(script)}><StatusPill tone={rev === "已通过" ? "green" : "slate"}>{rev}</StatusPill></button>;
              }},
              { key: "actions", label: "操作", align: "center", render: (r) => {
                const script = scripts.find((s) => s.testCaseId === r.id);
                if (!script) return <span style={{ color: "var(--muted)" }}>-</span>;
                return (
                  <div className="inline-actions">
                    <button className="text-button" type="button" onClick={() => setViewScript(script)}>查看</button>
                    <button className="text-button" type="button" onClick={() => { setEditScript(script); setEditCode(script.code); }}>编辑</button>
                    <button className="text-button text-button--danger" type="button" onClick={() => setDeletingScript({ id: script.id, name: `脚本 ${script.id.slice(0, 8)}` })}>删除</button>
                  </div>
                );
              }},
            ]} /></div>
        )}
      </section>

      {/* 查看脚本弹窗 */}
      {viewScript && (
        <div className="confirm-overlay" onClick={() => setViewScript(null)}>
          <div className="confirm-dialog" style={{ width: 700, maxWidth: "90vw" }} onClick={(e) => e.stopPropagation()}>
            <div className="confirm-dialog__body" style={{ flexDirection: "column", gap: 12 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>脚本代码 - {viewScript.framework}</h3>
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

      <ConfirmDialog open={showGenerateConfirm} title="重新生成脚本" message={`当前已有 ${existingScriptCount} 个脚本，再次生成将覆盖之前的数据，是否继续？`} confirmLabel="继续生成" onConfirm={handleGenerate} onCancel={() => setShowGenerateConfirm(false)} />
      <ConfirmDialog open={showBatchApproveConfirm} title="批量评审通过" message={`确定将选中的 ${selectedIds.size} 个脚本标记为评审通过？`} confirmLabel="确认通过" onConfirm={() => { setShowBatchApproveConfirm(false); batchApprove(); }} onCancel={() => setShowBatchApproveConfirm(false)} />
      <ConfirmDialog open={showBatchDeleteConfirm} title="批量删除脚本" message={`确定删除选中的 ${selectedIds.size} 个脚本？`} confirmLabel="删除" onConfirm={() => { setShowBatchDeleteConfirm(false); batchDelete(); }} onCancel={() => setShowBatchDeleteConfirm(false)} />
      <ConfirmDialog open={!!deletingScript} title="删除脚本" message={`确定删除脚本「${deletingScript?.name}」？`} confirmLabel="删除" onConfirm={handleDelete} onCancel={() => setDeletingScript(null)} />
    </div>
  );
}

// ═══════════════════════════════════════
// 执行脚本
// ═══════════════════════════════════════

function ExecuteScriptsTab({ projectId }: { projectId: string }) {
  const { scripts, testCases, refreshScripts } = useProjectData(projectId);
  const { dispatch } = useStore();
  const [selectedScript, setSelectedScript] = useState<AutomationScript | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);
  const [showBatchApproveConfirm, setShowBatchApproveConfirm] = useState(false);
  const [runningAll, setRunningAll] = useState(false);

  const allSelected = scripts.length > 0 && scripts.every((s) => selectedIds.has(s.id));
  const toggleSelectAll = () => setSelectedIds(allSelected ? new Set() : new Set(scripts.map((s) => s.id)));
  const toggleSelect = (id: string) => setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const batchDelete = async () => {
    for (const id of selectedIds) { try { await scriptsApi.delete(id); dispatch({ type: "DELETE_SCRIPT", payload: id }); } catch {} }
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

  const unreviewedScriptCount = scripts.filter((s) => (s as any).reviewStatus !== "已通过").length;
  const runAll = async () => {
    if (scripts.length === 0) { toast.warning("请先在「自动化脚本」页面生成脚本"); return; }
    if (unreviewedScriptCount > 0) { toast.warning(`还有 ${unreviewedScriptCount} 个脚本未评审通过，请先完成脚本评审`); return; }
    setRunningAll(true);
    for (const script of scripts) {
      if (script.status === "成功") continue;
      dispatch({ type: "UPDATE_SCRIPT", payload: { ...script, status: "执行中" } });
      await new Promise((r) => setTimeout(r, 1000));
      const success = Math.random() > 0.3;
      dispatch({ type: "UPDATE_SCRIPT", payload: { ...script, status: success ? "成功" : "失败" } });
      toast[success ? "success" : "error"](`${script.id.slice(0, 8)} ${success ? "执行成功" : "执行失败"}`);
    }
    setRunningAll(false);
  };

  const handleRun = async (script: AutomationScript) => {
    if ((script as any).reviewStatus !== "已通过") { toast.warning("该脚本未评审通过，请先完成评审"); return; }
    setRunningId(script.id);
    dispatch({ type: "UPDATE_SCRIPT", payload: { ...script, status: "执行中" } });

    // 模拟执行（实际应调用后端执行接口）
    setTimeout(() => {
      const success = Math.random() > 0.3;
      dispatch({ type: "UPDATE_SCRIPT", payload: { ...script, status: success ? "成功" : "失败" } });
      setRunningId(null);
      toast[success ? "success" : "error"](`脚本 ${script.id.slice(0, 8)} ${success ? "执行成功" : "执行失败"}`);
    }, 2000);
  };

  const handleDelete = async (id: string) => {
    try {
      await scriptsApi.delete(id);
      dispatch({ type: "DELETE_SCRIPT", payload: id });
      toast.success("删除成功");
      await refreshScripts();
    } catch {
      toast.error("删除失败");
    }
  };

  const getTestCaseTitle = (testCaseId: string | null | undefined) => {
    if (!testCaseId) return "-";
    const tc = testCases.find((t) => t.id === testCaseId);
    return tc ? tc.title : "-";
  };

  return (
    <div className="page-stack page-stack--spaced page-stack--fill">
      <SectionHeader title="执行脚本" description="管理和执行已生成的自动化脚本。"
        actions={<>
          {selectedIds.size > 0 && <button className="ghost-button" type="button" onClick={() => setShowBatchApproveConfirm(true)}><CheckCircle2 size={13} /> 评审通过（{selectedIds.size}）</button>}
              {selectedIds.size > 0 && <button className="ghost-button" type="button" style={{ color: "var(--red)" }} onClick={() => setShowBatchDeleteConfirm(true)}>删除选中（{selectedIds.size}）</button>}
          <button className="primary-button" type="button" onClick={runAll} disabled={runningAll}>
            {runningAll ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
            {runningAll ? "执行中..." : "全部执行"}
          </button>
        </>} />
      <section className="work-panel">
        {scripts.length === 0 ? (
          <div className="empty-state">
            <p>暂无脚本，请先在「自动化脚本」页面生成脚本</p>
          </div>
        ) : (
          <DataTable rows={scripts} getRowKey={(r) => r.id} columns={[
            { key: "select", label: <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />, width: "40px", render: (r) => <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleSelect(r.id)} /> },
            { key: "id", label: "脚本 ID", render: (r) => r.id.slice(0, 8) },
            { key: "testCase", label: "关联用例", align: "left", render: (r) => getTestCaseTitle(r.testCaseId) },
            { key: "framework", label: "框架", render: (r) => r.framework },
            { key: "scriptType", label: "类型", render: (r) => r.scriptType },
            { key: "status", label: "状态", align: "center", render: (r) => (
              <StatusPill tone={r.status === "成功" ? "green" : r.status === "失败" ? "red" : r.status === "执行中" ? "blue" : "slate"}>
                {r.status}
              </StatusPill>
            )},
            { key: "review", label: "评审", align: "center", render: (r) => {
              const rev = (r as any).reviewStatus || "待评审";
              return <button type="button" className="text-button" onClick={() => toggleReview(r)}><StatusPill tone={rev === "已通过" ? "green" : "slate"}>{rev}</StatusPill></button>;
            }},
            { key: "actions", label: "操作", align: "center", render: (r) => (
              <div className="inline-actions">
                <button className="text-button" type="button" onClick={() => setSelectedScript(r)}>查看</button>
                <button className="text-button" type="button" onClick={() => handleRun(r)} disabled={runningId === r.id}>
                  {runningId === r.id ? "执行中" : "执行"}
                </button>
                <button className="text-button text-button--danger" type="button" onClick={() => handleDelete(r.id)}>删除</button>
              </div>
            )},
          ]} />
        )}
      </section>

      {/* 代码查看弹窗 */}
      {selectedScript && (
        <div className="confirm-overlay" onClick={() => setSelectedScript(null)}>
          <div className="confirm-dialog" style={{ width: 700, maxWidth: "90vw" }} onClick={(e) => e.stopPropagation()}>
            <div className="confirm-dialog__body" style={{ flexDirection: "column", gap: 12 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>脚本代码 - {selectedScript.framework}</h3>
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
                {selectedScript.code || "// 暂无代码"}
              </pre>
            </div>
            <div className="confirm-dialog__actions">
              <button className="ghost-button" type="button" onClick={() => setSelectedScript(null)}>关闭</button>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog open={showBatchApproveConfirm} title="批量评审通过" message={`确定将选中的 ${selectedIds.size} 个脚本标记为评审通过？`} confirmLabel="确认通过" onConfirm={() => { setShowBatchApproveConfirm(false); batchApprove(); }} onCancel={() => setShowBatchApproveConfirm(false)} />
      <ConfirmDialog open={showBatchDeleteConfirm} title="批量删除脚本" message={`确定删除选中的 ${selectedIds.size} 个脚本？`} confirmLabel="删除" onConfirm={() => { setShowBatchDeleteConfirm(false); batchDelete(); }} onCancel={() => setShowBatchDeleteConfirm(false)} />
    </div>
  );
}

// ═══════════════════════════════════════
// 测试汇总
// ═══════════════════════════════════════

function SummaryTab({ projectId }: { projectId: string }) {
  const { files, testPoints, testCases } = useProjectData(projectId);
  const total = testCases.length;
  const passed = testCases.filter((c) => c.reviewStatus === "已通过").length;
  const failed = testCases.filter((c) => c.reviewStatus === "需修改").length;
  const pending = testCases.filter((c) => c.reviewStatus !== "已通过" && c.reviewStatus !== "需修改").length;
  const passRate = total > 0 ? Math.round(passed / total * 100) : 0;
  const isPass = passRate >= 80;
  const autoCount = testCases.filter((c) => c.automation === "适合").length;

  // 按模块统计
  const modules = useMemo(() => {
    const map = new Map<string, { total: number; passed: number; failed: number }>();
    testCases.forEach((c) => {
      const m = map.get(c.module) || { total: 0, passed: 0, failed: 0 };
      m.total++;
      if (c.reviewStatus === "已通过") m.passed++;
      if (c.reviewStatus === "需修改") m.failed++;
      map.set(c.module, m);
    });
    return Array.from(map.entries()).map(([name, data]) => ({ name, ...data, rate: data.total > 0 ? Math.round(data.passed / data.total * 100) : 0 }));
  }, [testCases]);

  // 按优先级统计
  const priorities = useMemo(() => {
    const map = new Map<string, { total: number; passed: number }>();
    testCases.forEach((c) => {
      const p = map.get(c.priority) || { total: 0, passed: 0 };
      p.total++;
      if (c.reviewStatus === "已通过") p.passed++;
      map.set(c.priority, p);
    });
    return Array.from(map.entries()).map(([name, data]) => ({ name, ...data, rate: data.total > 0 ? Math.round(data.passed / data.total * 100) : 0 }));
  }, [testCases]);

  // 未通过用例
  const failedCases = useMemo(() => testCases.filter((c) => c.reviewStatus !== "已通过"), [testCases]);

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
        {!isPass && <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)" }}>存在 {failed} 条失败用例和 {pending} 条待评审用例，建议排查后重新执行。</p>}
      </div>

      {/* 核心指标 */}
      <div className="dash-stats" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        {[
          { label: "用例总数", value: total },
          { label: "通过", value: passed, sub: `${passRate}%`, color: "var(--green)" },
          { label: "失败", value: failed, sub: failed > 0 ? "需排查" : "", color: "var(--red)" },
          { label: "待评审", value: pending, sub: pending > 0 ? "待处理" : "", color: "var(--amber)" },
        ].map((s) => <div className="dash-stat-card" key={s.label}><div className="dash-stat-body"><span className="dash-stat-label">{s.label}</span><strong className="dash-stat-value" style={s.color ? { color: s.color } : undefined}>{s.value}</strong>{s.sub && <span className="dash-stat-sub">{s.sub}</span>}</div></div>)}
      </div>

      {/* 模块通过率 + 优先级通过率 并排 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <section className="work-panel">
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 12px" }}>模块通过率</h3>
          {modules.length === 0 ? <div className="empty-state"><p>暂无数据</p></div> : (
            <div style={{ display: "grid", gap: 8 }}>
              {modules.map((m) => (
                <div key={m.name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 80, fontSize: 13, flexShrink: 0, textAlign: "right" }}>{m.name}</span>
                  <div style={{ flex: 1, height: 8, background: "var(--line)", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ width: `${m.rate}%`, height: "100%", background: m.rate >= 80 ? "var(--green)" : m.rate >= 50 ? "var(--amber)" : "var(--red)", borderRadius: 4, transition: "width 0.3s" }} />
                  </div>
                  <span style={{ width: 50, fontSize: 12, color: "var(--text-secondary)" }}>{m.passed}/{m.total}</span>
                  <StatusPill tone={toneForRate(m.rate)}>{m.rate}%</StatusPill>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="work-panel">
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 12px" }}>优先级通过率</h3>
          {priorities.length === 0 ? <div className="empty-state"><p>暂无数据</p></div> : (
            <div style={{ display: "grid", gap: 8 }}>
              {priorities.sort((a, b) => a.name.localeCompare(b.name)).map((p) => (
                <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 40, fontSize: 13, fontWeight: 600, flexShrink: 0 }}><StatusPill tone={priorityTone(p.name)}>{p.name}</StatusPill></span>
                  <div style={{ flex: 1, height: 8, background: "var(--line)", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ width: `${p.rate}%`, height: "100%", background: p.rate >= 80 ? "var(--green)" : p.rate >= 50 ? "var(--amber)" : "var(--red)", borderRadius: 4, transition: "width 0.3s" }} />
                  </div>
                  <span style={{ width: 50, fontSize: 12, color: "var(--text-secondary)" }}>{p.passed}/{p.total}</span>
                  <StatusPill tone={toneForRate(p.rate)}>{p.rate}%</StatusPill>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* 未通过用例列表 */}
      <section className="work-panel">
        <h3 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 12px" }}>未通过用例（{failedCases.length}）</h3>
        {failedCases.length === 0 ? <div className="empty-state"><p>所有用例已通过，无待处理问题</p></div> : (
          <DataTable rows={failedCases} getRowKey={(r) => r.id} columns={[
            { key: "caseCode", label: "编号", render: (r) => r.caseCode },
            { key: "module", label: "模块", render: (r) => r.module },
            { key: "title", label: "用例标题", align: "left", render: (r) => r.title },
            { key: "priority", label: "优先级", align: "center", render: (r) => <StatusPill tone={priorityTone(r.priority)}>{r.priority}</StatusPill> },
            { key: "reviewStatus", label: "状态", align: "center", render: (r) => <StatusPill tone={reviewTone(r.reviewStatus)}>{r.reviewStatus}</StatusPill> },
            { key: "automation", label: "是否自动化", align: "center", render: (r) => r.automation === "适合" ? "是" : "否" },
          ]} />
        )}
      </section>

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
  const { files } = useProjectData(projectId);
  return (
    <div className="page-stack page-stack--spaced page-stack--fill">
      <SectionHeader title="项目文档" description="项目已上传的文档列表。" />
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
  const { testCases } = useProjectData(projectId);
  const [manualResults, setManualResults] = useState<Record<string, string>>({});
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUploadManual = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const mockResults: Record<string, string> = {};
    testCases.slice(0, Math.min(5, testCases.length)).forEach((tc, i) => { mockResults[tc.caseCode] = i % 3 === 0 ? "通过" : i % 3 === 1 ? "失败" : "阻塞"; });
    setManualResults(mockResults);
    toast.success("手动测试结果已导入");
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="page-stack page-stack--spaced page-stack--fill">
      <SectionHeader title="手动 + 自动化结果合并" description="上传手动测试结果文档，与自动化测试数据按用例编号合并展示。"
        actions={<><input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: "none" }} onChange={handleUploadManual} /><button className="primary-button" type="button" onClick={() => inputRef.current?.click()}><FileUp size={13} /> 上传手动测试结果</button></>} />
      <section className="work-panel">
        {testCases.length === 0 ? <div className="empty-state"><p>暂无测试用例数据</p></div> : (
          <DataTable rows={testCases} getRowKey={(r) => r.id} columns={[
            { key: "module", label: "模块", render: (r) => r.module },
            { key: "caseCode", label: "用例编号", render: (r) => r.caseCode },
            { key: "title", label: "用例标题", align: "left", render: (r) => r.title },
            { key: "testType", label: "测试类型", align: "center", render: (r) => r.testType || "功能测试" },
            { key: "steps", label: "测试步骤", align: "left", render: (r) => <span style={{ fontSize: 12, maxWidth: 200, display: "inline-block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.steps || "-"}</span> },
            { key: "expectedResult", label: "预期结果", align: "left", render: (r) => <span style={{ fontSize: 12, maxWidth: 200, display: "inline-block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.expectedResult || "-"}</span> },
            { key: "actualResult", label: "实测结果", align: "left", render: (r) => <span style={{ fontSize: 12, maxWidth: 200, display: "inline-block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.actualResult || <span style={{ color: "var(--text-secondary)" }}>-</span>}</span> },
            { key: "passed", label: "是否通过", align: "center", render: (r) => r.passed === "通过" ? <StatusPill tone="green">通过</StatusPill> : r.passed === "失败" ? <StatusPill tone="red">失败</StatusPill> : <StatusPill tone="slate">未执行</StatusPill> },
            { key: "actions", label: "操作", align: "center", render: (r) => (
              <div className="inline-actions">
                <button className="text-button" type="button" onClick={() => toast.info(`查看用例 ${r.caseCode}`)}>查看</button>
                <button className="text-button" type="button" onClick={() => toast.info(`编辑用例 ${r.caseCode}`)}>编辑</button>
                <button className="text-button text-button--danger" type="button" onClick={async () => { try { await testCasesApi.delete(r.id); } catch {} toast.success("已删除"); }}>删除</button>
              </div>
            ) },
          ]} />
        )}
      </section>
    </div>
  );
}

// ═══════════════════════════════════════
// 文档生成（模板 + 生成 + 下载）
// ═══════════════════════════════════════

function DocGenerateTab({ projectId }: { projectId: string }) {
  const { files } = useProjectData(projectId);
  const { testCases } = useProjectData(projectId);
  const templates = [
    { id: "tpl-plan", name: "软件测试计划", desc: "测试范围、策略、资源、进度安排", needs: ["files"] },
    { id: "tpl-spec", name: "软件测试说明", desc: "测试环境、用例设计、执行方法", needs: ["files", "testCases"] },
    { id: "tpl-report", name: "软件测试报告", desc: "执行结果、缺陷统计、风险分析", needs: ["testCases"] },
    { id: "tpl-pc", name: "PC端操作手册", desc: "系统操作流程、功能说明", needs: ["files"] },
    { id: "tpl-app", name: "APP端操作手册", desc: "移动端操作流程、功能说明", needs: ["files"] },
  ];
  const [generating, setGenerating] = useState<string | null>(null);
  const [generated, setGenerated] = useState<Set<string>>(new Set());
  const handleGenerate = (id: string) => { setGenerating(id); setTimeout(() => { setGenerating(null); setGenerated((p) => new Set(p).add(id)); toast.success("文档生成完成，可点击下载"); }, 2000); };
  const isReady = (needs: string[]) => { if (needs.includes("files") && files.length === 0) return false; if (needs.includes("testCases") && testCases.length === 0) return false; return true; };

  return (
    <div className="page-stack page-stack--spaced page-stack--fill">
      <SectionHeader title="文档生成" description="选择文档模板，系统将根据项目数据自动生成 Word 文档。" />
      <section className="work-panel">
        <DataTable rows={templates} getRowKey={(r) => r.id} columns={[
          { key: "name", label: "模板名称", render: (r) => r.name },
          { key: "desc", label: "说明", render: (r) => r.desc },
          { key: "needs", label: "前置数据", render: (r) => r.needs.map((n) => n === "files" ? "文档" : "用例").join("、") },
          { key: "status", label: "状态", align: "center", render: (r) => {
            const ready = isReady(r.needs);
            const done = generated.has(r.id);
            if (done) return <StatusPill tone="green">已生成</StatusPill>;
            if (!ready) return <StatusPill tone="amber">数据不足</StatusPill>;
            return <StatusPill tone="slate">待生成</StatusPill>;
          }},
          { key: "time", label: "上传时间", render: () => formatTime(new Date().toISOString()) },
          { key: "actions", label: "操作", align: "center", render: (r) => {
            const ready = isReady(r.needs);
            const done = generated.has(r.id);
            return (
              <div className="inline-actions">
                <button className="text-button" type="button" onClick={() => toast.info(`${r.name}：${r.desc}`)}>查看</button>
                <button className="text-button" type="button" disabled={!ready}>{ready ? "编辑" : "编辑"}</button>
                <button className="text-button" type="button" onClick={() => handleGenerate(r.id)} disabled={generating === r.id || !ready}>
                  {generating === r.id ? "生成中..." : "生成"}
                </button>
                <button className="text-button" type="button" onClick={() => {
                  if (!done) { toast.warning("请先生成文档"); return; }
                  toast.success("下载最终文档");
                }}>最终文档</button>
              </div>
            );
          }},
        ]} />
      </section>
    </div>
  );
}

// ═══════════════════════════════════════
// 文档检验
// ═══════════════════════════════════════

function DocVerifyTab({ projectId }: { projectId: string }) {
  const { files } = useProjectData(projectId);
  const { testCases } = useProjectData(projectId);
  const checks = [
    { name: "需求文档完整性", pass: files.length > 0, detail: files.length > 0 ? `已上传 ${files.length} 个文档` : "未上传需求文档" },
    { name: "测试用例覆盖", pass: testCases.length > 0, detail: testCases.length > 0 ? `已生成 ${testCases.length} 条用例` : "未生成测试用例" },
    { name: "P0 用例评审", pass: testCases.filter((c) => c.priority === "P0" && c.reviewStatus === "已通过").length > 0, detail: `${testCases.filter((c) => c.priority === "P0").length} 条 P0 用例` },
    { name: "模块覆盖度", pass: new Set(testCases.map((c) => c.module)).size >= 2, detail: `覆盖 ${new Set(testCases.map((c) => c.module)).size} 个模块` },
  ];
  return (
    <div className="page-stack page-stack--spaced page-stack--fill">
      <SectionHeader title="文档完整性校验" description="检查项目数据是否满足生成测试文档的条件。" />
      <section className="work-panel">
        <div style={{ display: "grid", gap: 12 }}>
          {checks.map((c) => <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--line)" }}><StatusPill tone={c.pass ? "green" : "red"}>{c.pass ? "通过" : "未通过"}</StatusPill><div><strong>{c.name}</strong><p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>{c.detail}</p></div></div>)}
        </div>
      </section>
    </div>
  );
}

// ═══════════════════════════════════════
// 主页面
// ═══════════════════════════════════════

const tabComponents: Record<TabKey, React.FC<{ projectId: string }>> = {
  overview: OverviewTab, files: FilesTab, requirements: RequirementsTab, testPoints: TestPointsTab, testCases: TestCasesTab,
  scripts: ScriptsTab, executeScripts: ExecuteScriptsTab, docFusion: DocFusionTab, summary: SummaryTab,
  docGenerate: DocGenerateTab, docVerify: DocVerifyTab,
};

const TAB_STORAGE_KEY = "aitestlink-project-tab";

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { project } = useProjectData(id);
  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    return (localStorage.getItem(TAB_STORAGE_KEY) as TabKey) || "overview";
  });
  const tabContentRef = useRef<HTMLDivElement>(null);
  const handleTabChange = (tab: TabKey) => { setActiveTab(tab); localStorage.setItem(TAB_STORAGE_KEY, tab); };

  // 监听通知点击的 CustomEvent，实时切换 tab 并持久化
  useEffect(() => {
    const handler = (e: Event) => {
      const { tab, projectId } = (e as CustomEvent).detail;
      if (projectId === id && tab) {
        setActiveTab(tab as TabKey);
        localStorage.setItem(TAB_STORAGE_KEY, tab);
      }
    };
    window.addEventListener("aitestlink:navigate-tab", handler);
    return () => window.removeEventListener("aitestlink:navigate-tab", handler);
  }, [id]);

  useEffect(() => {
    tabContentRef.current?.scrollTo({ top: 0 });
  }, [activeTab]);

  if (!project) {
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
        {ActiveComponent && <ActiveComponent projectId={project.id} />}
      </div>
    </div>
  );
}
