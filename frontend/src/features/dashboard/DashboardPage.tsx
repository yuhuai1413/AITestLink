import { useMemo, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { useStore } from "../../app/store";
import { StatusPill } from "../../shared/components/StatusPill";
import { ChartTooltip } from "../../shared/components/ChartTooltip";
import { projectsApi, requirementsApi, testPointsApi, testCasesApi } from "../../api/client";
import {
  FolderOpen, FileText, ShieldCheck, ArrowRight, Bot,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const C = {
  blue: "#6366f1",
  green: "#22c55e",
  amber: "#f59e0b",
  red: "#ef4444",
  slate: "#94a3b8",
  purple: "#a855f7",
  border: "#e2e8f0",
  text: "#0f172a",
  muted: "#64748b",
};

const PROJECT_PRIORITY_COLORS: Record<string, string> = {
  高: C.red,
  中: C.amber,
  低: C.green,
};

const PRIORITY_COLORS: Record<string, string> = {
  P0: C.red, P1: C.amber, P2: C.blue, P3: C.slate,
};

interface ChartDataItem {
  name: string;
  value: number;
  fill?: string;
}

interface DashboardStats {
  projectCount: number;
  requirementCount: number;
  testingCount: number;
  caseCount: number;
  p0Cases: number;
  passRate: number;
  autoRate: number;
}

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  sub: string;
  color: string;
}) {
  return (
    <div className="dash-stat-card">
      <div className="dash-stat-icon" style={{ background: `${color}14`, color }}>
        <Icon size={22} />
      </div>
      <div className="dash-stat-body">
        <span className="dash-stat-label">{label}</span>
        <strong className="dash-stat-value">{value}</strong>
        <span className="dash-stat-sub">{sub}</span>
      </div>
    </div>
  );
}

function EmptyChart() {
  return <div className="dash-empty">暂无数据</div>;
}

function CenterLabel({ value }: { value: string }) {
  return (
    <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 26, fontWeight: 700, fill: "var(--text)" }}>
      {value}
    </text>
  );
}

function Legend({ data }: { data: ChartDataItem[] }) {
  return (
    <div className="dash-legend">
      {data.map((d) => (
        <span key={d.name} className="dash-legend-item">
          <span className="dash-legend-dot" style={{ background: d.fill }} />
          {d.name} ({d.value})
        </span>
      ))}
    </div>
  );
}

