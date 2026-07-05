import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, FileText, Download } from "lucide-react";
import { useProject, useProjectFiles, useProjectTestCases } from "../../app/store";
import { DataTable } from "../../shared/components/DataTable";
import { SectionHeader } from "../../shared/components/SectionHeader";
import { StatusPill } from "../../shared/components/StatusPill";

type TabKey = "documents" | "fusion" | "generate" | "verify";

const tabs: { key: TabKey; label: string }[] = [
  { key: "documents", label: "文档管理" },
  { key: "fusion", label: "数据融合" },
  { key: "generate", label: "文档生成" },
  { key: "verify", label: "文档检验" },
];

const docTemplates = [
  { id: "tpl-plan", name: "软件测试计划", description: "测试范围、策略、资源、进度安排", icon: "📋" },
  { id: "tpl-spec", name: "软件测试说明", description: "测试环境、用例设计、执行方法", icon: "📝" },
  { id: "tpl-report", name: "软件测试报告", description: "执行结果、缺陷统计、风险分析、结论", icon: "📊" },
  { id: "tpl-manual-pc", name: "PC端操作手册", description: "系统操作流程、功能说明、注意事项", icon: "💻" },
  { id: "tpl-manual-app", name: "APP端操作手册", description: "移动端操作流程、功能说明", icon: "📱" },
];

// ─── 文档管理 Tab ───

function DocumentsTab({ projectId }: { projectId: string }) {
  const files = useProjectFiles(projectId);

  return (
    <div className="page-stack">
      <SectionHeader
        title="项目文档"
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

// ─── 数据融合 Tab ───

function FusionTab({ projectId }: { projectId: string }) {
  const testCases = useProjectTestCases(projectId);
  const [manualResults, setManualResults] = useState<{ caseCode: string; result: string; executor: string; date: string }[]>([]);

  const handleUpload = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,.xlsx";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      // 模拟解析 CSV/Excel
      const mockResults = testCases.slice(0, 3).map((tc, i) => ({
        caseCode: tc.caseCode,
        result: i === 0 ? "通过" : i === 1 ? "失败" : "阻塞",
        executor: "测试员A",
        date: new Date().toISOString().slice(0, 10),
      }));
      setManualResults(mockResults);
    };
    input.click();
  };

  const mergedData = useMemo(() => {
    return testCases.map((tc) => {
      const manual = manualResults.find((r) => r.caseCode === tc.caseCode);
      return {
        ...tc,
        manualResult: manual?.result || "-",
        executor: manual?.executor || "-",
        manualDate: manual?.date || "-",
      };
    });
  }, [testCases, manualResults]);

  return (
    <div className="page-stack">
      <SectionHeader
        title="手动 + 自动化结果合并"
        description="上传手动测试结果文档，与自动化测试数据按用例编号合并展示。"
        actions={
          <button className="primary-button" type="button" onClick={handleUpload}>
            上传手动测试结果
          </button>
        }
      />

      <section className="work-panel">
        {mergedData.length === 0 ? (
          <div className="empty-state"><p>暂无测试用例数据</p></div>
        ) : (
          <DataTable
            rows={mergedData}
            getRowKey={(row) => row.id}
            columns={[
              { key: "caseCode", label: "用例编号", render: (row) => row.caseCode },
              { key: "title", label: "用例标题", align: "left", render: (row) => row.title },
              { key: "module", label: "模块", render: (row) => row.module },
              { key: "priority", label: "优先级", align: "center", render: (row) => row.priority },
              { key: "automation", label: "自动化状态", align: "center", render: (row) => row.automation },
              { key: "reviewStatus", label: "评审结果", align: "center", render: (row) => <StatusPill tone={row.reviewStatus === "已通过" ? "green" : row.reviewStatus === "需修改" ? "red" : "amber"}>{row.reviewStatus}</StatusPill> },
              { key: "manualResult", label: "手动执行结果", align: "center", render: (row) => <StatusPill tone={row.manualResult === "通过" ? "green" : row.manualResult === "失败" ? "red" : row.manualResult === "阻塞" ? "red" : "slate"}>{row.manualResult}</StatusPill> },
              { key: "executor", label: "执行人", render: (row) => row.executor },
              { key: "manualDate", label: "执行日期", render: (row) => row.manualDate },
            ]}
          />
        )}
      </section>
    </div>
  );
}

