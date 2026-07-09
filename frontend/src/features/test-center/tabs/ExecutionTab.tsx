import { useMemo } from "react";
import { useStore } from "../../../app/store";
import { DataTable } from "../../../shared/components/DataTable";
import { StatusPill } from "../../../shared/components/StatusPill";

interface Props { projectId?: string; }

export function ExecutionTab({ projectId }: Props) {
  const { state } = useStore();
  const items = useMemo(
    () => projectId ? state.testCases.filter((tc) => tc.projectId === projectId) : state.testCases,
    [state.testCases, projectId],
  );

  if (items.length === 0) return <div className="empty-state"><p>暂无用例数据</p></div>;

  return (
    <DataTable
      rows={items}
      getRowKey={(tc) => tc.id}
      columns={[
        { key: "caseCode", label: "用例编号", render: (tc) => tc.caseCode },
        { key: "testType", label: "测试类型", render: (tc) => tc.testType || "功能测试" },
        { key: "title", label: "用例标题", render: (tc) => tc.title },
        { key: "priority", label: "优先级", render: (tc) => <StatusPill tone={tc.priority === "P0" ? "red" : tc.priority === "P1" ? "amber" : "blue"}>{tc.priority}</StatusPill> },
        { key: "automation", label: "自动化", render: (tc) => <StatusPill tone={tc.automation === "适合" ? "green" : tc.automation === "不适合" ? "red" : "amber"}>{tc.automation}</StatusPill> },
        { key: "reviewStatus", label: "评审", render: (tc) => <StatusPill tone={tc.reviewStatus === "已通过" ? "green" : tc.reviewStatus === "需修改" ? "red" : "amber"}>{tc.reviewStatus}</StatusPill> },
      ]}
    />
  );
}
