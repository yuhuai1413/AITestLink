import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, ListPlus, WandSparkles } from "lucide-react";
import { useStore } from "../../app/store";
import { DataTable } from "../../shared/components/DataTable";
import { SectionHeader } from "../../shared/components/SectionHeader";
import { StatusPill } from "../../shared/components/StatusPill";
import { exportManualTestCasesToExcel } from "../../shared/utils/exportExcel";
import { TestCaseEditModal } from "./TestCaseEditModal";
import { priorityTone, reviewTone } from "../../shared/utils/statusTone";
import type { TestCase, TestPoint } from "../../shared/types/platform";

export function TestDesignPage() {
  const { state } = useStore();
  const navigate = useNavigate();
  const [editingCase, setEditingCase] = useState<TestCase | null>(null);

  return (
    <div className="page-stack">
      <SectionHeader
        eyebrow="测试设计"
        title="测试点、测试用例与测试数据"
        description="以需求追溯为核心，生成可评审、可执行、可导出的测试资产。"
        actions={
          <button className="primary-button" type="button" onClick={() => navigate("/projects")}>
            <WandSparkles size={13} />
            前往项目生成
          </button>
        }
      />

      <section className="work-panel">
        <SectionHeader
          eyebrow="测试点"
          title="AI 覆盖建议"
          description="从需求解析结果生成正常、异常、边界、权限、数据一致性和状态流转场景。"
        />
        {state.testPoints.length === 0 ? (
          <div className="empty-state">
            <p>暂无测试点。请前往具体项目发起生成。</p>
          </div>
        ) : (
          <DataTable<TestPoint>
            rows={state.testPoints}
            getRowKey={(row) => row.id}
            columns={[
              { key: "pointCode", label: "测试点编号", render: (row) => row.pointCode || <span style={{ color: "var(--muted)" }}>-</span> },
              { key: "module", label: "模块", render: (row) => row.module },
              { key: "type", label: "类型", render: (row) => row.type },
              { key: "title", label: "测试点", align: "left", lineClamp: 2, render: (row) => row.title },
              {
                key: "priority",
                label: "优先级",
                align: "center",
                render: (row) => <StatusPill tone={priorityTone(row.priority)}>{row.priority}</StatusPill>,
              },
              {
                key: "automation",
                label: "自动化",
                align: "center",
                render: (row) => <StatusPill tone={row.automatable ? "green" : "slate"}>{row.automatable ? "适合" : "待评估"}</StatusPill>,
              },
            ]}
          />
        )}
      </section>

      <section className="work-panel">
        <SectionHeader
          eyebrow="测试用例"
          title="标准用例库"
          description="用例必须具备清晰步骤、可判断预期和需求来源。"
          actions={
            <button
              className="ghost-button"
              type="button"
              onClick={() => exportManualTestCasesToExcel(state.testCases)}
            >
              <Download size={13} />
              导出 Excel
            </button>
          }
        />
        {state.testCases.length === 0 ? (
          <div className="empty-state">
            <p>暂无测试用例。请前往具体项目生成。</p>
          </div>
        ) : (
          <DataTable<TestCase>
            rows={state.testCases}
            getRowKey={(row) => row.id}
            columns={[
              { key: "caseCode", label: "用例编号", render: (row) => row.caseCode },
              { key: "module", label: "模块", render: (row) => row.module },
              { key: "testType", label: "测试类型", render: (row) => row.testType || "功能测试" },
              { key: "feature", label: "测试点", align: "left", lineClamp: 2, render: (row) => row.feature },
              { key: "title", label: "用例标题", align: "left", lineClamp: 2, render: (row) => row.title },
              { key: "targetPlatform", label: "测试端", align: "center", render: (row) => row.targetPlatform },
              { key: "testUrl", label: "测试地址", align: "left", lineClamp: 2, render: (row) => row.testUrl || "未配置" },
              { key: "requiredRole", label: "角色", align: "center", render: (row) => row.requiredRole || "无" },
              {
                key: "priority",
                label: "优先级",
                align: "center",
                render: (row) => <StatusPill tone={priorityTone(row.priority)}>{row.priority}</StatusPill>,
              },
              {
                key: "review",
                label: "评审",
                align: "center",
                render: (row) => <StatusPill tone={reviewTone(row.reviewStatus)}>{row.reviewStatus}</StatusPill>,
              },
              { key: "automation", label: "自动化", align: "center", render: (row) => row.automation },
            ]}
          />
        )}
      </section>

      <TestCaseEditModal
        open={!!editingCase}
        testCase={editingCase}
        onClose={() => setEditingCase(null)}
      />
    </div>
  );
}
