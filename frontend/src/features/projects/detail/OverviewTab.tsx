import { useMemo, useState, useEffect } from "react";
import {
  PieChart, Pie, Cell,
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  Code2,
  FileText,
  Flag,
  ListChecks,
  Rocket,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { useProjectData } from "../useProjectData";
import { StatusPill } from "../../../shared/components/StatusPill";
import { ChartTooltip } from "../../../shared/components/ChartTooltip";
import { formatDateTime } from "../../../shared/utils/dateTime";

const C = {
  blue: "#6366f1",
  green: "#22c55e",
  amber: "#f59e0b",
  red: "#ef4444",
  purple: "#a855f7",
  slate: "#94a3b8",
  border: "#e2e8f0",
};

const STAGE_COLORS = [C.green, C.amber, C.purple, C.blue];

const CHART_ANIMATION = {
  isAnimationActive: true,
  animationBegin: 0,
  animationDuration: 900,
  animationEasing: "ease-out",
} as const;

function percent(done: number, total: number) {
  return total > 0 ? Math.round((done / total) * 100) : 0;
}

function clamp(value: number) {
  return Math.max(0, value);
}

/* ─── 圆角扇形组件（填充路径 + 半圆端点） ─── */

function RoundedSector(props: any) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
  if (startAngle === endAngle) return null;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const capR = (outerRadius - innerRadius) / 2;

  const ox1 = cx + outerRadius * Math.cos(toRad(startAngle));
  const oy1 = cy + outerRadius * Math.sin(toRad(startAngle));
  const ox2 = cx + outerRadius * Math.cos(toRad(endAngle));
  const oy2 = cy + outerRadius * Math.sin(toRad(endAngle));
  const ix1 = cx + innerRadius * Math.cos(toRad(endAngle));
  const iy1 = cy + innerRadius * Math.sin(toRad(endAngle));
  const ix2 = cx + innerRadius * Math.cos(toRad(startAngle));
  const iy2 = cy + innerRadius * Math.sin(toRad(startAngle));

  const diff = Math.abs(endAngle - startAngle);
  const largeArc = diff > 180 ? 1 : 0;
  const sweep = endAngle > startAngle ? 1 : 0;

  const d = [
    `M ${ox1} ${oy1}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} ${sweep} ${ox2} ${oy2}`,
    `A ${capR} ${capR} 0 0 0 ${ix1} ${iy1}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} ${1 - sweep} ${ix2} ${iy2}`,
    `A ${capR} ${capR} 0 0 0 ${ox1} ${oy1}`,
    "Z",
  ].join(" ");

  return <path d={d} fill={fill} />;
}

/* ─── Skeleton ─── */

