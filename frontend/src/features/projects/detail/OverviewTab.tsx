import { Loader2 } from "lucide-react";
import { StatusPill } from "../../../shared/components/StatusPill";
import { useProjectData } from "../useProjectData";

export function OverviewTab({ projectId }: { projectId: string }) {
  const { project, files, testPoints, testCases, scripts, initialLoading } = useProjectData(projectId);

  if (initialLoading && !project) {
    return (
      <div className="empty-state">
        <Loader2 size={20} className="animate-spin" style={{ color: "var(--muted)" }} />
        <p style={{ marginTop: 8, color: "var(--muted)" }}>加载中...</p>
      </div>
    );
  }
  if (!project) return null;

  const p0Cases = testCases.filter((testCase) => testCase.priority === "P0").length;
  const automatedCases = testCases.filter((testCase) => testCase.automation === "是").length;
  const automationRate = testCases.length > 0 ? Math.round((automatedCases / testCases.length) * 100) : 0;
  const cards = [
    { label: "优先级", value: <StatusPill tone={project.priority === "高" ? "red" : project.priority === "中" ? "amber" : "green"}>{project.priority}</StatusPill> },
    { label: "文档数量", value: files.length },
    { label: "测试点", value: testPoints.length },
    { label: "测试用例", value: testCases.length },
    { label: "P0 用例", value: p0Cases },
    { label: "自动化覆盖", value: `${automationRate}%` },
    { label: "自动化脚本", value: scripts.length },
    { label: "测试类型", value: project.testType },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-sm)", paddingTop: "var(--sp-sm)", flex: 1 }}>
      <div className="overview-grid">
        {cards.map((card) => (
          <div className="overview-stat" key={card.label}>
            <span className="overview-stat__label">{card.label}</span>
            <strong className="overview-stat-value">{card.value}</strong>
          </div>
        ))}
      </div>
      <section className="work-panel" style={{ flex: 1, minHeight: 0 }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>项目说明</h3>
        {project.description ? (
          <p style={{ margin: 0, color: "var(--muted)", fontSize: 14, lineHeight: 22 }}>{project.description}</p>
        ) : (
          <div className="empty-state" style={{ padding: "20px 0" }}>
            <p style={{ color: "#94a3b8", fontSize: 13 }}>暂无项目说明</p>
          </div>
        )}
      </section>
    </div>
  );
}
