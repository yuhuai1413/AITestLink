import { useMemo } from "react";
import { useStore } from "../../../app/store";

interface Props { projectId?: string; }

export function DefectTab({ projectId }: Props) {
  const { state } = useStore();
  const failedCases = useMemo(() => {
    const base = projectId ? state.testCases.filter((tc) => tc.projectId === projectId) : state.testCases;
    return base.filter((tc) => tc.reviewStatus === "需修改");
  }, [state.testCases, projectId]);

  if (failedCases.length === 0) return <div className="empty-state"><p>暂无缺陷记录</p></div>;

  return (
    <div className="empty-state">
      <p>缺陷管理（规划中）</p>
      <p style={{ fontSize: 13, color: "var(--muted)" }}>共 {failedCases.length} 条需修改的用例</p>
    </div>
  );
}
