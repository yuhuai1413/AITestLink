import { useMemo, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, WandSparkles, Loader2 } from "lucide-react";
import { useStore, useProject, useProjectFiles, useProjectTestPoints, useProjectTestCases } from "../../app/store";
import { useAIAction } from "../../shared/hooks/useAIAction";
import { DataTable } from "../../shared/components/DataTable";
import { SectionHeader } from "../../shared/components/SectionHeader";
import { StatusPill } from "../../shared/components/StatusPill";
import { TestCaseDetailModal } from "../test-design/TestCaseDetailModal";
import type { Priority, TestCase } from "../../shared/types/platform";

type TabKey =
  | "overview" | "files" | "testPoints" | "testCases" | "scripts" | "summary"
  | "docManage" | "docFusion" | "docGenerate" | "docVerify";

const allTabs: { key: TabKey; label: string }[] = [
  { key: "overview", label: "概览" },
  { key: "files", label: "输入资料" },
  { key: "testPoints", label: "功能点" },
  { key: "testCases", label: "测试用例" },
  { key: "scripts", label: "自动化脚本" },
  { key: "summary", label: "测试汇总" },
  { key: "docManage", label: "文档管理" },
  { key: "docFusion", label: "数据融合" },
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

function statusTone(s: string) {
  if (s === "阻塞") return "red" as const;
  if (s === "已完成") return "green" as const;
  if (s === "执行中") return "blue" as const;
  return "amber" as const;
}

// ─── 概览 ───

function OverviewTab({ projectId }: { projectId: string }) {
  const project = useProject(projectId);
  const files = useProjectFiles(projectId);
  const testPoints = useProjectTestPoints(projectId);
  const testCases = useProjectTestCases(projectId);
  if (!project) return null;
  const p0Cases = testCases.filter((c) => c.priority === "P0").length;
  const autoCount = testCases.filter((c) => c.automation === "适合").length;
  const autoRate = testCases.length > 0 ? Math.round(autoCount / testCases.length * 100) : 0;

  const cards = [
    { label: "项目状态", value: <StatusPill tone={statusTone(project.status)}>{project.status}</StatusPill> },
    { label: "风险等级", value: <StatusPill tone={project.priority === "高" ? "red" : project.priority === "中" ? "amber" : "green"}>{project.priority}</StatusPill> },
    { label: "文档数量", value: files.length },
    { label: "测试点", value: testPoints.length },
    { label: "测试用例", value: testCases.length },
    { label: "P0 用例", value: p0Cases },
    { label: "自动化覆盖", value: `${autoRate}%` },
    { label: "测试类型", value: project.testType },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-sm)", flex: 1 }}>
      <div className="overview-grid">
        {cards.map((c) => (
          <div className="overview-stat" key={c.label}>
            <span className="overview-stat__label">{c.label}</span>
            <strong className="overview-stat-value">{c.value}</strong>
          </div>
        ))}
      </div>
      <section className="work-panel">
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

// ─── 输入资料 ───

function FilesTab({ projectId }: { projectId: string }) {
  const files = useProjectFiles(projectId);
  return (
    <div className="page-stack">
      <SectionHeader title="文档管理" description="管理项目的需求文档、接口文档、原型和变更说明。" />
      <section className="work-panel">
        {files.length === 0 ? (
          <div className="empty-state"><p>暂无文档，请在项目空间上传。</p></div>
        ) : (
          <DataTable rows={files} getRowKey={(r) => r.id} columns={[
            { key: "name", label: "文件名", align: "left", render: (r) => <strong>{r.name}</strong> },
            { key: "type", label: "类型", render: (r) => r.fileType },
            { key: "size", label: "大小", render: (r) => r.size },
            { key: "parseStatus", label: "解析状态", align: "center", render: (r) => <StatusPill tone={r.parseStatus === "已完成" ? "green" : r.parseStatus === "解析中" ? "blue" : "slate"}>{r.parseStatus}</StatusPill> },
            { key: "date", label: "上传时间", render: (r) => r.uploadedAt },
          ]} />
        )}
      </section>
    </div>
  );
}

// ─── 功能点 ───

function TestPointsTab({ projectId }: { projectId: string }) {
  const testPoints = useProjectTestPoints(projectId);
  const { loading, error, generateTestPoints } = useAIAction(projectId);
  const [moduleFilter, setModuleFilter] = useState("all");
  const modules = useMemo(() => Array.from(new Set(testPoints.map((tp) => tp.module))), [testPoints]);
  const filtered = useMemo(() => moduleFilter === "all" ? testPoints : testPoints.filter((tp) => tp.module === moduleFilter), [testPoints, moduleFilter]);

  return (
    <div className="page-stack">
      <SectionHeader title="功能点生成" description="AI 从文档中提取测试点。"
        actions={<button className="primary-button" type="button" onClick={generateTestPoints} disabled={loading}>{loading ? <Loader2 size={17} className="animate-spin" /> : <WandSparkles size={17} />}{loading ? "生成中..." : "生成测试点"}</button>} />
      {error && <div className="error-banner"><span>{error}</span></div>}
      {modules.length > 0 && (
        <div className="filter-bar">
          <span className="filter-label">模块筛选</span>
          <select className="filter-select" value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)}>
            <option value="all">全部模块</option>
            {modules.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      )}
      <section className="work-panel">
        {filtered.length === 0 ? <div className="empty-state"><p>暂无测试点</p></div> : (
          <DataTable rows={filtered} getRowKey={(r) => r.id} columns={[
            { key: "id", label: "编号", render: (r) => r.id },
            { key: "module", label: "模块", render: (r) => r.module },
            { key: "type", label: "类型", render: (r) => r.type },
            { key: "title", label: "测试点", align: "left", render: (r) => r.title },
            { key: "priority", label: "优先级", align: "center", render: (r) => <StatusPill tone={priorityTone(r.priority)}>{r.priority}</StatusPill> },
            { key: "reviewStatus", label: "评审", align: "center", render: (r) => <StatusPill tone={reviewTone(r.reviewStatus)}>{r.reviewStatus}</StatusPill> },
          ]} />
        )}
      </section>
    </div>
  );
}

// ─── 测试用例 ───

function TestCasesTab({ projectId }: { projectId: string }) {
  const testCases = useProjectTestCases(projectId);
  const { loading, error, generateTestCases } = useAIAction(projectId);
  const [detailCase, setDetailCase] = useState<TestCase | null>(null);
  const [moduleFilter, setModuleFilter] = useState("all");
  const modules = useMemo(() => Array.from(new Set(testCases.map((tc) => tc.module))), [testCases]);
  const filtered = useMemo(() => moduleFilter === "all" ? testCases : testCases.filter((tc) => tc.module === moduleFilter), [testCases, moduleFilter]);

  return (
    <div className="page-stack">
      <SectionHeader title="用例生成" description="从测试点生成可执行用例。"
        actions={<button className="primary-button" type="button" onClick={generateTestCases} disabled={loading}>{loading ? <Loader2 size={17} className="animate-spin" /> : <WandSparkles size={17} />}{loading ? "生成中..." : "生成用例"}</button>} />
      {error && <div className="error-banner"><span>{error}</span></div>}
      {modules.length > 0 && (
        <div className="filter-bar">
          <span className="filter-label">模块筛选</span>
          <select className="filter-select" value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)}>
            <option value="all">全部模块</option>
            {modules.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      )}
      <section className="work-panel">
        {filtered.length === 0 ? <div className="empty-state"><p>暂无测试用例</p></div> : (
          <DataTable rows={filtered} getRowKey={(r) => r.id} columns={[
            { key: "caseCode", label: "编号", render: (r) => r.caseCode },
            { key: "module", label: "模块", render: (r) => r.module },
            { key: "title", label: "用例标题", align: "left", render: (r) => <button type="button" className="text-button table-link" onClick={() => setDetailCase(r)}>{r.title}</button> },
            { key: "priority", label: "优先级", align: "center", render: (r) => <StatusPill tone={priorityTone(r.priority)}>{r.priority}</StatusPill> },
            { key: "reviewStatus", label: "评审", align: "center", render: (r) => <StatusPill tone={reviewTone(r.reviewStatus)}>{r.reviewStatus}</StatusPill> },
            { key: "automation", label: "自动化", align: "center", render: (r) => r.automation },
          ]} />
        )}
      </section>
      <TestCaseDetailModal open={!!detailCase} testCase={detailCase} onClose={() => setDetailCase(null)} />
    </div>
  );
}

