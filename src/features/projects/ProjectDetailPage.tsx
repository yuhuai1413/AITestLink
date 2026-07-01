import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Download,
  FileUp,
  ListPlus,
  Pencil,
  Trash2,
  WandSparkles,
} from "lucide-react";
import { useStore, useProject, useProjectRequirements, useProjectTestPoints, useProjectTestCases, useProjectFiles } from "../../app/store";
import { DataTable } from "../../shared/components/DataTable";
import { SectionHeader } from "../../shared/components/SectionHeader";
import { StatusPill } from "../../shared/components/StatusPill";
import { useAISimulation } from "../../shared/hooks/useAISimulation";
import { exportTestCasesToExcel } from "../../shared/utils/exportExcel";
import { TestCaseEditModal } from "../test-design/TestCaseEditModal";
import type { ReviewStatus, AutomationFlag, Priority, TestCase } from "../../shared/types/platform";
import { generateId } from "../../shared/utils/generateId";

type TabKey = "overview" | "files" | "requirements" | "testPoints" | "testCases";

const tabs: { key: TabKey; label: string }[] = [
  { key: "overview", label: "概览" },
  { key: "files", label: "输入资料" },
  { key: "requirements", label: "需求解析" },
  { key: "testPoints", label: "测试点" },
  { key: "testCases", label: "测试用例" },
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

function statusTone(s: string) {
  if (s === "阻塞") return "red" as const;
  if (s === "已完成") return "green" as const;
  if (s === "执行中") return "blue" as const;
  return "amber" as const;
}

// ─── 概览 Tab ───

function OverviewTab({ projectId }: { projectId: string }) {
  const project = useProject(projectId);
  const requirements = useProjectRequirements(projectId);
  const testPoints = useProjectTestPoints(projectId);
  const testCases = useProjectTestCases(projectId);

  if (!project) return <p>项目不存在</p>;

  const confirmedCount = requirements.filter((r) => r.confirmed).length;

  return (
    <div className="page-stack">
      <div className="overview-grid">
        <div className="overview-stat">
          <span className="overview-stat__label">项目状态</span>
          <StatusPill tone={statusTone(project.status)}>{project.status}</StatusPill>
        </div>
        <div className="overview-stat">
          <span className="overview-stat__label">风险等级</span>
          <StatusPill tone={project.riskLevel === "高" ? "red" : project.riskLevel === "中" ? "amber" : "green"}>
            {project.riskLevel}
          </StatusPill>
        </div>
        <div className="overview-stat">
          <span className="overview-stat__label">测试用例</span>
          <strong>{testCases.length}</strong>
        </div>
        <div className="overview-stat">
          <span className="overview-stat__label">需求确认</span>
          <strong>{confirmedCount}/{requirements.length}</strong>
        </div>
        <div className="overview-stat">
          <span className="overview-stat__label">测试点</span>
          <strong>{testPoints.length}</strong>
        </div>
        <div className="overview-stat">
          <span className="overview-stat__label">通过率</span>
          <strong>{project.passRate}%</strong>
        </div>
      </div>

      <section className="work-panel">
        <SectionHeader eyebrow="项目信息" title="基本信息" />
        <div className="info-grid">
          <div className="info-row"><span className="info-label">项目名称</span><span>{project.name}</span></div>
          <div className="info-row"><span className="info-label">版本</span><span>{project.version}</span></div>
          <div className="info-row"><span className="info-label">负责人</span><span>{project.owner}</span></div>
          <div className="info-row"><span className="info-label">测试类型</span><span>{project.testType}</span></div>
          <div className="info-row"><span className="info-label">创建时间</span><span>{project.createdAt}</span></div>
          <div className="info-row"><span className="info-label">更新时间</span><span>{project.updatedAt}</span></div>
          <div className="info-row info-row--full"><span className="info-label">项目说明</span><span>{project.description}</span></div>
        </div>
      </section>
    </div>
  );
}

// ─── 输入资料 Tab ───

function FilesTab({ projectId }: { projectId: string }) {
  const files = useProjectFiles(projectId);
  const { dispatch } = useStore();

  const handleUpload = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".doc,.docx,.pdf,.xls,.xlsx,.md,.json";
    input.multiple = true;
    input.onchange = () => {
      Array.from(input.files || []).forEach((file) => {
        const ext = file.name.split(".").pop()?.toLowerCase() || "";
        let fileType: "需求文档" | "接口文档" | "原型" | "变更说明" | "其他" = "其他";
        if (["doc", "docx", "pdf", "md"].includes(ext)) fileType = "需求文档";
        else if (["json", "yaml", "yml"].includes(ext)) fileType = "接口文档";

        const size = file.size > 1024 * 1024
          ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
          : `${(file.size / 1024).toFixed(0)} KB`;

        dispatch({
          type: "ADD_FILE",
          payload: {
            id: generateId("F"),
            projectId,
            name: file.name,
            fileType,
            size,
            parseStatus: "待解析",
            uploadedAt: new Date().toISOString().slice(0, 10),
          },
        });
      });
    };
    input.click();
  };

  return (
    <div className="page-stack">
      <SectionHeader
        eyebrow="输入资料"
        title="文档管理"
        description="上传需求文档、接口文档、原型和变更说明，作为 AI 解析的输入。"
        actions={
          <button className="primary-button" type="button" onClick={handleUpload}>
            <FileUp size={17} />
            上传文件
          </button>
        }
      />
      <section className="work-panel">
        {files.length === 0 ? (
          <div className="empty-state">
            <p>暂无文件，点击上方按钮上传。</p>
          </div>
        ) : (
          <DataTable
            rows={files}
            getRowKey={(row) => row.id}
            columns={[
              { key: "name", label: "文件名", align: "left", render: (row) => <strong>{row.name}</strong> },
              { key: "type", label: "类型", render: (row) => row.fileType },
              { key: "size", label: "大小", render: (row) => row.size },
              {
                key: "parseStatus",
                label: "解析状态",
                align: "center",
                render: (row) => {
                  const tone = row.parseStatus === "已完成" ? "green" : row.parseStatus === "解析中" ? "blue" : row.parseStatus === "失败" ? "red" : "slate";
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

// ─── 需求解析 Tab ───

function RequirementsTab({ projectId }: { projectId: string }) {
  const requirements = useProjectRequirements(projectId);
  const { dispatch } = useStore();
  const { simulateAI } = useAISimulation(projectId);

  const handleParse = async () => {
    await simulateAI("需求解析");
    // 模拟生成需求
    const mockRequirements = [
      { module: "用户管理", feature: "登录注册", source: "PRD 2.1", risk: "高" as const, rule: "支持手机号、邮箱注册，登录需验证验证码。", question: "是否支持第三方登录？" },
      { module: "用户管理", feature: "权限控制", source: "PRD 2.2", risk: "中" as const, rule: "管理员、普通用户、只读用户三种角色。", question: "角色是否支持自定义？" },
      { module: "核心业务", feature: "数据导入", source: "PRD 3.1", risk: "高" as const, rule: "支持 Excel、CSV 格式导入，需校验数据格式。", question: "单次导入上限是多少条？" },
    ];
    mockRequirements.forEach((req, i) => {
      dispatch({
        type: "ADD_REQUIREMENT",
        payload: {
          id: `REQ-AUTO-${Date.now()}-${i}`,
          projectId,
          confirmed: false,
          ...req,
        },
      });
    });
  };

  const riskTone = (risk: string) => risk === "高" ? "red" as const : risk === "中" ? "amber" as const : "green" as const;

  return (
    <div className="page-stack">
      <SectionHeader
        eyebrow="需求解析"
        title="AI 需求解析"
        description="基于上传的文档，AI 自动提取模块、功能点、业务规则和待确认问题。"
        actions={
          <button className="primary-button" type="button" onClick={handleParse}>
            <WandSparkles size={17} />
            AI 解析
          </button>
        }
      />
      <section className="work-panel">
        {requirements.length === 0 ? (
          <div className="empty-state">
            <p>暂无需求解析结果。请先在"输入资料"Tab 上传文档，然后点击"AI 解析"。</p>
          </div>
        ) : (
          <DataTable
            rows={requirements}
            getRowKey={(row) => row.id}
            columns={[
              { key: "id", label: "编号", render: (row) => row.id },
              { key: "module", label: "模块", render: (row) => row.module },
              { key: "feature", label: "功能点", render: (row) => row.feature },
              { key: "source", label: "来源", render: (row) => row.source },
              {
                key: "risk",
                label: "风险",
                align: "center",
                render: (row) => <StatusPill tone={riskTone(row.risk)}>{row.risk}</StatusPill>,
              },
              { key: "rule", label: "业务规则", align: "left", render: (row) => <span className="text-muted">{row.rule}</span> },
              {
                key: "question",
                label: "待确认问题",
                align: "left",
                render: (row) => (
                  <div>
                    <span className="text-muted">{row.question}</span>
                    {!row.confirmed && (
                      <button
                        className="text-button"
                        type="button"
                        style={{ marginTop: 4, fontSize: 12 }}
                        onClick={() => dispatch({ type: "CONFIRM_REQUIREMENT", payload: row.id })}
                      >
                        标记已确认
                      </button>
                    )}
                    {row.confirmed && <StatusPill tone="green">已确认</StatusPill>}
                  </div>
                ),
              },
            ]}
          />
        )}
      </section>
    </div>
  );
}

// ─── 测试点 Tab ───

function TestPointsTab({ projectId }: { projectId: string }) {
  const testPoints = useProjectTestPoints(projectId);
  const { dispatch } = useStore();
  const { simulateAI } = useAISimulation(projectId);
  const [moduleFilter, setModuleFilter] = useState<string>("all");

  const modules = useMemo(() => {
    const set = new Set(testPoints.map((tp) => tp.module));
    return Array.from(set);
  }, [testPoints]);

  const filtered = useMemo(
    () => moduleFilter === "all" ? testPoints : testPoints.filter((tp) => tp.module === moduleFilter),
    [testPoints, moduleFilter],
  );

  const handleGenerate = async () => {
    await simulateAI("测试点生成");
    const mockPoints = [
      { module: "用户管理", type: "正常流程" as const, title: "用户使用有效手机号注册并登录成功", priority: "P0" as const, automatable: true },
      { module: "用户管理", type: "异常流程" as const, title: "使用已注册手机号再次注册时提示冲突", priority: "P0" as const, automatable: true },
      { module: "用户管理", type: "边界值" as const, title: "验证码过期后重新发送", priority: "P1" as const, automatable: true },
      { module: "核心业务", type: "数据一致性" as const, title: "导入数据与已有数据冲突时的处理", priority: "P0" as const, automatable: false },
      { module: "核心业务", type: "权限控制" as const, title: "只读用户无法执行数据导入操作", priority: "P1" as const, automatable: true },
    ];
    mockPoints.forEach((point, i) => {
      dispatch({
        type: "ADD_TEST_POINT",
        payload: {
          id: `TP-AUTO-${Date.now()}-${i}`,
          projectId,
          description: point.title,
          reviewStatus: "待评审",
          ...point,
        },
      });
    });
  };

  return (
    <div className="page-stack">
      <SectionHeader
        eyebrow="测试点"
        title="AI 测试点生成"
        description="基于需求解析结果，AI 生成覆盖正常、异常、边界、权限、数据一致性和状态流转的测试点。"
        actions={
          <button className="primary-button" type="button" onClick={handleGenerate}>
            <WandSparkles size={17} />
            生成测试点
          </button>
        }
      />

      {modules.length > 0 && (
        <div className="filter-bar">
          <span className="filter-label">模块筛选</span>
          <select
            className="filter-select"
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
          >
            <option value="all">全部模块</option>
            {modules.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
      )}

      <section className="work-panel">
        {filtered.length === 0 ? (
          <div className="empty-state">
            <p>暂无测试点。点击"生成测试点"让 AI 分析需求并生成。</p>
          </div>
        ) : (
          <DataTable
            rows={filtered}
            getRowKey={(row) => row.id}
            columns={[
              { key: "id", label: "编号", render: (row) => row.id },
              { key: "module", label: "模块", render: (row) => row.module },
              { key: "type", label: "类型", render: (row) => row.type },
              { key: "title", label: "测试点", align: "left", render: (row) => row.title },
              {
                key: "priority",
                label: "优先级",
                align: "center",
                render: (row) => <StatusPill tone={priorityTone(row.priority)}>{row.priority}</StatusPill>,
              },
              {
                key: "automation",
                label: "自动化",
                align: "center",
                render: (row) => <StatusPill tone={row.automatable ? "green" : "slate"}>{row.automatable ? "适合" : "待评估"}</StatusPill>,
              },
              {
                key: "actions",
                label: "",
                render: (row) => (
                  <button
                    className="icon-button"
                    type="button"
                    title="删除"
                    onClick={() => dispatch({ type: "DELETE_TEST_POINT", payload: row.id })}
                  >
                    <Trash2 size={15} />
                  </button>
                ),
              },
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
  const { dispatch } = useStore();
  const { simulateAI } = useAISimulation(projectId);
  const [editingCase, setEditingCase] = useState<TestCase | null>(null);
  const [moduleFilter, setModuleFilter] = useState<string>("all");

  const modules = useMemo(() => {
    const set = new Set(testCases.map((tc) => tc.module));
    return Array.from(set);
  }, [testCases]);

  const filtered = useMemo(
    () => moduleFilter === "all" ? testCases : testCases.filter((tc) => tc.module === moduleFilter),
    [testCases, moduleFilter],
  );

  const handleGenerate = async () => {
    await simulateAI("用例生成");
    const mockCases: Omit<TestCase, "id" | "createdAt" | "updatedAt">[] = [
      {
        projectId,
        caseCode: "TC_USER_001",
        module: "用户管理",
        feature: "注册",
        title: "使用有效手机号完成注册",
        priority: "P0",
        precondition: "未注册手机号",
        steps: "1. 打开注册页面\n2. 输入手机号\n3. 获取验证码\n4. 输入验证码\n5. 点击注册",
        testData: "13800138000",
        expectedResult: "注册成功，跳转到登录页",
        automation: "适合",
        reviewStatus: "待评审",
        remark: "",
      },
      {
        projectId,
        caseCode: "TC_USER_002",
        module: "用户管理",
        feature: "登录",
        title: "使用正确验证码登录成功",
        priority: "P0",
        precondition: "已注册用户",
        steps: "1. 打开登录页面\n2. 输入手机号\n3. 获取验证码\n4. 输入正确验证码\n5. 点击登录",
        testData: "13800138000 / 正确验证码",
        expectedResult: "登录成功，进入首页",
        automation: "适合",
        reviewStatus: "待评审",
        remark: "",
      },
    ];
    mockCases.forEach((tc, i) => {
      dispatch({
        type: "ADD_TEST_CASE",
        payload: {
          id: `TC-AUTO-${Date.now()}-${i}`,
          testPointId: undefined,
          requirementId: undefined,
          createdAt: new Date().toISOString().slice(0, 10),
          updatedAt: new Date().toISOString().slice(0, 10),
          ...tc,
        },
      });
    });
  };

  const handleExport = () => {
    exportTestCasesToExcel(filtered);
  };

  return (
    <div className="page-stack">
      <SectionHeader
        eyebrow="测试用例"
        title="用例管理"
        description="从测试点生成可执行用例，支持在线编辑、评审和导出。"
        actions={
          <>
            <button className="ghost-button" type="button" onClick={handleExport}>
              <Download size={17} />
              导出 Excel
            </button>
            <button className="primary-button" type="button" onClick={handleGenerate}>
              <WandSparkles size={17} />
              生成用例
            </button>
          </>
        }
      />

      {modules.length > 0 && (
        <div className="filter-bar">
          <span className="filter-label">模块筛选</span>
          <select
            className="filter-select"
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
          >
            <option value="all">全部模块</option>
            {modules.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
      )}

      <section className="work-panel">
        {filtered.length === 0 ? (
          <div className="empty-state">
            <p>暂无测试用例。点击"生成用例"让 AI 基于测试点生成。</p>
          </div>
        ) : (
          <DataTable
            rows={filtered}
            getRowKey={(row) => row.id}
            columns={[
              { key: "caseCode", label: "编号", render: (row) => row.caseCode },
              { key: "module", label: "模块", render: (row) => row.module },
              { key: "title", label: "用例标题", align: "left", render: (row) => row.title },
              {
                key: "priority",
                label: "优先级",
                align: "center",
                render: (row) => <StatusPill tone={priorityTone(row.priority)}>{row.priority}</StatusPill>,
              },
              {
                key: "review",
                label: "评审",
                align: "center",
                render: (row) => <StatusPill tone={reviewTone(row.reviewStatus)}>{row.reviewStatus}</StatusPill>,
              },
              { key: "automation", label: "自动化", align: "center", render: (row) => row.automation },
              {
                key: "actions",
                label: "",
                render: (row) => (
                  <div className="inline-actions">
                    <button className="icon-button" type="button" title="编辑" onClick={() => setEditingCase(row)}>
                      <Pencil size={15} />
                    </button>
                    <button className="icon-button" type="button" title="删除" onClick={() => dispatch({ type: "DELETE_TEST_CASE", payload: row.id })}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                ),
              },
            ]}
          />
        )}
      </section>

      <TestCaseEditModal
        open={!!editingCase}
        testCase={editingCase}
        onClose={() => setEditingCase(null)}
      />
    </div>
  );
}

// ─── 主页面 ───

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const project = useProject(id);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");

  if (!project) {
    return (
      <div className="page-stack">
        <div className="empty-state">
          <p>项目不存在或已删除。</p>
          <button className="primary-button" type="button" onClick={() => navigate("/projects")}>
            返回项目列表
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <div className="detail-header">
        <button className="ghost-button" type="button" onClick={() => navigate("/projects")}>
          <ArrowLeft size={17} />
          返回
        </button>
        <div>
          <h2>{project.name}</h2>
          <p className="text-muted">{project.version} · {project.testType} · 负责人：{project.owner}</p>
        </div>
        <StatusPill tone={statusTone(project.status)}>{project.status}</StatusPill>
      </div>

      <div className="tab-bar">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`tab-button ${activeTab === tab.key ? "tab-button--active" : ""}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="tab-content">
        {activeTab === "overview" && <OverviewTab projectId={project.id} />}
        {activeTab === "files" && <FilesTab projectId={project.id} />}
        {activeTab === "requirements" && <RequirementsTab projectId={project.id} />}
        {activeTab === "testPoints" && <TestPointsTab projectId={project.id} />}
        {activeTab === "testCases" && <TestCasesTab projectId={project.id} />}
      </div>
    </div>
  );
}
