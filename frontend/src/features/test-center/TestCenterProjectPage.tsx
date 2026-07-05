import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, WandSparkles, Loader2 } from "lucide-react";
import { useStore, useProject, useProjectFiles, useProjectTestPoints, useProjectTestCases } from "../../app/store";
import { useAIAction } from "../../shared/hooks/useAIAction";
import { DataTable } from "../../shared/components/DataTable";
import { SectionHeader } from "../../shared/components/SectionHeader";
import { StatusPill } from "../../shared/components/StatusPill";
import type { Priority, ReviewStatus } from "../../shared/types/platform";

type TabKey = "files" | "testPoints" | "testCases" | "scripts" | "summary";

const tabs: { key: TabKey; label: string }[] = [
  { key: "files", label: "输入资料" },
  { key: "testPoints", label: "功能点" },
  { key: "testCases", label: "测试用例" },
  { key: "scripts", label: "自动化脚本" },
  { key: "summary", label: "测试汇总" },
];

function priorityTone(p: Priority) {
  if (p === "P0") return "red" as const;
  if (p === "P1") return "amber" as const;
  if (p === "P2") return "blue" as const;
  return "slate" as const;
}

function reviewTone(s: ReviewStatus) {
  if (s === "已通过") return "green" as const;
  if (s === "需修改") return "red" as const;
  return "amber" as const;
}

// ─── 输入资料 Tab ───

function FilesTab({ projectId }: { projectId: string }) {
  const files = useProjectFiles(projectId);

  return (
    <div className="page-stack">
      <SectionHeader
        title="文档管理"
        description="管理项目的需求文档、接口文档、原型和变更说明。"
      />

      <section className="work-panel">
        {files.length === 0 ? (
          <div className="empty-state"><p>暂无文档，请在项目空间的"输入资料"中上传。</p></div>
        ) : (
          <DataTable
            rows={files}
            getRowKey={(row) => row.id}
            columns={[
              { key: "name", label: "文件名", align: "left", render: (row) => <strong>{row.name}</strong> },
              { key: "type", label: "类型", render: (row) => row.fileType },
              { key: "size", label: "大小", render: (row) => row.size },
              {
                key: "parseStatus", label: "解析状态", align: "center",
                render: (row) => {
                  const tone = row.parseStatus === "已完成" ? "green" : row.parseStatus === "解析中" ? "blue" : "slate";
                  return <StatusPill tone={tone}>{row.parseStatus}</StatusPill>;
                },
              },
              { key: "date", label: "上传时间", render: (row) => row.uploadedAt },
            ]}
          />
        )}
      </section>
    </div>
  );
}

// ─── 功能点 Tab ───

function TestPointsTab({ projectId }: { projectId: string }) {
  const testPoints = useProjectTestPoints(projectId);
  const { loading, error, generateTestPoints } = useAIAction(projectId);
  const [moduleFilter, setModuleFilter] = useState<string>("all");

  const modules = useMemo(() => Array.from(new Set(testPoints.map((tp) => tp.module))), [testPoints]);
  const filtered = useMemo(() => moduleFilter === "all" ? testPoints : testPoints.filter((tp) => tp.module === moduleFilter), [testPoints, moduleFilter]);

  return (
    <div className="page-stack">
      <SectionHeader
        title="AI 测试点生成"
        description="基于需求解析结果，AI 生成覆盖正常、异常、边界、权限等场景的测试点。"
        actions={
          <button className="primary-button" type="button" onClick={generateTestPoints} disabled={loading}>
            {loading ? <Loader2 size={17} className="animate-spin" /> : <WandSparkles size={17} />}
            {loading ? "生成中..." : "生成测试点"}
          </button>
        }
      />

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
        {filtered.length === 0 ? (
          <div className="empty-state"><p>暂无测试点。点击"生成测试点"让 AI 分析需求并生成。</p></div>
        ) : (
          <DataTable
            rows={filtered}
            getRowKey={(row) => row.id}
            columns={[
              { key: "id", label: "编号", render: (row) => row.id },
              { key: "module", label: "模块", render: (row) => row.module },
              { key: "type", label: "类型", render: (row) => row.type },
              { key: "title", label: "测试点", align: "left", render: (row) => row.title },
              { key: "priority", label: "优先级", align: "center", render: (row) => <StatusPill tone={priorityTone(row.priority)}>{row.priority}</StatusPill> },
              { key: "reviewStatus", label: "评审", align: "center", render: (row) => <StatusPill tone={reviewTone(row.reviewStatus)}>{row.reviewStatus}</StatusPill> },
            ]}
          />
        )}
      </section>
    </div>
  );
}

// ─── 测试用例 Tab ───

