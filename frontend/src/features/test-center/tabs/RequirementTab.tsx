import { useMemo } from "react";
import { useStore } from "../../../app/store";
import { DataTable } from "../../../shared/components/DataTable";
import { StatusPill } from "../../../shared/components/StatusPill";

interface Props { projectId?: string; }

export function RequirementTab({ projectId }: Props) {
  const { state } = useStore();
  const items = useMemo(
    () => projectId ? state.requirements.filter((r) => r.projectId === projectId) : state.requirements,
    [state.requirements, projectId],
  );

  if (items.length === 0) return <div className="empty-state"><p>暂无需求数据</p></div>;

  return (
    <DataTable
      rows={items}
      getRowKey={(r) => r.id}
      columns={[
        { key: "module", label: "模块", render: (r) => r.module },
        { key: "feature", label: "功能点", render: (r) => r.feature },
        { key: "risk", label: "风险", render: (r) => <StatusPill tone={r.risk === "高" ? "red" : r.risk === "中" ? "amber" : "green"}>{r.risk}</StatusPill> },
        { key: "rule", label: "业务规则", render: (r) => <span style={{ maxWidth: 200, display: "inline-block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.rule}</span> },
        { key: "confirmed", label: "状态", render: (r) => <StatusPill tone={r.confirmed ? "green" : "amber"}>{r.confirmed ? "已确认" : "待确认"}</StatusPill> },
      ]}
    />
  );
}
