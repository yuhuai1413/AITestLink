import { BarChart3, FileCheck2, FileClock, TrendingUp } from "lucide-react";
import { SectionHeader } from "../../shared/components/SectionHeader";
import { StatusPill } from "../../shared/components/StatusPill";
import { roadmap } from "../../shared/data/platformData";

const reportTypes = [
  {
    icon: FileClock,
    title: "测试日报",
    detail: "今日完成内容、执行统计、缺陷提交、阻塞问题和明日计划。",
    status: "规划中",
  },
  {
    icon: FileCheck2,
    title: "版本测试报告",
    detail: "范围、环境、用例统计、缺陷统计、遗留风险和上线建议。",
    status: "MVP 2",
  },
  {
    icon: BarChart3,
    title: "自动化执行报告",
    detail: "通过率、失败用例、失败原因分类、截图和 trace 附件。",
    status: "MVP 3",
  },
  {
    icon: TrendingUp,
    title: "质量趋势报告",
    detail: "缺陷趋势、模块风险、回归稳定性和历史质量变化。",
    status: "后续",
  },
];

export function ReportsPage() {
  return (
    <div className="page-stack">
      <SectionHeader
        eyebrow="报告中心"
        title="质量结论与测试资产归档"
        description="把执行数据、缺陷数据和风险分析沉淀为可评审的正式报告。"
      />

      <section className="report-grid">
        {reportTypes.map((report) => {
          const Icon = report.icon;
          return (
            <article className="report-card" key={report.title}>
              <div className="report-card__top">
                <Icon size={21} />
                <StatusPill tone={report.status === "后续" ? "slate" : "blue"}>{report.status}</StatusPill>
              </div>
              <h3>{report.title}</h3>
              <p>{report.detail}</p>
            </article>
          );
        })}
      </section>

      <section className="work-panel">
        <SectionHeader
          eyebrow="报告生成规则"
          title="AI 总结口径"
          description="报告中的统计数据必须能追溯到真实执行记录和缺陷记录。"
        />
        <div className="rule-grid">
          <div className="rule-item">测试范围和测试环境必须明确。</div>
          <div className="rule-item">用例统计、缺陷统计必须来自执行数据。</div>
          <div className="rule-item">阻塞问题需要说明原因、影响范围和恢复计划。</div>
          <div className="rule-item">上线建议必须基于遗留风险和严重缺陷状态。</div>
        </div>
      </section>

      <section className="work-panel">
        <SectionHeader
          eyebrow="路线"
          title="报告能力演进"
          description="报告中心随执行闭环和自动化能力逐步增强。"
        />
        <div className="timeline-list">
          {roadmap.map((item) => (
            <div className="timeline-item" key={item.phase}>
              <span>{item.phase}</span>
              <div>
                <strong>{item.goal}</strong>
                <p>{item.capabilities}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