export function DashboardPage() {
  const { state, dispatch } = useStore();
  const navigate = useNavigate();
  const loaded = useRef(false);

  // 每次进入仪表盘时从 API 刷新数据
  useEffect(() => {
    loaded.current = false;
    const refresh = async () => {
      try {
        const projects = await projectsApi.list();
        if (!projects || !Array.isArray(projects)) return;

        // 清空旧数据再写入，避免重复
        dispatch({ type: "SET_PROJECTS", payload: projects as any });

        const loadByProject = async <T,>(loader: (id: string) => Promise<T[]>): Promise<T[]> => {
          const results = await Promise.allSettled(projects.map((p) => loader(p.id)));
          const items: T[] = [];
          for (const r of results) {
            if (r.status === "fulfilled" && Array.isArray(r.value)) items.push(...r.value);
          }
          return items;
        };

        const [reqs, tps, tcs] = await Promise.all([
          loadByProject((id) => requirementsApi.list(id)),
          loadByProject((id) => testPointsApi.list(id)),
          loadByProject((id) => testCasesApi.list(id)),
        ]);

        // 先清空再写入
        dispatch({ type: "CLEAR_REQUIREMENTS", payload: "__ALL__" });
        dispatch({ type: "CLEAR_TEST_POINTS", payload: "__ALL__" });
        dispatch({ type: "CLEAR_TEST_CASES", payload: "__ALL__" });

        reqs.forEach((r: any) => dispatch({ type: "ADD_REQUIREMENT", payload: r }));
        tps.forEach((tp: any) => dispatch({ type: "ADD_TEST_POINT", payload: tp }));
        tcs.forEach((tc: any) => dispatch({ type: "ADD_TEST_CASE", payload: tc }));

        loaded.current = true;
      } catch { /* 静默失败 */ }
    };
    refresh();
  }, [dispatch]);

  const stats = useMemo<DashboardStats>(() => {
    const cases = state.testCases;
    const totalCases = cases.length;
    const passed = cases.filter((c) => c.reviewStatus === "已通过").length;
    const automatable = cases.filter((c) => c.automation === "是").length;
    return {
      projectCount: state.projects.length,
      requirementCount: state.requirements.length,
      testingCount: state.projects.filter((p) => p.testStatus === "测试中").length,
      caseCount: totalCases,
      p0Cases: cases.filter((c) => c.priority === "P0").length,
      passRate: totalCases > 0 ? Math.round((passed / totalCases) * 100) : 0,
      autoRate: totalCases > 0 ? Math.round((automatable / totalCases) * 100) : 0,
    };
  }, [state]);

  const projectPriorityData = useMemo<ChartDataItem[]>(() => {
    const map: Record<string, number> = {};
    state.projects.forEach((p) => { map[p.priority] = (map[p.priority] || 0) + 1; });
    return ["高", "中", "低"].map((p) => ({ name: p, value: map[p] || 0, fill: PROJECT_PRIORITY_COLORS[p] || C.slate }));
  }, [state.projects]);

  const priorityData = useMemo<ChartDataItem[]>(() => {
    const map: Record<string, number> = {};
    state.testCases.forEach((c) => { map[c.priority] = (map[c.priority] || 0) + 1; });
    return ["P0", "P1", "P2", "P3"].map((p) => ({ name: p, value: map[p] || 0, fill: PRIORITY_COLORS[p] }));
  }, [state.testCases]);




  const AUTO_COLORS = { "已自动化": C.blue, "未自动化": C.slate };
  const autoDistributionData = useMemo<ChartDataItem[]>(() => {
    const cases = state.testCases;
    const auto = cases.filter((c) => c.automation === "是").length;
    const total = cases.length;
    return [
      { name: "已自动化", value: auto, fill: AUTO_COLORS["已自动化"] },
      { name: "未自动化", value: total - auto, fill: AUTO_COLORS["未自动化"] },
    ];
  }, [state.testCases]);

  const recentProjects = useMemo(() =>
    [...state.projects].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 10),
  [state.projects]);

  const cards: { icon: LucideIcon; label: string; value: string | number; sub: string; color: string }[] = [
    { icon: FolderOpen, label: "项目总数", value: stats.projectCount, sub: `${stats.testingCount} 个测试中`, color: C.blue },
    { icon: FileText, label: "测试用例", value: stats.caseCount, sub: `P0 用例 ${stats.p0Cases} 条`, color: C.green },
    { icon: ShieldCheck, label: "评审通过率", value: `${stats.passRate}%`, sub: `${stats.caseCount} 条用例已评审`, color: C.purple },
    { icon: Bot, label: "自动化覆盖", value: `${stats.autoRate}%`, sub: `适合自动化 ${stats.caseCount > 0 ? Math.round(stats.caseCount * stats.autoRate / 100) : 0} 条`, color: C.blue },
  ];

  return (
    <div className="dashboard">
      <div className="dash-stats">
        {cards.map((c) => <StatCard key={c.label} {...c} />)}
      </div>

      <div className="dash-charts-row">
        <div className="dash-card">
          <h3 className="dash-card-title">项目优先级分布</h3>
          <div className="dash-chart-wrap">
            {projectPriorityData.some((d) => d.value > 0) ? (
              <ResponsiveContainer width="100%" height={170}>
                <PieChart>
                  <Pie data={projectPriorityData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value" stroke="none">
                    {projectPriorityData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            ) : <EmptyChart />}
            <Legend data={projectPriorityData} />
          </div>
        </div>

        <div className="dash-card">
          <h3 className="dash-card-title">用例优先级分布</h3>
          <div className="dash-chart-wrap">
            {priorityData.some((d) => d.value > 0) ? (
              <ResponsiveContainer width="100%" height={198}>
                <BarChart data={priorityData} barSize={36} margin={{ top: 20, right: 16, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: C.muted }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: C.muted }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="value" name="用例数" radius={[6, 6, 0, 0]}>
                    {priorityData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyChart />}
          </div>
        </div>

        <div className="dash-card">
          <h3 className="dash-card-title">自动化覆盖率</h3>
          <div className="dash-chart-wrap dash-chart-center">
            {autoDistributionData.some((d) => d.value > 0) ? (
              <ResponsiveContainer width="100%" height={170}>
                <PieChart>
                  <Pie data={autoDistributionData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value" stroke="none" label={false}>
                    {autoDistributionData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                  <CenterLabel value={`${stats.autoRate}%`} />
                </PieChart>
              </ResponsiveContainer>
            ) : <EmptyChart />}
            <Legend data={autoDistributionData} />
          </div>
        </div>
      </div>



      <div className="dash-card dash-card--fill">
        <div className="dash-card-header">
          <h3 className="dash-card-title">最近项目</h3>
          <button className="text-button" onClick={() => navigate("/projects")}>
            查看全部 <ArrowRight size={14} />
          </button>
        </div>
        <div className="dash-recent-table">
          <table>
            <thead>
              <tr>
                <th>项目名称</th>
                <th>测试类型</th>
                <th>测试状态</th>
                <th>文档状态</th>
                <th>优先级</th>
                <th>用例数</th>
                <th>通过率</th>
                <th>创建时间</th>
              </tr>
            </thead>
            <tbody>
              {recentProjects.map((p) => (
                <tr key={p.id} className="dash-recent-row" onClick={() => navigate(`/projects/${p.id}`)}>
                  <td><strong>{p.name}</strong></td>
                  <td>{p.testType}</td>
                  <td>
                    <StatusPill tone={p.testStatus === "已测试" ? "green" : p.testStatus === "测试中" ? "blue" : "amber"}>
                      {p.testStatus}
                    </StatusPill>
                  </td>
                  <td>
                    <StatusPill tone={p.docStatus === "已完成" ? "green" : p.docStatus === "解析中" ? "blue" : "amber"}>
                      {p.docStatus}
                    </StatusPill>
                  </td>
                  <td>
                    <StatusPill tone={p.priority === "高" ? "red" : p.priority === "中" ? "amber" : "green"}>
                      {p.priority}
                    </StatusPill>
                  </td>
                  <td>{p.caseCount}</td>
                  <td>{p.passRate}%</td>
                  <td>{(() => { const d = new Date(p.createdAt); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}:${String(d.getSeconds()).padStart(2,"0")}`; })()}</td>
                </tr>
              ))}
              {recentProjects.length === 0 && (
                <tr><td colSpan={8} className="dash-empty">暂无项目</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