// ─── 文档生成 Tab ───

function GenerateTab({ projectId }: { projectId: string }) {
  const project = useProject(projectId);
  const [generating, setGenerating] = useState<string | null>(null);

  const handleGenerate = (templateId: string) => {
    setGenerating(templateId);
    // 模拟生成
    setTimeout(() => {
      setGenerating(null);
      alert(`「${docTemplates.find((t) => t.id === templateId)?.name}」生成完成！`);
    }, 2000);
  };

  return (
    <div className="page-stack">
      <SectionHeader
        title="选择模板生成文档"
        description="选择文档模板，系统将根据项目数据和模板自动生成 Word 文档。"
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
        {docTemplates.map((tpl) => (
          <div key={tpl.id} className="dash-card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 28 }}>{tpl.icon}</span>
              <div>
                <strong style={{ fontSize: 15 }}>{tpl.name}</strong>
                <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>{tpl.description}</p>
              </div>
            </div>
            <button
              className="primary-button"
              type="button"
              style={{ width: "100%" }}
              onClick={() => handleGenerate(tpl.id)}
              disabled={generating === tpl.id}
            >
              {generating === tpl.id ? "生成中..." : "生成文档"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── 文档检验 Tab ───

function VerifyTab({ projectId }: { projectId: string }) {
  const requirements = useProjectFiles(projectId);
  const testCases = useProjectTestCases(projectId);

  const checks = [
    { name: "需求文档完整性", status: requirements.length > 0 ? "pass" : "fail", detail: requirements.length > 0 ? `已上传 ${requirements.length} 个文档` : "未上传需求文档" },
    { name: "测试用例覆盖", status: testCases.length > 0 ? "pass" : "fail", detail: testCases.length > 0 ? `已生成 ${testCases.length} 条用例` : "未生成测试用例" },
    { name: "P0 用例评审", status: testCases.filter((c) => c.priority === "P0" && c.reviewStatus === "已通过").length > 0 ? "pass" : "warn", detail: `${testCases.filter((c) => c.priority === "P0").length} 条 P0 用例` },
    { name: "模块覆盖度", status: new Set(testCases.map((c) => c.module)).size >= 2 ? "pass" : "warn", detail: `覆盖 ${new Set(testCases.map((c) => c.module)).size} 个模块` },
  ];

  return (
    <div className="page-stack">
      <SectionHeader
        title="文档完整性校验"
        description="检查项目数据是否满足生成测试文档的条件。"
      />

      <section className="work-panel">
        <div style={{ display: "grid", gap: 12 }}>
          {checks.map((check) => (
            <div key={check.name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--line)" }}>
              <StatusPill tone={check.status === "pass" ? "green" : check.status === "fail" ? "red" : "amber"}>
                {check.status === "pass" ? "通过" : check.status === "fail" ? "未通过" : "警告"}
              </StatusPill>
              <div>
                <strong>{check.name}</strong>
                <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>{check.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ─── 主页面 ───

export function DocumentCenterProjectPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const project = useProject(id);
  const [activeTab, setActiveTab] = useState<TabKey>("documents");

  if (!project) {
    return (
      <div className="page-stack">
        <div className="empty-state">
          <p>项目不存在或已删除。</p>
          <button className="primary-button" type="button" onClick={() => navigate("/document-center")}>返回文档中心</button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <div className="detail-header">
        <button className="ghost-button" type="button" onClick={() => navigate("/document-center")}>
          <ArrowLeft size={17} /> 返回
        </button>
        <div>
          <h2>{project.name}</h2>
          <p className="text-muted">文档中心 · {project.testType}</p>
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
        {activeTab === "documents" && <DocumentsTab projectId={project.id} />}
        {activeTab === "fusion" && <FusionTab projectId={project.id} />}
        {activeTab === "generate" && <GenerateTab projectId={project.id} />}
        {activeTab === "verify" && <VerifyTab projectId={project.id} />}
      </div>
    </div>
  );
}
