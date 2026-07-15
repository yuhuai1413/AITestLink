import { FileUp, WandSparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../../app/store";
import { DataTable } from "../../shared/components/DataTable";
import { SectionHeader } from "../../shared/components/SectionHeader";
import { StatusPill } from "../../shared/components/StatusPill";
import type { Requirement } from "../../shared/types/platform";

function riskTone(risk: Requirement["risk"]) {
  if (risk === "高") return "red" as const;
  if (risk === "中") return "amber" as const;
  return "green" as const;
}

export function RequirementAnalysisPage() {
  const { state } = useStore();
  const navigate = useNavigate();

  return (
    <div className="page-stack">
      <SectionHeader
        eyebrow="需求解析"
        title="文档导入与结构化分析"
        description="把 PRD、FS、接口文档和变更说明转换为可追溯的需求结构表。"
        actions={
          <button className="primary-button" type="button" onClick={() => navigate("/projects")}>
            <WandSparkles size={13} />
            前往项目发起解析
          </button>
        }
      />

      <section className="process-strip" aria-label="需求解析流程">
        {["上传资料", "文本抽取", "AI 解析", "问题确认", "写入需求库"].map((step, index) => (
          <div className="process-step" key={step}>
            <span>{index + 1}</span>
            <strong>{step}</strong>
          </div>
        ))}
      </section>

      <section className="work-panel">
        <SectionHeader
          eyebrow="解析结果"
          title="全部需求结构表"
          description="所有项目的需求解析结果汇总。每条需求保留来源、业务规则、风险等级和待确认问题。"
        />
        {state.requirements.length === 0 ? (
          <div className="empty-state">
            <p>暂无需求解析结果。请前往具体项目发起 AI 解析。</p>
          </div>
        ) : (
          <DataTable<Requirement>
            rows={state.requirements}
            getRowKey={(row) => row.id}
            columns={[
              { key: "reqId", label: "需求编号", render: (row) => row.reqId || row.id },
              { key: "module", label: "模块", render: (row) => row.module },
              { key: "feature", label: "测试点", render: (row) => row.feature },
              { key: "source", label: "来源", render: (row) => row.source },
              {
                key: "risk",
                label: "风险",
                align: "center",
                render: (row) => <StatusPill tone={riskTone(row.risk)}>{row.risk}</StatusPill>,
              },
              { key: "question", label: "待确认问题", align: "left", render: (row) => row.question },
            ]}
          />
        )}
      </section>

      <section className="work-panel">
        <SectionHeader
          eyebrow="AI 解析规则"
          title="输出质量约束"
          description="避免把不确定内容写成事实，确保后续测试设计可追溯。"
        />
        <div className="rule-grid">
          <div className="rule-item">需求中没有的信息不能编造成事实。</div>
          <div className="rule-item">不确定内容必须标记为待确认。</div>
          <div className="rule-item">每个测试点和用例必须关联需求来源。</div>
          <div className="rule-item">业务规则、输入输出、异常规则需要分开提取。</div>
        </div>
      </section>
    </div>
  );
}
