import { useMemo } from "react";
import { useStore } from "../../../app/store";
import { DataTable } from "../../../shared/components/DataTable";
import { StatusPill } from "../../../shared/components/StatusPill";

interface Props { projectId?: string; }

export function TestDesignTab({ projectId }: Props) {
  const { state } = useStore();
  const items = useMemo(
    () => projectId ? state.testPoints.filter((tp) => tp.projectId === projectId) : state.testPoints,
    [state.testPoints, projectId],
  );

  if (items.length === 0) return <div className="empty-state"><p>暂无测试点数据</p></div>;

  return (
    <DataTable
      rows={items}
      getRowKey={(tp) => tp.id}
      columns={[
        { key: "pointCode", label: "测试点编号", render: (tp) => tp.pointCode || <span style={{ color: "var(--muted)" }}>-</span> },
        { key: "module", label: "模块", render: (tp) => tp.module },
        { key: "type", label: "类型", render: (tp) => tp.type },
        { key: "title", label: "测试点", render: (tp) => tp.title },
        { key: "priority", label: "优先级", render: (tp) => <StatusPill tone={tp.priority === "P0" ? "red" : tp.priority === "P1" ? "amber" : "blue"}>{tp.priority}</StatusPill> },
        { key: "reviewStatus", label: "评审", render: (tp) => <StatusPill tone={tp.reviewStatus === "已通过" ? "green" : tp.reviewStatus === "需修改" ? "red" : "amber"}>{tp.reviewStatus}</StatusPill> },
      ]}
    />
  );
}