function OverviewSkeleton() {
  return (
    <div className="overview-page">
      <div className="dash-stats" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        {Array.from({ length: 4 }).map((_, index) => (
          <div className="dash-stat-card dash-skeleton-card" key={index}>
            <span className="dash-skeleton dash-skeleton-icon" />
            <div className="dash-stat-body">
              <span className="dash-skeleton dash-skeleton-line dash-skeleton-line--sm" />
              <span className="dash-skeleton dash-skeleton-line dash-skeleton-line--lg" />
              <span className="dash-skeleton dash-skeleton-line dash-skeleton-line--md" />
            </div>
          </div>
        ))}
      </div>
      <div className="dash-stats">
        {Array.from({ length: 4 }).map((_, index) => (
          <div className="dash-stat-card dash-skeleton-card" key={index}>
            <span className="dash-skeleton dash-skeleton-icon" />
            <div className="dash-stat-body">
              <span className="dash-skeleton dash-skeleton-line dash-skeleton-line--sm" />
              <span className="dash-skeleton dash-skeleton-line dash-skeleton-line--lg" />
              <span className="dash-skeleton dash-skeleton-line dash-skeleton-line--md" />
            </div>
          </div>
        ))}
      </div>
      <div className="dash-charts-row">
        {/* 健康度 → 环形 */}
        <div className="dash-card dash-skeleton-card">
          <h3 className="dash-card-title"><span className="dash-skeleton dash-skeleton-title" /></h3>
          <div className="dash-chart-wrap">
            <div className="dash-skeleton-donut">
              <span className="dash-skeleton-donut-core" />
            </div>
          </div>
        </div>
        {/* 阶段进度 → 柱状 */}
        <div className="dash-card dash-skeleton-card">
          <h3 className="dash-card-title"><span className="dash-skeleton dash-skeleton-title" /></h3>
          <div className="dash-chart-wrap">
            <div className="dash-skeleton-bars">
              {Array.from({ length: 4 }).map((_, barIndex) => (
                <span
                  className="dash-skeleton dash-skeleton-bar"
                  style={{ height: `${52 + barIndex * 18}px` }}
                  key={barIndex}
                />
              ))}
            </div>
          </div>
        </div>
        {/* 用例执行分布 → 环形 */}
        <div className="dash-card dash-skeleton-card">
          <h3 className="dash-card-title"><span className="dash-skeleton dash-skeleton-title" /></h3>
          <div className="dash-chart-wrap">
            <div className="dash-skeleton-donut">
              <span className="dash-skeleton-donut-core" />
            </div>
            <div className="dash-skeleton-legend">
              {Array.from({ length: 3 }).map((_, legendIndex) => (
                <span className="dash-skeleton dash-skeleton-legend-item" key={legendIndex} />
              ))}
            </div>
          </div>
        </div>
      </div>
      {/* 底部：质量洞察 + 下一步行动 */}
      <div className="dash-charts-row" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="dash-card dash-skeleton-card">
          <h3 className="dash-card-title"><span className="dash-skeleton dash-skeleton-title" /></h3>
          <div className="ov-insight-list">
            {Array.from({ length: 3 }).map((_, i) => (
              <div className="ov-insight-row" key={i}>
                <span className="dash-skeleton dash-skeleton-icon" style={{ width: 34, height: 34, borderRadius: "var(--radius-l3)" }} />
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                  <span className="dash-skeleton dash-skeleton-line dash-skeleton-line--sm" />
                  <span className="dash-skeleton dash-skeleton-line" style={{ width: 40, height: 18 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="dash-card dash-skeleton-card">
          <h3 className="dash-card-title"><span className="dash-skeleton dash-skeleton-title" /></h3>
          <div className="ov-action-list">
            {Array.from({ length: 3 }).map((_, i) => (
              <div className="ov-action-row" key={i}>
                <span className="dash-skeleton dash-skeleton-icon" style={{ width: 34, height: 34, borderRadius: "var(--radius-l3)" }} />
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                  <span className="dash-skeleton dash-skeleton-line" style={{ width: "70%", height: 13 }} />
                  <span className="dash-skeleton dash-skeleton-line dash-skeleton-line--md" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── 主组件 ─── */

export function OverviewTab({ projectId }: { projectId: string }) {
  const { project, requirements, testPoints, testCases, scripts, initialLoading } = useProjectData(projectId);
  const [showContent, setShowContent] = useState(false);
  useEffect(() => {
    if (!initialLoading) {
      const delay = Math.max(0, 520 - 0);
      window.setTimeout(() => setShowContent(true), delay);
    }
  }, [initialLoading]);

  const stats = useMemo(() => {
    const reqTotal = requirements.length;
    const reqPassed = requirements.filter((r) => r.reviewStatus === "已通过").length;
    const highRiskReq = requirements.filter((r) => r.risk === "高").length;

    const pointTotal = testPoints.length;
    const pointPassed = testPoints.filter((tp) => tp.reviewStatus === "已通过").length;
    const automatablePoints = testPoints.filter((tp) => tp.automatable).length;

    const caseTotal = testCases.length;
    const casePassed = testCases.filter((tc) => tc.reviewStatus === "已通过").length;
    const autoCases = testCases.filter((tc) => tc.automation === "是").length;
    const executedCases = testCases.filter((tc) => tc.passed === "通过").length;
    const failedCases = testCases.filter((tc) => tc.passed === "不通过").length;

    const scriptTotal = scripts.length;
    const scriptReviewed = scripts.filter((s) => s.reviewStatus === "已通过").length;

    const reqPending = reqTotal - reqPassed;
    const reviewTodo = clamp(reqPending) + clamp(pointTotal - pointPassed) + clamp(caseTotal - casePassed) + clamp(scriptTotal - scriptReviewed);
    const automationRate = percent(autoCases, caseTotal);
    const executionRate = percent(executedCases, caseTotal);
    const defectRate = caseTotal > 0 ? Number(((failedCases / caseTotal) * 100).toFixed(1)) : 0;
    const healthScore = Math.round(
      (percent(reqPassed, reqTotal) + percent(pointPassed, pointTotal) + percent(casePassed, caseTotal) + percent(scriptReviewed, scriptTotal)) / 4
    );

    return {
      reqTotal, reqPassed, highRiskReq,
      pointTotal, pointPassed, automatablePoints,
      caseTotal, casePassed, autoCases, executedCases, failedCases,
      scriptTotal, scriptReviewed,
      reqPending, reviewTodo, automationRate, executionRate, defectRate, healthScore,
    };
  }, [requirements, testPoints, testCases, scripts]);

  const stageData = useMemo(() => [
    { name: "需求解析", done: stats.reqPassed, total: stats.reqTotal, fill: STAGE_COLORS[0] },
    { name: "测试点", done: stats.pointPassed, total: stats.pointTotal, fill: STAGE_COLORS[1] },
    { name: "用例编写", done: stats.casePassed, total: stats.caseTotal, fill: STAGE_COLORS[2] },
    { name: "脚本评审", done: stats.scriptReviewed, total: stats.scriptTotal, fill: STAGE_COLORS[3] },
  ], [stats]);

  const healthRingData = useMemo(() => [
    { name: "完成", value: stats.healthScore, fill: stats.healthScore >= 80 ? C.green : stats.healthScore >= 50 ? C.amber : C.blue },
    { name: "待完善", value: 100 - stats.healthScore, fill: C.border },
  ], [stats.healthScore]);

  const qualityData = useMemo(() => [
    { name: "通过", value: stats.casePassed, fill: C.green },
    { name: "失败", value: stats.failedCases, fill: C.red },
    { name: "未执行", value: stats.caseTotal - stats.executedCases, fill: C.slate },
  ].filter((d) => d.value > 0), [stats]);

  if (!showContent) {
    return <OverviewSkeleton />;
  }

  return (
    <div className="overview-page">
      {/* ── 项目基本信息卡片 ── */}
      <div className="dash-stats" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <div className="dash-stat-card">
          <div className="dash-stat-icon" style={{ background: `${C.purple}14`, color: C.purple }}>
            <FileText size={22} />
          </div>
          <div className="dash-stat-body">
            <span className="dash-stat-label">测试类型</span>
            <strong className="dash-stat-value" style={{ fontSize: 16 }}>{project?.testType || "-"}</strong>
            <span className="dash-stat-sub">测试范围</span>
          </div>
        </div>
        <div className="dash-stat-card">
          <div className="dash-stat-icon" style={{ background: `${C.amber}14`, color: C.amber }}>
            <Flag size={22} />
          </div>
          <div className="dash-stat-body">
            <span className="dash-stat-label">优先级</span>
            <StatusPill tone={project?.priority === "高" ? "red" : project?.priority === "中" ? "amber" : "green"}>
              {project?.priority || "-"}
            </StatusPill>
            <span className="dash-stat-sub">项目优先级</span>
          </div>
        </div>
        <div className="dash-stat-card">
          <div className="dash-stat-icon" style={{ background: `${C.green}14`, color: C.green }}>
            <CheckCircle2 size={22} />
          </div>
          <div className="dash-stat-body">
            <span className="dash-stat-label">测试状态</span>
            <StatusPill tone={project?.testStatus === "已测试" ? "green" : project?.testStatus === "测试中" ? "blue" : "amber"}>
              {project?.testStatus || "-"}
            </StatusPill>
            <span className="dash-stat-sub">当前进度</span>
          </div>
        </div>
        <div className="dash-stat-card">
          <div className="dash-stat-icon" style={{ background: `${C.purple}14`, color: C.purple }}>
            <Clock size={22} />
          </div>
          <div className="dash-stat-body">
            <span className="dash-stat-label">文档状态</span>
            <StatusPill tone={project?.docStatus === "已完成" ? "green" : project?.docStatus === "解析中" ? "blue" : "amber"}>
              {project?.docStatus || "-"}
            </StatusPill>
            <span className="dash-stat-sub">{project?.createdAt ? formatDateTime(project.createdAt) : "-"}</span>
          </div>
        </div>
      </div>

      {/* ── 核心指标 ── */}
      <div className="dash-stats">
        <div className="dash-stat-card">
          <div className="dash-stat-icon" style={{ background: `${C.green}14`, color: C.green }}>
            <FileText size={22} />
          </div>
          <div className="dash-stat-body">
            <span className="dash-stat-label">需求</span>
            <strong className="dash-stat-value">{stats.reqTotal}</strong>
            <span className="dash-stat-sub">
              已通过 {stats.reqPassed}{stats.reqTotal > stats.reqPassed ? ` · 待评审 ${stats.reqTotal - stats.reqPassed}` : ""}
            </span>
          </div>
        </div>
        <div className="dash-stat-card">
          <div className="dash-stat-icon" style={{ background: `${C.amber}14`, color: C.amber }}>
            <ListChecks size={22} />
          </div>
          <div className="dash-stat-body">
            <span className="dash-stat-label">测试点</span>
            <strong className="dash-stat-value">{stats.pointTotal}</strong>
            <span className="dash-stat-sub">
              已通过 {stats.pointPassed}{stats.automatablePoints > 0 ? ` · 可自动化 ${stats.automatablePoints}` : ""}
            </span>
          </div>
        </div>
        <div className="dash-stat-card">
          <div className="dash-stat-icon" style={{ background: `${C.purple}14`, color: C.purple }}>
            <ClipboardList size={22} />
          </div>
          <div className="dash-stat-body">
            <span className="dash-stat-label">测试用例</span>
            <strong className="dash-stat-value">{stats.caseTotal}</strong>
            <span className="dash-stat-sub">
              已通过 {stats.casePassed}{stats.failedCases > 0 ? ` · 失败 ${stats.failedCases}` : ""}
            </span>
          </div>
        </div>
        <div className="dash-stat-card">
          <div className="dash-stat-icon" style={{ background: `${C.blue}14`, color: C.blue }}>
            <Bot size={22} />
          </div>
          <div className="dash-stat-body">
            <span className="dash-stat-label">自动化覆盖</span>
            <strong className="dash-stat-value">{stats.automationRate}%</strong>
            <span className="dash-stat-sub">{stats.autoCases}/{stats.caseTotal} 条已自动化</span>
          </div>
        </div>
      </div>

      {/* ── 图表行 ── */}
      <div className="dash-charts-row">
        {/* 健康度 — Recharts PieChart + 圆角扇形 */}
        <div className="dash-card">
          <h3 className="dash-card-title">项目健康度</h3>
          <div className="dash-chart-wrap">
            {healthRingData[0].value > 0 ? (
              <ResponsiveContainer width="100%" height={170}>
                <PieChart>
                  <Pie
                    data={healthRingData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                    shape={<RoundedSector />}
                    {...CHART_ANIMATION}
                  >
                    {healthRingData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="dash-empty">暂无数据</div>
            )}
            <div className="ov-center-label">
              <strong>{stats.healthScore}%</strong>
              <span>{stats.reviewTodo > 0 ? "推进中" : stats.healthScore >= 80 ? "状态良好" : "待完善"}</span>
            </div>
          </div>
        </div>

        {/* 阶段进度 */}
        <div className="dash-card">
          <h3 className="dash-card-title">阶段进度</h3>
          <div className="dash-chart-wrap">
            {stageData.some((d) => d.total > 0) ? (
              <ResponsiveContainer width="100%" height={170}>
                <BarChart data={stageData} barSize={32} margin={{ top: 20, right: 16, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="done" name="已评审" radius={[6, 6, 0, 0]} {...CHART_ANIMATION}>
                    {stageData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="dash-empty">暂无数据</div>
            )}
            <div className="dash-legend">
              {stageData.map((d) => (
                <span key={d.name} className="dash-legend-item">
                  <span className="dash-legend-dot" style={{ background: d.fill }} />
                  {d.name} ({d.done}/{d.total})
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* 用例执行分布 — Recharts PieChart + 圆角扇形 */}
        <div className="dash-card">
          <h3 className="dash-card-title">用例执行分布</h3>
          <div className="dash-chart-wrap dash-chart-center">
            {stats.caseTotal > 0 ? (
              <ResponsiveContainer width="100%" height={170}>
                <PieChart>
                  <Pie
                    data={qualityData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                    shape={<RoundedSector />}
                    {...CHART_ANIMATION}
                  >
                    {qualityData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="dash-empty">暂无数据</div>
            )}
            <div className="dash-legend">
              {qualityData.map((d) => (
                <span key={d.name} className="dash-legend-item">
                  <span className="dash-legend-dot" style={{ background: d.fill }} />
                  {d.name} ({d.value})
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── 底部：质量洞察 + 行动建议 ── */}
      <div className="dash-charts-row" style={{ gridTemplateColumns: "1fr 1fr" }}>
        {/* 质量洞察 */}
        <div className="dash-card">
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}><div style={{ width: 34, height: 34, display: "grid", placeItems: "center", flexShrink: 0 }}><Sparkles size={18} /></div><h3 className="dash-card-title" style={{ margin: 0 }}>质量洞察</h3></div>
          <div className="ov-insight-list">
            <div className="ov-insight-row">
              <div className="ov-insight-icon" style={{ background: `${C.red}14`, color: C.red }}>
                <AlertTriangle size={16} />
              </div>
              <div className="ov-insight-body">
                <span className="ov-insight-label">高风险需求</span>
                <strong className="ov-insight-value">{stats.highRiskReq}</strong>
              </div>
              <span className="ov-insight-hint">{stats.highRiskReq > 0 ? "建议优先覆盖" : "当前无高风险"}</span>
            </div>
            <div className="ov-insight-row">
              <div className="ov-insight-icon" style={{ background: `${C.red}14`, color: C.red }}>
                <TrendingUp size={16} />
              </div>
              <div className="ov-insight-body">
                <span className="ov-insight-label">缺陷率</span>
                <strong className="ov-insight-value">{stats.defectRate}%</strong>
              </div>
              <span className="ov-insight-hint">{stats.failedCases > 0 ? `失败 ${stats.failedCases} 条` : "当前零缺陷"}</span>
            </div>
            <div className="ov-insight-row">
              <div className="ov-insight-icon" style={{ background: `${C.green}14`, color: C.green }}>
                <CheckCircle2 size={16} />
              </div>
              <div className="ov-insight-body">
                <span className="ov-insight-label">用例执行率</span>
                <strong className="ov-insight-value">{stats.executionRate}%</strong>
              </div>
              <span className="ov-insight-hint">{stats.executedCases} 条已执行</span>
            </div>
          </div>
        </div>

        {/* 下一步行动 */}
        <div className="dash-card">
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}><div style={{ width: 34, height: 34, display: "grid", placeItems: "center", flexShrink: 0 }}><Rocket size={18} /></div><h3 className="dash-card-title" style={{ margin: 0 }}>下一步行动</h3></div>
          <div className="ov-action-list">
            <div className="ov-action-row">
              <div className={`ov-action-icon ${stats.reqPending === 0 && stats.reqTotal > 0 ? "ov-action-icon--done" : ""}`}>
                {stats.reqPending === 0 && stats.reqTotal > 0
                  ? <CheckCircle2 size={16} />
                  : <FileText size={16} />}
              </div>
              <div className="ov-action-body">
                <strong>{stats.reqPending > 0 ? `评审 ${stats.reqPending} 条需求` : "需求评审已完成"}</strong>
                <span>{stats.reqPending > 0 ? "完成后可生成测试点" : "进入测试点设计阶段"}</span>
              </div>
              <ChevronRight size={14} className="ov-action-arrow" />
            </div>
            <div className="ov-action-row">
              <div className={`ov-action-icon ${stats.highRiskReq === 0 ? "ov-action-icon--done" : ""}`} style={stats.highRiskReq > 0 ? { background: `${C.red}14`, color: C.red } : undefined}>
                {stats.highRiskReq > 0
                  ? <AlertTriangle size={16} />
                  : <CheckCircle2 size={16} />}
              </div>
              <div className="ov-action-body">
                <strong>{stats.highRiskReq > 0 ? `关注 ${stats.highRiskReq} 条高风险需求` : "暂无高风险需求"}</strong>
                <span>建议拆解并优先覆盖</span>
              </div>
              <ChevronRight size={14} className="ov-action-arrow" />
            </div>
            <div className="ov-action-row">
              <div className={`ov-action-icon ${stats.scriptTotal > 0 && stats.scriptReviewed === stats.scriptTotal ? "ov-action-icon--done" : ""}`}>
                {stats.scriptTotal > 0 && stats.scriptReviewed === stats.scriptTotal
                  ? <CheckCircle2 size={16} />
                  : <Code2 size={16} />}
              </div>
              <div className="ov-action-body">
                <strong>{stats.scriptTotal === 0 ? "生成自动化脚本" : "完善脚本评审"}</strong>
                <span>{stats.automationRate >= 60 ? `覆盖 ${stats.automationRate}%，继续保持` : `覆盖 ${stats.automationRate}%，建议提升`}</span>
              </div>
              <ChevronRight size={14} className="ov-action-arrow" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
