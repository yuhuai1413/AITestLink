import { Braces, CirclePlay, GitBranch, RotateCcw } from "lucide-react";
import { DataTable } from "../../shared/components/DataTable";
import { SectionHeader } from "../../shared/components/SectionHeader";
import { StatusPill } from "../../shared/components/StatusPill";
import { agentCapabilities } from "../../shared/data/platformData";
import type { AgentCapability } from "../../shared/types/platform";

function statusTone(status: AgentCapability["status"]) {
  if (status === "MVP") return "blue" as const;
  if (status === "后续") return "amber" as const;
  return "slate" as const;
}

const automationSteps = [
  {
    icon: Braces,
    title: "脚本生成",
    detail: "基于测试用例、页面结构和接口文档生成 Playwright 或 pytest 脚本。",
  },
  {
    icon: CirclePlay,
    title: "任务执行",
    detail: "支持手动、定时和 CI 触发，保存截图、HTML、trace 和执行报告。",
  },
  {
    icon: RotateCcw,
    title: "失败归因",
    detail: "区分脚本问题、环境问题、数据问题、定位器问题和真实系统缺陷。",
  },
  {
    icon: GitBranch,
    title: "回归推荐",
    detail: "根据需求变更、代码变更和历史缺陷推荐最小回归用例集。",
  },
];

export function AutomationPage() {
  return (
    <div className="page-stack">
      <SectionHeader
        eyebrow="自动化中心"
        title="脚本生成、执行编排与失败分析"
        description="自动化能力放在 MVP 后续阶段建设，但架构上预留脚本、任务、日志和报告入口。"
      />

      <section className="automation-grid">
        {automationSteps.map((step) => {
          const Icon = step.icon;
          return (
            <article className="automation-step" key={step.title}>
              <div className="automation-step__icon">
                <Icon size={20} />
              </div>
              <h3>{step.title}</h3>
              <p>{step.detail}</p>
            </article>
          );
        })}
      </section>

      <section className="work-panel">
        <SectionHeader
          eyebrow="Agent 编排"
          title="AI 专职能力分层"
          description="每类 Agent 有清晰输入输出，避免一个大提示词承担所有职责。"
        />
        <DataTable<AgentCapability>
          rows={agentCapabilities}
          getRowKey={(row) => row.name}
          columns={[
            { key: "name", label: "Agent", render: (row) => row.name },
            { key: "input", label: "输入", align: "left", render: (row) => row.input },
            { key: "output", label: "输出", align: "left", render: (row) => row.output },
            {
              key: "status",
              label: "阶段",
              align: "center",
              render: (row) => <StatusPill tone={statusTone(row.status)}>{row.status}</StatusPill>,
            },
          ]}
        />
      </section>
    </div>
  );
}