// ─── 自动化脚本 ───

function ScriptsTab({ projectId }: { projectId: string }) {
  const testCases = useProjectTestCases(projectId);
  const automatable = useMemo(() => testCases.filter((tc) => tc.automation === "适合"), [testCases]);
  return (
    <div className="page-stack">
      <SectionHeader title="脚本生成" description="AI 根据测试用例生成自动化脚本（仅生成，不执行）。" />
      <section className="work-panel">
        {automatable.length === 0 ? <div className="empty-state"><p>暂无可自动化的用例</p></div> : (
          <div>
            <p style={{ marginBottom: 12, color: "var(--muted)", fontSize: 14 }}>共 <strong style={{ color: "var(--text)" }}>{automatable.length}</strong> 条适合自动化的用例</p>
            <DataTable rows={automatable} getRowKey={(r) => r.id} columns={[
              { key: "caseCode", label: "用例编号", render: (r) => r.caseCode },
              { key: "module", label: "模块", render: (r) => r.module },
              { key: "title", label: "用例标题", align: "left", render: (r) => r.title },
              { key: "priority", label: "优先级", align: "center", render: (r) => <StatusPill tone={priorityTone(r.priority)}>{r.priority}</StatusPill> },
            ]} />
          </div>
        )}
      </section>
    </div>
  );
}

