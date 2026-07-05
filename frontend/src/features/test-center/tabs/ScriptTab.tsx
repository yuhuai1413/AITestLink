import { useMemo } from "react";
import { useStore } from "../../../app/store";

interface Props { projectId?: string; }

export function ScriptTab({ projectId }: Props) {
  const { state } = useStore();
  const automatedCases = useMemo(() => {
    const base = projectId ? state.testCases.filter((tc) => tc.projectId === projectId) : state.testCases;
    return base.filter((tc) => tc.automation === "适合");
  }, [state.testCases, projectId]);

  if (automatedCases.length === 0) return <div className="empty-state"><p>暂无可自动化的用例</p></div>;

  return (
    <div className="empty-state">
      <p>自动化脚本管理（规划中）</p>
      <p style={{ fontSize: 13, color: "var(--muted)" }}>共 {automatedCases.length} 条适合自动化的用例</p>
    </div>
  );
}
