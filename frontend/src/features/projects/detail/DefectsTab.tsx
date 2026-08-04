import { useCallback, useEffect, useState } from "react";
import { Download, FileText, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { useProjectData } from "../useProjectData";
import { defectsApi } from "../../../api/defect.api";
import { DataTable, type Column } from "../../../shared/components/DataTable";
import { SectionHeader } from "../../../shared/components/SectionHeader";
import { StatusPill } from "../../../shared/components/StatusPill";
import { Modal } from "../../../shared/components/Modal";
import { MenuSelect, type MenuSelectOption } from "../../../shared/components/MenuSelect";
import { RichTextEditor } from "../../../shared/components/RichTextEditor";
import { getMe } from "../../../features/auth/api/auth";
import type { Defect, DefectCreate, DefectSeverity, DefectPriority, DefectStatus, DefectCategory } from "../../../contracts/defect";
import { formatProjectTime as formatTime } from "./projectDetail.config";

const SEVERITY_OPTIONS: MenuSelectOption<DefectSeverity>[] = (["致命", "严重", "一般", "轻微", "建议"] as const).map((v) => ({ value: v, label: v }));
const PRIORITY_OPTIONS: MenuSelectOption<DefectPriority>[] = (["P0", "P1", "P2", "P3"] as const).map((v) => ({ value: v, label: v }));
const STATUS_OPTIONS: MenuSelectOption<DefectStatus>[] = (["新建", "确认", "修复中", "已修复", "已验证", "已关闭", "重新打开"] as const).map((v) => ({ value: v, label: v }));
const CATEGORY_OPTIONS: MenuSelectOption<DefectCategory>[] = (["功能缺陷", "性能缺陷", "界面缺陷", "安全缺陷", "兼容性缺陷"] as const).map((v) => ({ value: v, label: v }));

const severityTone = (s: string) => s === "致命" || s === "严重" ? "red" : s === "一般" ? "amber" : "slate";
const statusTone = (s: string) => {
  if (s === "已修复" || s === "已验证" || s === "已关闭") return "green";
  if (s === "修复中") return "blue";
  if (s === "重新打开") return "red";
  return "slate";
};
const priorityTone = (p: string) => p === "P0" ? "red" : p === "P1" ? "amber" : "slate";
const sourceTone = (s: string) => s === "自动化" ? "blue" : "slate";

const emptyForm: DefectCreate = {
  title: "",
  description: "",
  severity: "一般",
  priority: "P1",
  status: "新建",
  module: "",
  category: "功能缺陷",
  source: "手工",
  testCaseId: null,
  scriptId: null,
  executionRunId: null,
  expectedResult: "",
  assignee: "",
  testPlan: "",
  iteration: "",
  environmentInfo: "",
  reporter: "",
  remark: "",
  stepsToReproduce: "",
  actualResult: "",
};

/* DefectForm: left-right split layout matching screenshot */
function DefectForm({ form, setForm, testCases }: { form: DefectCreate; setForm: (f: DefectCreate) => void; testCases?: { id: string; caseCode: string; title: string }[] }) {
  const update = (patch: Partial<DefectCreate>) => setForm({ ...form, ...patch });

  const Select = ({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: MenuSelectOption<string>[] }) => (
    <MenuSelect value={value} options={options} onChange={onChange} />
  );

  const testCaseOptions: MenuSelectOption<string>[] = (testCases || []).map((tc) => ({ value: tc.id, label: tc.caseCode + " · " + tc.title }));

  return (
    <div className="defect-form-split">
      {/* Left: title + rich text editor */}
      <div className="defect-form-split__left">
        <div className="defect-form-title-area">
          <label className="defect-form-title-area__label">{"测试缺陷标题"}</label>
          <input
            className="form-input defect-form-title-area__input"
            value={form.title}
            onChange={(e) => update({ title: e.target.value })}
            placeholder={"简要描述缺陷现象"}
          />
        </div>

        <div className="defect-form-editor-area">
          <label className="defect-form-editor-area__label">{"缺陷详情"}</label>
          <RichTextEditor
            value={form.description || ""}
            onChange={(html) => update({ description: html })}
            placeholder={"请详细描述缺陷的复现步骤、期望结果和实际结果..."}
          />
        </div>
      </div>

      {/* Right: basic info sidebar */}
      <div className="defect-form-split__right">
        <div className="defect-form-sidebar">
          <h4 className="defect-form-sidebar__title">{"缺陷基础信息"}</h4>

          <div className="defect-form-sidebar__field">
            <label className="defect-form-sidebar__label">{"用例标题"}</label>
            <Select value={form.testCaseId || ""} onChange={(v) => update({ testCaseId: v || null })} options={[{ value: "", label: "请选择" }, ...testCaseOptions]} />
          </div>

          <div className="defect-form-sidebar__field">
            <label className="defect-form-sidebar__label">{"严重程度"}</label>
            <Select value={form.severity || "一般"} onChange={(v) => update({ severity: v as DefectSeverity })} options={SEVERITY_OPTIONS} />
          </div>

          <div className="defect-form-sidebar__field">
            <label className="defect-form-sidebar__label">{"优先级"}</label>
            <Select value={form.priority || "P1"} onChange={(v) => update({ priority: v as DefectPriority })} options={PRIORITY_OPTIONS} />
          </div>

          <div className="defect-form-sidebar__field">
            <label className="defect-form-sidebar__label">{"缺陷类型"}</label>
            <Select value={form.category || "功能缺陷"} onChange={(v) => update({ category: v as DefectCategory })} options={CATEGORY_OPTIONS} />
          </div>

          <div className="defect-form-sidebar__field">
            <label className="defect-form-sidebar__label">{"指派给"}</label>
            <input className="form-input" value={form.assignee || ""} onChange={(e) => update({ assignee: e.target.value })} placeholder={"负责人"} />
          </div>


        </div>
      </div>
    </div>
  );
}

/* Main component */
export function DefectsTab({ projectId }: { projectId: string }) {
  const { testCases, initialLoading } = useProjectData(projectId);
  const [defects, setDefects] = useState<Defect[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editDefect, setEditDefect] = useState<Defect | null>(null);
  const [form, setForm] = useState<DefectCreate>({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailDefect, setDetailDefect] = useState<Defect | null>(null);
  const [currentUser, setCurrentUser] = useState<string>("");

  useEffect(() => {
    getMe()
      .then((res) => setCurrentUser(res.user.nickname || res.user.phone || ""))
      .catch(() => {});
  }, []);

  const fetchDefects = useCallback(async () => {
    try {
      const data = await defectsApi.list(projectId);
      setDefects(data);
    } catch { /* ignore */ }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { fetchDefects(); }, [fetchDefects]);
  useEffect(() => {
    const handler = () => fetchDefects();
    window.addEventListener("aitestlink:data-refresh", handler);
    return () => window.removeEventListener("aitestlink:data-refresh", handler);
  }, [fetchDefects]);

  const allSelected = defects.length > 0 && defects.every((d) => selectedIds.has(d.id));
  const toggleSelectAll = () => setSelectedIds(allSelected ? new Set() : new Set(defects.map((d) => d.id)));
  const toggleSelect = (id: string) => setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const openCreate = () => { setEditDefect(null); setForm({ ...emptyForm, reporter: currentUser }); setShowForm(true); };
  const openEdit = (d: Defect) => {
    setEditDefect(d);
    setForm({
      title: d.title, description: d.description, severity: d.severity, priority: d.priority, status: d.status,
      module: d.module, category: d.category, source: d.source || "手工", testCaseId: d.testCaseId,
      scriptId: d.scriptId, executionRunId: d.executionRunId, screenshotUrl: d.screenshotUrl,
      stepsToReproduce: d.stepsToReproduce, expectedResult: d.expectedResult,
      actualResult: d.actualResult, environmentInfo: d.environmentInfo,
      reporter: d.reporter, assignee: d.assignee, remark: d.remark,
      testPlan: d.testPlan, iteration: d.iteration,
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) { toast.warning("请填写缺陷标题"); return; }
    setSaving(true);
    try {
      if (editDefect) { await defectsApi.update(editDefect.id, form); toast.success("缺陷已更新"); }
      else { await defectsApi.create(projectId, form); toast.success("缺陷已创建"); }
      setShowForm(false);
      fetchDefects();
    } catch (err) { toast.error(err instanceof Error ? err.message : "操作失败"); }
    finally { setSaving(false); }
  };

  const handleDelete = async (d: Defect) => {
    if (!confirm("确定删除缺陷 " + d.defectCode + "？")) return;
    try { await defectsApi.delete(d.id); toast.success("已删除"); fetchDefects(); }
    catch (err) { toast.error(err instanceof Error ? err.message : "删除失败"); }
  };

  const handleBatchStatus = async (status: string) => {
    if (selectedIds.size === 0) { toast.warning("请先选择缺陷"); return; }
    try {
      await defectsApi.batchStatus(Array.from(selectedIds), status);
      toast.success("已将 " + selectedIds.size + " 个缺陷状态更新「" + status + "」");
      setSelectedIds(new Set());
      fetchDefects();
    } catch (err) { toast.error(err instanceof Error ? err.message : "操作失败"); }
  };

  const handleExport = async () => {
    try {
      const blob = await defectsApi.export(projectId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "缺陷列表.xlsx"; a.click();
      URL.revokeObjectURL(url); toast.success("导出成功");
    } catch (err) { toast.error(err instanceof Error ? err.message : "导出失败"); }
  };

  const getTestCaseTitle = (testCaseId: string | null | undefined) => {
    if (!testCaseId) return "-";
    const tc = testCases.find((t) => t.id === testCaseId);
    return tc ? tc.caseCode + " · " + tc.title : "-";
  };

  const columns: Column<Defect>[] = [
    { key: "select", label: <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />, width: "40px", sticky: "left", render: (d) => <input type="checkbox" checked={selectedIds.has(d.id)} onChange={() => toggleSelect(d.id)} /> },
    { key: "defectCode", label: "缺陷编号", width: "120px", render: (d) => <span className="text-link" onClick={() => setDetailDefect(d)}>{d.defectCode}</span> },
    { key: "title", label: "标题", align: "left", lineClamp: 2, render: (d) => d.title },
    { key: "severity", label: "严重程度", width: "90px", render: (d) => <StatusPill tone={severityTone(d.severity)}>{d.severity}</StatusPill> },
    { key: "priority", label: "优先级", width: "76px", render: (d) => <StatusPill tone={priorityTone(d.priority)}>{d.priority}</StatusPill> },
    { key: "status", label: "状态", width: "96px", render: (d) => <StatusPill tone={statusTone(d.status)}>{d.status}</StatusPill> },
    { key: "category", label: "缺陷类型", width: "108px", render: (d) => d.category || "-" },
    { key: "source", label: "来源", width: "80px", render: (d) => <StatusPill tone={sourceTone(d.source || "手工")}>{d.source || "手工"}</StatusPill> },
    { key: "reporter", label: "创建人", width: "80px", render: (d) => d.reporter || "-" },
    { key: "assignee", label: "指派人", width: "80px", render: (d) => d.assignee || "-" },
    { key: "createdAt", label: "创建时间", width: "140px", render: (d) => formatTime(d.createdAt) },
    { key: "actions", label: "操作", width: "120px", sticky: "right", align: "center", render: (d) => (
      <div className="inline-actions">
        <button className="text-button" type="button" onClick={() => openEdit(d)}>编辑</button>
        <button className="text-button" type="button" onClick={() => handleDelete(d)}>删除</button>
      </div>
    )},
  ];

  return (
    <div className="page-stack page-stack--spaced page-stack--fill">
      <SectionHeader
        title={"缺陷统计"}
        description={"管理测试过程中发现的缺陷，跟踪修复进度。"}
        meta={<>共 <strong>{defects.length}</strong> 个缺陷</>}
        actions={
          <div className="section-actions-stack">
            <div className="section-actions-row">
              {selectedIds.size > 0 && ["确认", "修复中", "已修复", "已关闭"].map((s) => (
                <button key={s} className="ghost-button" type="button" onClick={() => handleBatchStatus(s)}>{"批量" + s}</button>
              ))}
              <button className="ghost-button" type="button" onClick={handleExport}><Download size={13} /> {"导出"}</button>
              <button className="primary-button" type="button" onClick={openCreate}><Plus size={13} /> {"新增缺陷"}</button>
            </div>
          </div>
        }
      />

      <section className="work-panel">
        {loading || initialLoading ? (
          <div className="empty-state"><Loader2 size={20} className="animate-spin text-muted" /><p className="empty-state__hint">{"加载中..."}</p></div>
        ) : defects.length === 0 ? (
          <div className="empty-state"><FileText size={20} className="text-muted" /><p>{"暂无缺陷，点击「新增缺陷」添加"}</p></div>
        ) : (
          <DataTable rows={defects} getRowKey={(d) => d.id} columns={columns} />
        )}
      </section>

      {/* Create/Edit modal */}
      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editDefect ? "编辑缺陷 " + editDefect.defectCode : "新增缺陷"}
        width={1060}
        height="85vh"
        footer={
          <div className="form-actions">
            <button className="ghost-button" type="button" onClick={() => setShowForm(false)}>{"取消"}</button>
            <button className="primary-button" type="button" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 size={13} className="animate-spin" /> : null}
              {saving ? "保存中..." : "保存"}
            </button>
          </div>
        }
      >
        <DefectForm form={form} setForm={setForm} testCases={testCases} />
      </Modal>

      {/* Detail modal */}
      <Modal open={!!detailDefect} onClose={() => setDetailDefect(null)} title={detailDefect ? detailDefect.defectCode + " - 缺陷详情" : "缺陷详情"} width={700} height="80vh">
        {detailDefect && (
          <div className="panel-stack scroll-fill">
            <div className="detail-grid">
              <div className="detail-row"><span className="detail-label">{"缺陷编号"}</span><span>{detailDefect.defectCode}</span></div>
              <div className="detail-row"><span className="detail-label">{"标题"}</span><span>{detailDefect.title}</span></div>
              <div className="detail-row"><span className="detail-label">{"严重程度"}</span><StatusPill tone={severityTone(detailDefect.severity)}>{detailDefect.severity}</StatusPill></div>
              <div className="detail-row"><span className="detail-label">{"优先级"}</span><StatusPill tone={priorityTone(detailDefect.priority)}>{detailDefect.priority}</StatusPill></div>
              <div className="detail-row"><span className="detail-label">{"状态"}</span><StatusPill tone={statusTone(detailDefect.status)}>{detailDefect.status}</StatusPill></div>
              <div className="detail-row"><span className="detail-label">{"缺陷类型"}</span><span>{detailDefect.category}</span></div>
              <div className="detail-row"><span className="detail-label">{"来源"}</span><StatusPill tone={sourceTone(detailDefect.source || "手工")}>{detailDefect.source || "手工"}</StatusPill></div>
              <div className="detail-row"><span className="detail-label">{"模块"}</span><span>{detailDefect.module || "-"}</span></div>
              <div className="detail-row"><span className="detail-label">{"发现人"}</span><span>{detailDefect.reporter || "-"}</span></div>
              <div className="detail-row"><span className="detail-label">{"指派人"}</span><span>{detailDefect.assignee || "-"}</span></div>
              <div className="detail-row"><span className="detail-label">{"环境信息"}</span><span>{detailDefect.environmentInfo || "-"}</span></div>
              <div className="detail-row"><span className="detail-label">{"关联用例"}</span><span>{getTestCaseTitle(detailDefect.testCaseId)}</span></div>
              <div className="detail-row"><span className="detail-label">{"创建时间"}</span><span>{formatTime(detailDefect.createdAt)}</span></div>
            </div>
            {detailDefect.stepsToReproduce && <div><h4 className="panel-title">{"复现步骤"}</h4><pre className="code-block">{detailDefect.stepsToReproduce}</pre></div>}
            {detailDefect.expectedResult && <div><h4 className="panel-title">{"期望结果"}</h4><pre className="code-block">{detailDefect.expectedResult}</pre></div>}
            {detailDefect.actualResult && <div><h4 className="panel-title">{"实际结果"}</h4><pre className="code-block code-block--error">{detailDefect.actualResult}</pre></div>}
            {detailDefect.screenshotUrl && (
              <div>
                <h4 className="panel-title">{"执行失败截图"}</h4>
                <a href={detailDefect.screenshotUrl} target="_blank" rel="noreferrer" className="defect-screenshot-link">
                  <img src={detailDefect.screenshotUrl} alt="执行失败截图" className="defect-screenshot" />
                </a>
              </div>
            )}
            {detailDefect.remark && <div><h4 className="panel-title">{"备注"}</h4><pre className="code-block code-block--muted">{detailDefect.remark}</pre></div>}
            <div className="form-actions">
              <button className="ghost-button" type="button" onClick={() => { setDetailDefect(null); openEdit(detailDefect); }}>{"编辑"}</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
