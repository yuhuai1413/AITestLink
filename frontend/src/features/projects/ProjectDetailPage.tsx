import { useMemo, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Download,
  FileUp,
  ListPlus,
  Pencil,
  Trash2,
  WandSparkles,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { useStore, useProject, useProjectRequirements, useProjectTestPoints, useProjectTestCases, useProjectFiles, useProjectAITasks } from "../../app/store";
import { DataTable } from "../../shared/components/DataTable";
import { Modal } from "../../shared/components/Modal";
import { SectionHeader } from "../../shared/components/SectionHeader";
import { StatusPill } from "../../shared/components/StatusPill";
import { useAIAction } from "../../shared/hooks/useAIAction";
import { exportTestCasesToExcel } from "../../shared/utils/exportExcel";
import { TestCaseEditModal } from "../test-design/TestCaseEditModal";
import { TestCaseDetailModal } from "../test-design/TestCaseDetailModal";
import { TestPointEditModal } from "../test-design/TestPointEditModal";
import type { ReviewStatus, AutomationFlag, Priority, TestCase, TestPoint } from "../../shared/types/platform";
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
  const aiTasks = useProjectAITasks(projectId);

  if (!project) return <p>项目不存在</p>;

  const confirmedCount = requirements.filter((r) => r.confirmed).length;
  const p0Cases = testCases.filter((c) => c.priority === "P0").length;
  const automatable = testCases.filter((c) => c.automation === "适合").length;
  const autoRate = testCases.length > 0 ? Math.round((automatable / testCases.length) * 100) : 0;

  return (
    <div className="page-stack">
      <div className="overview-grid">
        <div className="overview-stat">
          <span className="overview-stat__label">项目状态</span>
          <StatusPill tone={statusTone(project.status)}>{project.status}</StatusPill>
        </div>
        <div className="overview-stat">
          <span className="overview-stat__label">风险等级</span>
          <StatusPill tone={project.priority === "高" ? "red" : project.priority === "中" ? "amber" : "green"}>
            {project.priority}
          </StatusPill>
        </div>
        <div className="overview-stat">
          <span className="overview-stat__label">测试用例</span>
          <strong>{testCases.length}</strong>
        </div>
        <div className="overview-stat">
          <span className="overview-stat__label">P0 用例</span>
          <strong>{p0Cases}</strong>
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
          <span className="overview-stat__label">自动化覆盖</span>
          <strong>{autoRate}%</strong>
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

      {aiTasks.length > 0 && (
        <section className="work-panel">
          <SectionHeader eyebrow="AI 任务" title="执行记录" description="查看本项目的 AI 解析和生成任务历史。" />
          <DataTable
            rows={aiTasks}
            getRowKey={(row) => row.id}
            columns={[
              { key: "type", label: "任务类型", render: (row) => row.type },
              {
                key: "status",
                label: "状态",
                align: "center",
                render: (row) => {
                  const tone = row.status === "成功" ? "green" : row.status === "执行中" ? "blue" : row.status === "失败" ? "red" : "slate";
                  return <StatusPill tone={tone}>{row.status}</StatusPill>;
                },
              },
              { key: "model", label: "模型", render: (row) => row.modelName },
              { key: "created", label: "发起时间", render: (row) => new Date(row.createdAt).toLocaleTimeString() },
              { key: "finished", label: "完成时间", render: (row) => row.finishedAt ? new Date(row.finishedAt).toLocaleTimeString() : "—" },
            ]}
          />
        </section>
      )}
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

        const fileId = generateId("F");
        dispatch({
          type: "ADD_FILE",
          payload: {
            id: fileId,
            projectId,
            name: file.name,
            fileType,
            size,
            parseStatus: "解析中",
            uploadedAt: new Date().toISOString().slice(0, 10),
          },
        });
        // 模拟解析进度
        setTimeout(() => {
          dispatch({
            type: "UPDATE_FILE",
            payload: {
              id: fileId,
              projectId,
              name: file.name,
              fileType,
              size,
              parseStatus: "已完成",
              uploadedAt: new Date().toISOString().slice(0, 10),
            },
          });
        }, 1500 + Math.random() * 1000);
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
                  return <StatusPill tone={tone} className={row.parseStatus === "解析中" ? "status-pill--loading" : ""}>{row.parseStatus}</StatusPill>;
                },
              },
              { key: "date", label: "上传时间", render: (row) => row.uploadedAt },
              {
                key: "actions",
                label: "",
                render: (row) => (
                  <div className="inline-actions">
                    {row.parseStatus !== "解析中" && (
                      <button
                        className="icon-button"
                        type="button"
                        title="重新解析"
                        onClick={() => {
                          dispatch({ type: "UPDATE_FILE", payload: { ...row, parseStatus: "解析中" } });
                          setTimeout(() => {
                            dispatch({ type: "UPDATE_FILE", payload: { ...row, parseStatus: "已完成" } });
                          }, 1500);
                        }}
                      >
                        <WandSparkles size={15} />
                      </button>
                    )}
                    <button
                      className="icon-button"
                      type="button"
                      title="删除"
                      onClick={() => {
                        if (confirm(`确定删除文件「${row.name}」？`)) {
                          dispatch({ type: "DELETE_FILE", payload: row.id });
                        }
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
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

// ─── 需求解析 Tab ───

function RequirementsTab({ projectId }: { projectId: string }) {
  const requirements = useProjectRequirements(projectId);
  const { dispatch } = useStore();
  const { loading, error, parseRequirements } = useAIAction(projectId);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRule, setEditRule] = useState("");
  const [editQuestion, setEditQuestion] = useState("");

  const startEdit = (req: { id: string; rule: string; question: string }) => {
    setEditingId(req.id);
    setEditRule(req.rule);
    setEditQuestion(req.question);
  };

  const saveEdit = () => {
    if (!editingId) return;
    const req = requirements.find((r) => r.id === editingId);
    if (!req) return;
    dispatch({ type: "UPDATE_REQUIREMENT", payload: { ...req, rule: editRule, question: editQuestion } });
    setEditingId(null);
  };

  const riskTone = (risk: string) => risk === "高" ? "red" as const : risk === "中" ? "amber" as const : "green" as const;

  return (
    <div className="page-stack">
      <SectionHeader
        eyebrow="需求解析"
        title="AI 需求解析"
        description="基于上传的文档，AI 自动提取模块、功能点、业务规则和待确认问题。"
        actions={
          <button className="primary-button" type="button" onClick={parseRequirements} disabled={loading}>
            {loading ? (
              <Loader2 size={17} className="animate-spin" />
            ) : (
              <WandSparkles size={17} />
            )}
            {loading ? "解析中..." : "AI 解析"}
          </button>
        }
      />

      {error && (
        <div className="error-banner">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

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
              {
                key: "rule",
                label: "业务规则",
                align: "left",
                render: (row) => editingId === row.id ? (
                  <textarea className="form-textarea" value={editRule} onChange={(e) => setEditRule(e.target.value)} rows={2} autoFocus />
                ) : (
                  <span className="text-muted editable-cell" onClick={() => startEdit(row)} title="点击编辑">{row.rule}</span>
                ),
              },
              {
                key: "question",
                label: "待确认问题",
                align: "left",
                render: (row) => editingId === row.id ? (
                  <div>
                    <textarea className="form-textarea" value={editQuestion} onChange={(e) => setEditQuestion(e.target.value)} rows={2} />
                    <div style={{ marginTop: 6, display: "flex", gap: 6 }}>
                      <button className="primary-button" type="button" style={{ fontSize: 12, minHeight: 28, padding: "0 10px" }} onClick={saveEdit}>保存</button>
                      <button className="ghost-button" type="button" style={{ fontSize: 12, minHeight: 28, padding: "0 10px" }} onClick={() => setEditingId(null)}>取消</button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <span className="text-muted editable-cell" onClick={() => startEdit(row)} title="点击编辑">{row.question}</span>
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
  const { loading, error, generateTestPoints } = useAIAction(projectId);
  const [moduleFilter, setModuleFilter] = useState<string>("all");
  const [editingPoint, setEditingPoint] = useState<TestPoint | null>(null);

  const modules = useMemo(() => {
    const set = new Set(testPoints.map((tp) => tp.module));
    return Array.from(set);
  }, [testPoints]);

  const filtered = useMemo(
    () => moduleFilter === "all" ? testPoints : testPoints.filter((tp) => tp.module === moduleFilter),
    [testPoints, moduleFilter],
  );

  return (
    <div className="page-stack">
      <SectionHeader
        eyebrow="测试点"
        title="AI 测试点生成"
        description="基于需求解析结果，AI 生成覆盖正常、异常、边界、权限、数据一致性和状态流转的测试点。"
        actions={
          <button className="primary-button" type="button" onClick={generateTestPoints} disabled={loading}>
            {loading ? (
              <Loader2 size={17} className="animate-spin" />
            ) : (
              <WandSparkles size={17} />
            )}
            {loading ? "生成中..." : "生成测试点"}
          </button>
        }
      />

      {error && (
        <div className="error-banner">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

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
                render: (row) => (
                  <select
                    className="inline-select"
                    value={row.priority}
                    onChange={(e) => dispatch({ type: "UPDATE_TEST_POINT", payload: { ...row, priority: e.target.value as Priority } })}
                  >
                    <option value="P0">P0</option>
                    <option value="P1">P1</option>
                    <option value="P2">P2</option>
                    <option value="P3">P3</option>
                  </select>
                ),
              },
              {
                key: "reviewStatus",
                label: "评审",
                align: "center",
                render: (row) => (
                  <select
                    className="inline-select"
                    value={row.reviewStatus}
                    onChange={(e) => dispatch({ type: "UPDATE_TEST_POINT", payload: { ...row, reviewStatus: e.target.value as ReviewStatus } })}
                  >
                    <option value="待评审">待评审</option>
                    <option value="已通过">已通过</option>
                    <option value="需修改">需修改</option>
                  </select>
                ),
              },
              {
                key: "actions",
                label: "",
                render: (row) => (
                  <div className="inline-actions">
                    <button className="icon-button" type="button" title="编辑" onClick={() => setEditingPoint(row)}>
                      <Pencil size={15} />
                    </button>
                    <button className="icon-button" type="button" title="删除" onClick={() => dispatch({ type: "DELETE_TEST_POINT", payload: row.id })}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                ),
              },
            ]}
          />
        )}
      </section>

      <TestPointEditModal
        open={!!editingPoint}
        testPoint={editingPoint}
        onClose={() => setEditingPoint(null)}
      />
    </div>
  );
}

// ─── 测试用例 Tab ───

function TestCasesTab({ projectId }: { projectId: string }) {
  const testCases = useProjectTestCases(projectId);
  const { dispatch } = useStore();
  const { loading, error, generateTestCases } = useAIAction(projectId);
  const [editingCase, setEditingCase] = useState<TestCase | null>(null);
  const [detailCase, setDetailCase] = useState<TestCase | null>(null);
  const [moduleFilter, setModuleFilter] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const modules = useMemo(() => {
    const set = new Set(testCases.map((tc) => tc.module));
    return Array.from(set);
  }, [testCases]);

  const filtered = useMemo(
    () => moduleFilter === "all" ? testCases : testCases.filter((tc) => tc.module === moduleFilter),
    [testCases, moduleFilter],
  );

  const selectedCases = useMemo(
    () => testCases.filter((tc) => selectedIds.has(tc.id)),
    [testCases, selectedIds],
  );

  const allFilteredSelected = filtered.length > 0 && filtered.every((tc) => selectedIds.has(tc.id));

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((tc) => tc.id)));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const batchSetPriority = (priority: Priority) => {
    selectedCases.forEach((tc) => {
      dispatch({ type: "UPDATE_TEST_CASE", payload: { ...tc, priority, updatedAt: new Date().toISOString().slice(0, 10) } });
    });
    setSelectedIds(new Set());
  };

  const batchSetReviewStatus = (status: ReviewStatus) => {
    selectedCases.forEach((tc) => {
      dispatch({ type: "UPDATE_TEST_CASE", payload: { ...tc, reviewStatus: status, updatedAt: new Date().toISOString().slice(0, 10) } });
    });
    setSelectedIds(new Set());
  };

  const batchDelete = () => {
    selectedCases.forEach((tc) => {
      dispatch({ type: "DELETE_TEST_CASE", payload: tc.id });
    });
    setSelectedIds(new Set());
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
            <button className="primary-button" type="button" onClick={generateTestCases} disabled={loading}>
              {loading ? (
                <Loader2 size={17} className="animate-spin" />
              ) : (
                <WandSparkles size={17} />
              )}
              {loading ? "生成中..." : "生成用例"}
            </button>
          </>
        }
      />

      {error && (
        <div className="error-banner">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

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
        {selectedIds.size > 0 && (
          <div className="batch-bar">
            <span>已选 {selectedIds.size} 条</span>
            <select className="inline-select" onChange={(e) => { if (e.target.value) batchSetPriority(e.target.value as Priority); e.target.value = ""; }}>
              <option value="">批量改优先级</option>
              <option value="P0">P0</option>
              <option value="P1">P1</option>
              <option value="P2">P2</option>
              <option value="P3">P3</option>
            </select>
            <select className="inline-select" onChange={(e) => { if (e.target.value) batchSetReviewStatus(e.target.value as ReviewStatus); e.target.value = ""; }}>
              <option value="">批量改评审状态</option>
              <option value="待评审">待评审</option>
              <option value="已通过">已通过</option>
              <option value="需修改">需修改</option>
            </select>
            <button className="ghost-button" type="button" onClick={batchDelete}>批量删除</button>
            <button className="text-button" type="button" onClick={() => setSelectedIds(new Set())}>取消选择</button>
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="empty-state">
            <p>暂无测试用例。点击"生成用例"让 AI 基于测试点生成。</p>
          </div>
        ) : (
          <DataTable
            rows={filtered}
            getRowKey={(row) => row.id}
            columns={[
              {
                key: "select",
                label: "",
                render: (row) => (
                  <input
                    type="checkbox"
                    checked={selectedIds.has(row.id)}
                    onChange={() => toggleSelect(row.id)}
                  />
                ),
              },
              {
                key: "selectAll",
                label: "",
                render: () => (
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleSelectAll}
                  />
                ),
              },
              { key: "caseCode", label: "编号", render: (row) => row.caseCode },
              { key: "module", label: "模块", render: (row) => row.module },
              { key: "title", label: "用例标题", align: "left", render: (row) => (
                <button type="button" className="text-button table-link" onClick={() => setDetailCase(row)}>
                  {row.title}
                </button>
              )},
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
      <TestCaseDetailModal
        open={!!detailCase}
        testCase={detailCase}
        onClose={() => setDetailCase(null)}
      />
    </div>
  );
}

// ─── 主页面 ───

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const project = useProject(id);
  const { dispatch } = useStore();

  const initialTab = (searchParams.get("tab") as TabKey) || "overview";
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [editingProject, setEditingProject] = useState(false);
  const [editName, setEditName] = useState("");
  const [editVersion, setEditVersion] = useState("");
  const [editOwner, setEditOwner] = useState("");
  const [editDescription, setEditDescription] = useState("");

  const startEdit = () => {
    if (!project) return;
    setEditName(project.name);
    setEditVersion(project.version);
    setEditOwner(project.owner);
    setEditDescription(project.description);
    setEditingProject(true);
  };

  const saveEdit = () => {
    if (!project) return;
    dispatch({
      type: "UPDATE_PROJECT",
      payload: {
        ...project,
        name: editName,
        version: editVersion,
        owner: editOwner,
        description: editDescription,
        updatedAt: new Date().toISOString().slice(0, 10),
      },
    });
    setEditingProject(false);
  };

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
        <button className="ghost-button" type="button" onClick={startEdit}>
          <Pencil size={17} />
          编辑
        </button>
        <button className="ghost-button" type="button" style={{ color: "var(--red)" }} onClick={() => {
          if (confirm(`确定删除项目「${project.name}」？此操作不可撤销，所有关联数据将被清除。`)) {
            dispatch({ type: "DELETE_PROJECT", payload: project.id });
            navigate("/projects");
          }
        }}>
          <Trash2 size={17} />
          删除
        </button>
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

      {/* 编辑项目弹窗 */}
      <Modal open={editingProject} onClose={() => setEditingProject(false)} title="编辑项目">
        <form className="form-stack" onSubmit={(e) => { e.preventDefault(); saveEdit(); }}>
          <div className="form-row">
            <label className="form-label">
              项目名称
              <input className="form-input" type="text" value={editName} onChange={(e) => setEditName(e.target.value)} required />
            </label>
          </div>
          <div className="form-row form-row--3">
            <label className="form-label">
              版本
              <input className="form-input" type="text" value={editVersion} onChange={(e) => setEditVersion(e.target.value)} required />
            </label>
            <label className="form-label">
              负责人
              <input className="form-input" type="text" value={editOwner} onChange={(e) => setEditOwner(e.target.value)} required />
            </label>
          </div>
          <div className="form-row">
            <label className="form-label">
              项目说明
              <textarea className="form-textarea" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={3} />
            </label>
          </div>
          <div className="form-actions">
            <button className="ghost-button" type="button" onClick={() => setEditingProject(false)}>取消</button>
            <button className="primary-button" type="submit">保存</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
