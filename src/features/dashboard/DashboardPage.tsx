import { ArrowRight, FileText, ShieldAlert, WandSparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../../app/store";
import { DataTable } from "../../shared/components/DataTable";
import { MetricCard } from "../../shared/components/MetricCard";
import { SectionHeader } from "../../shared/components/SectionHeader";
import { StatusPill } from "../../shared/components/StatusPill";
import {
  dashboardMetrics,
  qualityWarnings,
  roadmap,
} from "../../shared/data/platformData";
import type { Project, RoadmapPhase } from "../../shared/types/platform";

function riskTone(risk: Project["riskLevel"]) {
  if (risk === "高") return "red" as const;
  if (risk === "中") return "amber" as const;
  return "green" as const;
}

function phaseTone(status: RoadmapPhase["status"]) {
  if (status === "当前") return "blue" as const;
  if (status === "下一步") return "amber" as const;
  return "slate" as const;
}

export function DashboardPage() {
  const { state } = useStore();
  const navigate = useNavigate();

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div className="hero-panel__copy">
          <span className="hero-panel__eyebrow">AI 测试全流程工作台</span>
          <h2>从需求解析到用例设计、执行分析和质量报告的闭环框架</h2>
          <p>
            第一版聚焦 MVP 链路：文档上传、AI 需求解析、测试点生成、用例生成、人工评审和 Excel 导出。
          </p>
        </div>
        <div className="hero-panel__actions">
          <button className="primary-button" type="button" onClick={() => navigate("/projects")}>
            <WandSparkles size={17} />
            发起 AI 解析
          </button>
          <button className="ghost-button" type="button" onClick={() => navigate("/reports")}>
            <FileText size={17} />
            查看报告
          </button>
        </div>
      </section>

      <section className="metric-grid" aria-label="核心指标">
        {dashboardMetrics.map((metric) => (
          <MetricCard key={metric.label} metric={metric} />
        ))}
      </section>

      <section className="two-column-layout">
        <div className="work-panel">
          <SectionHeader
            eyebrow="项目概览"
            title="当前测试项目"
            description="按风险、状态和更新时间跟踪项目质量推进情况。"
          />
          <DataTable<Project>
            rows={state.projects}
            getRowKey={(row) => row.id}
            columns={[
              {
                key: "name",
                label: "项目",
                render: (row) => (
                  <button
                    type="button"
                    className="text-button table-link"
                    onClick={() => navigate(`/projects/${row.id}`)}
                  >
                    <div className="table-title">
                      <strong>{row.name}</strong>
                      <span>{row.version} · {row.testType}</span>
                    </div>
                  </button>
                ),
              },
              {
                key: "status",
                label: "状态",
                align: "center",
                render: (row) => <StatusPill tone={row.status === "阻塞" ? "red" : "blue"}>{row.status}</StatusPill>,
              },
              {
                key: "risk",
                label: "风险",
                align: "center",
                render: (row) => <StatusPill tone={riskTone(row.riskLevel)}>{row.riskLevel}</StatusPill>,
              },
              {
                key: "caseCount",
                label: "用例",
                align: "right",
                render: (row) => row.caseCount,
              },
            ]}
          />
        </div>

        <div className="work-panel">
          <SectionHeader
            eyebrow="风险提醒"
            title="AI 质量建议"
            description="由平台规则和历史质量经验生成的待关注事项。"
          />
          <div className="warning-list">
            {qualityWarnings.map((warning) => {
              const Icon = warning.icon;
              return (
                <article className="warning-item" key={warning.title}>
                  <Icon size={20} />
                  <div>
                    <strong>{warning.title}</strong>
                    <p>{warning.detail}</p>
                  </div>
                </article>
              );
            })}
          </div>
          <div className="inline-note">
            <ShieldAlert size={17} />
            <span>AI 输出必须经过评审后进入正式用例库。</span>
          </div>
        </div>
      </section>

      <section className="work-panel">
        <SectionHeader
          eyebrow="产品路线"
          title="平台演进节奏"
          description="先打通测试设计价值，再逐步扩展执行、自动化和智能质量分析。"
          actions={
            <button className="text-button" type="button" onClick={() => navigate("/automation")}>
              查看详情
              <ArrowRight size={16} />
            </button>
          }
        />
        <div className="roadmap-grid">
          {roadmap.map((item) => (
            <article className="roadmap-item" key={item.phase}>
              <div className="roadmap-item__top">
                <strong>{item.phase}</strong>
                <StatusPill tone={phaseTone(item.status)}>{item.status}</StatusPill>
              </div>
              <h3>{item.goal}</h3>
              <p>{item.capabilities}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