function TestCasesTab({ projectId }: { projectId: string }) {
  const testCases = useProjectTestCases(projectId);
  const { loading, error, generateTestCases } = useAIAction(projectId);
  const [moduleFilter, setModuleFilter] = useState<string>("all");

  const modules = useMemo(() => Array.from(new Set(testCases.map((tc) => tc.module))), [testCases]);
  const filtered = useMemo(() => moduleFilter === "all" ? testCases : testCases.filter((tc) => tc.module === moduleFilter), [testCases, moduleFilter]);

  return (
    <div className="page-stack">
      <SectionHeader
        title="用例生成"
        description="从测试点生成可执行用例，支持在线评审。"
        actions={
          <button className="primary-button" type="button" onClick={generateTestCases} disabled={loading}>
            {loading ? <Loader2 size={17} className="animate-spin" /> : <WandSparkles size={17} />}
            {loading ? "生成中..." : "生成用例"}
          </button>
        }
      />

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
        {filtered.length === 0 ? (
          <div className="empty-state"><p>暂无测试用例。点击"生成用例"让 AI 基于测试点生成。</p></div>
        ) : (
          <DataTable
            rows={filtered}
            getRowKey={(row) => row.id}
            columns={[
              { key: "caseCode", label: "编号", render: (row) => row.caseCode },
              { key: "module", label: "模块", render: (row) => row.module },
              { key: "title", label: "用例标题", align: "left", render: (row) => row.title },
              { key: "priority", label: "优先级", align: "center", render: (row) => <StatusPill tone={priorityTone(row.priority)}>{row.priority}</StatusPill> },
              { key: "reviewStatus", label: "评审", align: "center", render: (row) => <StatusPill tone={reviewTone(row.reviewStatus)}>{row.reviewStatus}</StatusPill> },
              { key: "automation", label: "自动化", align: "center", render: (row) => row.automation },
            ]}
          />
        )}
      </section>
    </div>
  );
}

// ─── 自动化脚本 Tab ───

function ScriptsTab({ projectId }: { projectId: string }) {
  const testCases = useProjectTestCases(projectId);
  const automatable = useMemo(() => testCases.filter((tc) => tc.automation === "适合"), [testCases]);

  return (
    <div className="page-stack">
      <SectionHeader
        title="脚本生成"
        description="AI 根据测试用例生成 Playwright/pytest 自动化脚本（仅生成，不执行）。"
      />

      <section className="work-panel">
        {automatable.length === 0 ? (
          <div className="empty-state">
            <p>暂无可自动化的用例</p>
            <p style={{ fontSize: 13, color: "var(--muted)" }}>需要先在测试用例中标记"适合"自动化的用例</p>
          </div>
        ) : (
          <div>
            <p style={{ marginBottom: 12, color: "var(--muted)", fontSize: 14 }}>
              共 <strong style={{ color: "var(--text)" }}>{automatable.length}</strong> 条适合自动化的用例
            </p>
            <DataTable
              rows={automatable}
              getRowKey={(row) => row.id}
              columns={[
                { key: "caseCode", label: "用例编号", render: (row) => row.caseCode },
                { key: "module", label: "模块", render: (row) => row.module },
                { key: "title", label: "用例标题", align: "left", render: (row) => row.title },
                { key: "priority", label: "优先级", align: "center", render: (row) => <StatusPill tone={priorityTone(row.priority)}>{row.priority}</StatusPill> },
              ]}
            />
          </div>
        )}
      </section>
    </div>
  );
}

// ─── 测试汇总 Tab ───

function SummaryTab({ projectId }: { projectId: string }) {
  const requirements = useProjectRequirements(projectId);
  const testPoints = useProjectTestPoints(projectId);
  const testCases = useProjectTestCases(projectId);

  const confirmed = requirements.filter((r) => r.confirmed).length;
  const passedTP = testPoints.filter((tp) => tp.reviewStatus === "已通过").length;
  const passedTC = testCases.filter((tc) => tc.reviewStatus === "已通过").length;
  const autoCount = testCases.filter((tc) => tc.automation === "适合").length;

  const stats = [
    { label: "需求总数", value: requirements.length, sub: `已确认 ${confirmed}` },
    { label: "测试点总数", value: testPoints.length, sub: `已通过 ${passedTP}` },
    { label: "用例总数", value: testCases.length, sub: `已通过 ${passedTC}` },
    { label: "自动化用例", value: autoCount, sub: `覆盖率 ${testCases.length > 0 ? Math.round(autoCount / testCases.length * 100) : 0}%` },
    { label: "P0 用例", value: testCases.filter((c) => c.priority === "P0").length, sub: "" },
    { label: "需修改", value: testCases.filter((c) => c.reviewStatus === "需修改").length, sub: "" },
  ];

  return (
    <div className="page-stack">
      <SectionHeader
        title="测试进度概览"
        description="手动测试数据与自动化测试结果的汇总统计。"
      />

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

// ─── 主页面 ───

export function TestCenterProjectPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const project = useProject(id);
  const [activeTab, setActiveTab] = useState<TabKey>("requirements");

  if (!project) {
    return (
      <div className="page-stack">
        <div className="empty-state">
          <p>项目不存在或已删除。</p>
          <button className="primary-button" type="button" onClick={() => navigate("/test-center")}>返回测试中心</button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <div className="detail-header">
        <button className="ghost-button" type="button" onClick={() => navigate("/test-center")}>
          <ArrowLeft size={17} /> 返回
        </button>
        <div>
          <h2>{project.name}</h2>
          <p className="text-muted">测试中心 · {project.testType}</p>
        </div>
      </div>

      <div className="tab-bar">
        {tabs.map((tab) => (
          <button key={tab.key} type="button" className={`tab-button ${activeTab === tab.key ? "tab-button--active" : ""}`} onClick={() => setActiveTab(tab.key)}>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="tab-content">
        {activeTab === "files" && <FilesTab projectId={project.id} />}
        {activeTab === "testPoints" && <TestPointsTab projectId={project.id} />}
        {activeTab === "testCases" && <TestCasesTab projectId={project.id} />}
        {activeTab === "scripts" && <ScriptsTab projectId={project.id} />}
        {activeTab === "summary" && <SummaryTab projectId={project.id} />}
      </div>
    </div>
  );
}
