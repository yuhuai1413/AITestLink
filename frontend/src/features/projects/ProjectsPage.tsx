import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, SlidersHorizontal, X } from "lucide-react";
import { useStore } from "../../app/store";
import { DataTable } from "../../shared/components/DataTable";
import { SectionHeader } from "../../shared/components/SectionHeader";
import { StatusPill } from "../../shared/components/StatusPill";
import { CreateProjectModal } from "./CreateProjectModal";
import type { Project, ProjectStatus } from "../../shared/types/platform";

function statusTone(status: Project["status"]) {
  if (status === "阻塞") return "red" as const;
  if (status === "已完成") return "green" as const;
  if (status === "执行中") return "blue" as const;
  return "amber" as const;
}

export function ProjectsPage() {
  const { state } = useStore();
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");

  const owners = useMemo(() => {
    const set = new Set(state.projects.map((p) => p.owner));
    return Array.from(set);
  }, [state.projects]);

  const filteredProjects = useMemo(() => {
    return state.projects.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (ownerFilter !== "all" && p.owner !== ownerFilter) return false;
      return true;
    });
  }, [state.projects, statusFilter, ownerFilter]);

  const hasFilter = statusFilter !== "all" || ownerFilter !== "all";

  const clearFilter = () => {
    setStatusFilter("all");
    setOwnerFilter("all");
  };

  return (
    <div className="page-stack">
      <SectionHeader
        eyebrow="项目空间"
        title="测试项目与版本管理"
        description="统一管理输入资料、测试设计、执行记录、缺陷和报告。"
        actions={
          <>
            <button className={`ghost-button ${hasFilter ? "ghost-button--active" : ""}`} type="button" onClick={() => setShowFilter(!showFilter)}>
              <SlidersHorizontal size={17} />
              筛选
              {hasFilter && <span className="filter-badge">●</span>}
            </button>
            <button className="primary-button" type="button" onClick={() => setShowCreate(true)}>
              <Plus size={17} />
              新建项目
            </button>
          </>
        }
      />

      {showFilter && (
        <div className="filter-bar">
          <span className="filter-label">筛选条件</span>
          <select className="filter-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">全部状态</option>
            <option value="设计中">设计中</option>
            <option value="执行中">执行中</option>
            <option value="阻塞">阻塞</option>
            <option value="已完成">已完成</option>
          </select>
          <select className="filter-select" value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)}>
            <option value="all">全部负责人</option>
            {owners.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
          {hasFilter && (
            <button className="text-button" type="button" onClick={clearFilter}>
              <X size={14} />
              清除筛选
            </button>
          )}
        </div>
      )}

      <section className="project-grid">
        {filteredProjects.map((project) => (
          <article
            className="project-card project-card--clickable"
            key={project.id}
            onClick={() => navigate(`/projects/${project.id}`)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && navigate(`/projects/${project.id}`)}
          >
            <div className="project-card__top">
              <StatusPill tone={statusTone(project.status)}>{project.status}</StatusPill>
              <span>{project.updatedAt}</span>
            </div>
            <h3>{project.name}</h3>
            <p>{project.version} · {project.testType}</p>
            <div className="project-card__meta">
              <span>负责人：{project.owner}</span>
              <span>用例：{project.caseCount}</span>
              <span>通过率：{project.passRate}%</span>
            </div>
          </article>
        ))}
      </section>

      <section className="work-panel">
        <SectionHeader
          eyebrow="项目清单"
          title="版本质量跟踪"
          description="从项目维度查看风险、用例数量、通过率和负责人。"
        />
        <DataTable<Project>
          rows={filteredProjects}
          getRowKey={(row) => row.id}
          columns={[
            { key: "id", label: "项目编号", align: "center", render: (row) => row.id },
            {
              key: "name",
              label: "项目名称",
              align: "center",
              render: (row) => (
                <button
                  type="button"
                  className="text-button table-link"
                  onClick={() => navigate(`/projects/${row.id}`)}
                >
                  {row.name}
                </button>
              ),
            },
            { key: "owner", label: "负责人", align: "center", render: (row) => row.owner },
            { key: "type", label: "测试类型", align: "center", render: (row) => row.testType },
            {
              key: "status",
              label: "状态",
              align: "center",
              render: (row) => <StatusPill tone={statusTone(row.status)}>{row.status}</StatusPill>,
            },
            { key: "cases", label: "用例数", align: "center", render: (row) => row.caseCount },
            { key: "rate", label: "通过率", align: "center", render: (row) => `${row.passRate}%` },
          ]}
        />
      </section>

      <CreateProjectModal open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  );
}
