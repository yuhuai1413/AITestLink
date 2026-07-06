import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, X, RotateCcw } from "lucide-react";
import { useStore } from "../../app/store";
import { useAPISync } from "../../api/useAPISync";
import { projectsApi } from "../../api/client";
import { DataTable } from "./DataTable";
import { DataPanel } from "./DataPanel";
import { StatusPill } from "./StatusPill";
import { CreateProjectModal } from "../../features/projects/CreateProjectModal";
import { EditProjectModal } from "../../features/projects/EditProjectModal";
import { ConfirmDialog } from "./ConfirmDialog";
import type { Project } from "../types/platform";

export type ProjectListMode = "projects" | "testCenter" | "documentCenter";

interface ProjectListPageProps {
  mode: ProjectListMode;
}

function testStatusTone(status: string) {
  if (status === "已测试") return "green" as const;
  if (status === "测试中") return "blue" as const;
  return "amber" as const;
}

function docStatusTone(status: string) {
  if (status === "已完成") return "green" as const;
  if (status === "解析中") return "blue" as const;
  return "amber" as const;
}

export function ProjectListPage({ mode }: ProjectListPageProps) {
  const { state, dispatch } = useStore();
  const { deleteProject } = useAPISync();
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [deletingProject, setDeletingProject] = useState<Project | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [nameFilter, setNameFilter] = useState("");
  const [testTypeFilter, setTestTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");

  const fetchProjects = useCallback(async () => {
    try {
      const data = await projectsApi.list();
      if (Array.isArray(data)) {
        dispatch({ type: "SET_PROJECTS", payload: data as any });
      }
    } catch {}
  }, [dispatch]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const filteredProjects = useMemo(() => {
    return state.projects
      .filter((p) => {
        if (nameFilter && !p.name.toLowerCase().includes(nameFilter.toLowerCase())) return false;
        if (testTypeFilter !== "all" && p.testType !== testTypeFilter) return false;
        if (statusFilter !== "all" && p.testStatus !== statusFilter && p.docStatus !== statusFilter) return false;
        if (priorityFilter !== "all" && p.priority !== priorityFilter) return false;
        return true;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [state.projects, nameFilter, testTypeFilter, statusFilter, priorityFilter]);

  const paginatedProjects = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredProjects.slice(start, start + pageSize);
  }, [filteredProjects, page, pageSize]);

  const resetFilters = () => {
    setNameFilter("");
    setTestTypeFilter("all");
    setStatusFilter("all");
    setPriorityFilter("all");
    setPage(1);
  };

  const handleViewProject = (project: Project) => {
    if (mode === "testCenter") {
      navigate(`/test-center/${project.id}`);
    } else if (mode === "documentCenter") {
      navigate(`/document-center/${project.id}`);
    } else {
      navigate(`/projects/${project.id}`);
    }
  };

  const toolbar = (
    <div className="search-form">
      <div className="search-form__field">
        <label className="search-form__label">项目名称</label>
        <input
          className="search-form__input"
          type="text"
          placeholder="搜索项目名称"
          value={nameFilter}
          onChange={(e) => { setNameFilter(e.target.value); setPage(1); }}
        />
        {nameFilter && (
          <button className="search-form__clear" type="button" onClick={() => { setNameFilter(""); setPage(1); }}>
            <X size={14} />
          </button>
        )}
      </div>
      <div className="search-form__field">
        <label className="search-form__label">测试类型</label>
        <select
          className="search-form__select"
          value={testTypeFilter}
          onChange={(e) => { setTestTypeFilter(e.target.value); setPage(1); }}
        >
          <option value="all">全部类型</option>
          <option value="首轮全量测试">首轮全量测试</option>
          <option value="回归测试">回归测试</option>
          <option value="增量测试">增量测试</option>
          <option value="专项测试">专项测试</option>
        </select>
      </div>
      <div className="search-form__field">
        <label className="search-form__label">{mode === "testCenter" ? "测试状态" : mode === "documentCenter" ? "文档状态" : "状态"}</label>
        <select
          className="search-form__select"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
        >
          <option value="all">全部状态</option>
          {mode !== "documentCenter" && (
            <optgroup label="测试状态">
              <option value="待测试">待测试</option>
              <option value="测试中">测试中</option>
              <option value="已测试">已测试</option>
            </optgroup>
          )}
          {mode !== "testCenter" && (
            <optgroup label="文档状态">
              <option value="待解析">待解析</option>
              <option value="解析中">解析中</option>
              <option value="已完成">已完成</option>
            </optgroup>
          )}
        </select>
      </div>
      <div className="search-form__field">
        <label className="search-form__label">优先级</label>
        <select
          className="search-form__select"
          value={priorityFilter}
          onChange={(e) => { setPriorityFilter(e.target.value); setPage(1); }}
        >
          <option value="all">全部优先级</option>
          <option value="高">高</option>
          <option value="中">中</option>
          <option value="低">低</option>
        </select>
      </div>
      <div className="search-form__actions">
        <button className="ghost-button" type="button" onClick={resetFilters}>
          <RotateCcw size={16} />
          重置
        </button>
      </div>
      {mode === "projects" && (
        <button className="primary-button" type="button" style={{ marginLeft: "auto" }} onClick={() => setShowCreate(true)}>
          <Plus size={13} />
          新建项目
        </button>
      )}
    </div>
  );

  return (
    <div className="page-stack">
      <DataPanel
        toolbar={toolbar}
        total={filteredProjects.length}
        pageSize={pageSize}
        currentPage={page}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      >
        {paginatedProjects.length === 0 ? (
          <div className="empty-state">
            <svg width="120" height="100" viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="10" y="30" width="100" height="60" rx="8" fill="#f1f5f9" stroke="#e2e8f0" strokeWidth="1.5"/>
              <path d="M10 38C10 33.5817 13.5817 30 18 30H42L50 22H102C106.418 22 110 25.5817 110 30V38H10Z" fill="#e2e8f0"/>
              <path d="M10 38H110V72C110 76.4183 106.418 80 102 80H18C13.5817 80 10 76.4183 10 72V38Z" fill="#f8fafc"/>
              <circle cx="60" cy="56" r="12" fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="1.5" strokeDasharray="4 3"/>
              <path d="M56 56H64M60 52V60" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <p style={{ marginTop: 12, color: "#64748b", fontSize: 14 }}>暂无项目数据</p>
            {mode === "projects" && (
              <p style={{ color: "#94a3b8", fontSize: 13 }}>点击上方「新建项目」按钮创建第一个项目</p>
            )}
          </div>
        ) : (
          <DataTable<Project>
            rows={paginatedProjects}
            getRowKey={(row) => row.id}
            columns={[
              {
                key: "name",
                label: "项目名称",
                width: "16%",
                render: (row) => <strong>{row.name}</strong>,
              },
              {
                key: "testType",
                label: "测试类型",
                width: "12%",
                render: (row) => row.testType,
              },
              ...(mode !== "documentCenter" ? [{
                key: "testStatus",
                label: "测试状态",
                width: "10%",
                align: "center" as const,
                render: (row: Project) => <StatusPill tone={testStatusTone(row.testStatus)}>{row.testStatus}</StatusPill>,
              }] : []),
              ...(mode !== "testCenter" ? [{
                key: "docStatus",
                label: "文档状态",
                width: "10%",
                align: "center" as const,
                render: (row: Project) => <StatusPill tone={docStatusTone(row.docStatus)}>{row.docStatus}</StatusPill>,
              }] : []),
              {
                key: "priority",
                label: "优先级",
                width: "8%",
                align: "center",
                render: (row) => <StatusPill tone={row.priority === "高" ? "red" : row.priority === "中" ? "amber" : "green"}>{row.priority}</StatusPill>,
              },
              {
                key: "cases",
                label: "用例数",
                width: "8%",
                align: "center",
                render: (row) => row.caseCount,
              },
              {
                key: "rate",
                label: "通过率",
                width: "8%",
                align: "center",
                render: (row) => `${row.passRate}%`,
              },
              {
                key: "date",
                label: "创建时间",
                width: "18%",
                render: (row) => {
                  const d = new Date(row.createdAt);
                  const y = d.getFullYear();
                  const m = String(d.getMonth() + 1).padStart(2, "0");
                  const day = String(d.getDate()).padStart(2, "0");
                  const h = String(d.getHours()).padStart(2, "0");
                  const min = String(d.getMinutes()).padStart(2, "0");
                  const sec = String(d.getSeconds()).padStart(2, "0");
                  return `${y}-${m}-${day} ${h}:${min}:${sec}`;
                },
              },
              {
                key: "actions",
                label: "操作",
                width: mode === "projects" ? "14%" : "10%",
                align: "center",
                render: (row) => (
                  <div className="inline-actions">
                    {mode === "projects" ? (
                      <>
                        <button className="text-button" type="button" onClick={() => handleViewProject(row)}>
                          查看
                        </button>
                        <button className="text-button" type="button" onClick={() => setEditingProject(row)}>
                          编辑
                        </button>
                        <button className="text-button text-button--danger" type="button" onClick={() => setDeletingProject(row)}>
                          删除
                        </button>
                      </>
                    ) : (
                      <button className="text-button" type="button" onClick={() => handleViewProject(row)}>
                        进入
                      </button>
                    )}
                  </div>
                ),
              },
            ]}
          />
        )}
      </DataPanel>

      <EditProjectModal open={!!editingProject} onClose={() => setEditingProject(null)} project={editingProject} />
      <CreateProjectModal open={showCreate} onClose={() => { setShowCreate(false); setPage(1); }} />
      <ConfirmDialog
        open={!!deletingProject}
        title="删除项目"
        message={deletingProject ? `确定删除项目「${deletingProject.name}」？此操作不可撤销。` : ""}
        confirmLabel="删除"
        onConfirm={() => {
          if (deletingProject) {
            deleteProject(deletingProject.id);
            setDeletingProject(null);
          }
        }}
        onCancel={() => setDeletingProject(null)}
      />
    </div>
  );
}