// ─── 测试汇总 ───

function SummaryTab({ projectId }: { projectId: string }) {
  const files = useProjectFiles(projectId);
  const testPoints = useProjectTestPoints(projectId);
  const testCases = useProjectTestCases(projectId);
  const passedTP = testPoints.filter((tp) => tp.reviewStatus === "已通过").length;
  const passedTC = testCases.filter((tc) => tc.reviewStatus === "已通过").length;
  const autoCount = testCases.filter((tc) => tc.automation === "适合").length;

  const stats = [
    { label: "文档总数", value: files.length },
    { label: "测试点总数", value: testPoints.length, sub: `已通过 ${passedTP}` },
    { label: "用例总数", value: testCases.length, sub: `已通过 ${passedTC}` },
    { label: "自动化用例", value: autoCount, sub: `覆盖率 ${testCases.length > 0 ? Math.round(autoCount / testCases.length * 100) : 0}%` },
    { label: "P0 用例", value: testCases.filter((c) => c.priority === "P0").length },
    { label: "需修改", value: testCases.filter((c) => c.reviewStatus === "需修改").length },
  ];

  return (
    <div className="page-stack">
      <SectionHeader title="测试进度概览" description="手动测试数据与自动化测试结果的汇总统计。" />
      <div className="dash-stats" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        {stats.map((s) => (
          <div className="dash-stat-card" key={s.label}>
            <div className="dash-stat-body">
              <span className="dash-stat-label">{s.label}</span>
              <strong className="dash-stat-value">{s.value}</strong>
              {s.sub && <span className="dash-stat-sub">{s.sub}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── 文档管理 ───

function DocManageTab({ projectId }: { projectId: string }) {
  const files = useProjectFiles(projectId);
  return (
    <div className="page-stack">
      <SectionHeader title="项目文档" description="管理项目的需求文档、接口文档、原型和变更说明。" />
      <section className="work-panel">
        {files.length === 0 ? <div className="empty-state"><p>暂无文档</p></div> : (
          <DataTable rows={files} getRowKey={(r) => r.id} columns={[
            { key: "name", label: "文件名", align: "left", render: (r) => <strong>{r.name}</strong> },
            { key: "type", label: "类型", render: (r) => r.fileType },
            { key: "size", label: "大小", render: (r) => r.size },
            { key: "parseStatus", label: "解析状态", align: "center", render: (r) => <StatusPill tone={r.parseStatus === "已完成" ? "green" : r.parseStatus === "解析中" ? "blue" : "slate"}>{r.parseStatus}</StatusPill> },
            { key: "date", label: "上传时间", render: (r) => r.uploadedAt },
          ]} />
        )}
      </section>
    </div>
  );
}

// ─── 数据融合 ───

function DocFusionTab({ projectId }: { projectId: string }) {
  const testCases = useProjectTestCases(projectId);
  return (
    <div className="page-stack">
      <SectionHeader title="手动 + 自动化结果合并" description="上传手动测试结果文档，与自动化测试数据按用例编号合并展示。"
        actions={<button className="primary-button" type="button">上传手动测试结果</button>} />
      <section className="work-panel">
        {testCases.length === 0 ? <div className="empty-state"><p>暂无测试用例数据</p></div> : (
          <DataTable rows={testCases} getRowKey={(r) => r.id} columns={[
            { key: "caseCode", label: "用例编号", render: (r) => r.caseCode },
            { key: "title", label: "用例标题", align: "left", render: (r) => r.title },
            { key: "module", label: "模块", render: (r) => r.module },
            { key: "priority", label: "优先级", align: "center", render: (r) => r.priority },
            { key: "automation", label: "自动化状态", align: "center", render: (r) => r.automation },
            { key: "reviewStatus", label: "评审结果", align: "center", render: (r) => <StatusPill tone={r.reviewStatus === "已通过" ? "green" : r.reviewStatus === "需修改" ? "red" : "amber"}>{r.reviewStatus}</StatusPill> },
            { key: "manualResult", label: "手动执行结果", align: "center", render: () => <StatusPill tone="slate">-</StatusPill> },
          ]} />
        )}
      </section>
    </div>
  );
}

// ─── 文档生成 ───

function DocGenerateTab() {
  const templates = [
    { id: "tpl-plan", name: "软件测试计划", desc: "测试范围、策略、资源、进度安排", icon: "📋" },
    { id: "tpl-spec", name: "软件测试说明", desc: "测试环境、用例设计、执行方法", icon: "📝" },
    { id: "tpl-report", name: "软件测试报告", desc: "执行结果、缺陷统计、风险分析", icon: "📊" },
    { id: "tpl-pc", name: "PC端操作手册", desc: "系统操作流程、功能说明", icon: "💻" },
    { id: "tpl-app", name: "APP端操作手册", desc: "移动端操作流程、功能说明", icon: "📱" },
  ];
  const [generating, setGenerating] = useState<string | null>(null);
  const handleGenerate = (id: string) => { setGenerating(id); setTimeout(() => { setGenerating(null); alert("生成完成！"); }, 2000); };

  return (
    <div className="page-stack">
      <SectionHeader title="选择模板生成文档" description="选择文档模板，系统将根据项目数据自动生成 Word 文档。" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
        {templates.map((t) => (
          <div key={t.id} className="dash-card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 28 }}>{t.icon}</span>
              <div><strong style={{ fontSize: 15 }}>{t.name}</strong><p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>{t.desc}</p></div>
            </div>
            <button className="primary-button" type="button" style={{ width: "100%" }} onClick={() => handleGenerate(t.id)} disabled={generating === t.id}>{generating === t.id ? "生成中..." : "生成文档"}</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── 文档检验 ───

function DocVerifyTab({ projectId }: { projectId: string }) {
  const files = useProjectFiles(projectId);
  const testCases = useProjectTestCases(projectId);
  const checks = [
    { name: "需求文档完整性", pass: files.length > 0, detail: files.length > 0 ? `已上传 ${files.length} 个文档` : "未上传需求文档" },
    { name: "测试用例覆盖", pass: testCases.length > 0, detail: testCases.length > 0 ? `已生成 ${testCases.length} 条用例` : "未生成测试用例" },
    { name: "P0 用例评审", pass: testCases.filter((c) => c.priority === "P0" && c.reviewStatus === "已通过").length > 0, detail: `${testCases.filter((c) => c.priority === "P0").length} 条 P0 用例` },
    { name: "模块覆盖度", pass: new Set(testCases.map((c) => c.module)).size >= 2, detail: `覆盖 ${new Set(testCases.map((c) => c.module)).size} 个模块` },
  ];
  return (
    <div className="page-stack">
      <SectionHeader title="文档完整性校验" description="检查项目数据是否满足生成测试文档的条件。" />
      <section className="work-panel">
        <div style={{ display: "grid", gap: 12 }}>
          {checks.map((c) => (
            <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--line)" }}>
              <StatusPill tone={c.pass ? "green" : "red"}>{c.pass ? "通过" : "未通过"}</StatusPill>
              <div><strong>{c.name}</strong><p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>{c.detail}</p></div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ─── 主页面 ───

const tabComponents: Record<TabKey, React.FC<{ projectId: string }>> = {
  overview: OverviewTab,
  files: FilesTab,
  testPoints: TestPointsTab,
  testCases: TestCasesTab,
  scripts: ScriptsTab,
  summary: SummaryTab,
  docManage: DocManageTab,
  docFusion: DocFusionTab,
  docGenerate: DocGenerateTab as any,
  docVerify: DocVerifyTab,
};

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const project = useProject(id);
  const initialTab = (searchParams.get("tab") as TabKey) || "overview";
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);

  if (!project) {
    return (
      <div className="page-stack">
        <div className="empty-state">
          <p>项目不存在或已删除。</p>
          <button className="primary-button" type="button" onClick={() => navigate("/projects")}>返回项目列表</button>
        </div>
      </div>
    );
  }

  const ActiveComponent = tabComponents[activeTab];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-sm)", flex: 1 }}>
      <div className="detail-header">
        <button className="ghost-button" type="button" onClick={() => navigate("/projects")}><ArrowLeft size={17} /> 返回</button>
        <h2 style={{ margin: 0 }}>{project.name}</h2>
        <StatusPill tone={statusTone(project.status)}>{project.status}</StatusPill>
      </div>

      <div className="tab-bar">
        {allTabs.map((tab) => (
          <button key={tab.key} type="button" className={`tab-button ${activeTab === tab.key ? "tab-button--active" : ""}`} onClick={() => setActiveTab(tab.key)}>{tab.label}</button>
        ))}
      </div>

      <div className="tab-content">
        {ActiveComponent && <ActiveComponent projectId={project.id} />}
      </div>
    </div>
  );
}
