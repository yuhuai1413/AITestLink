import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, RadialBarChart, RadialBar,
} from "recharts";
import { useStore } from "../../app/store";
import { StatusPill } from "../../shared/components/StatusPill";
import { ChartTooltip } from "../../shared/components/ChartTooltip";
import {
  FolderOpen, FileText, ShieldCheck, AlertTriangle, ArrowRight,
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

const STATUS_COLORS: Record<string, string> = {
  设计中: C.amber,
  执行中: C.blue,
  阻塞: C.red,
  已完成: C.green,
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
  caseCount: number;
  p0Cases: number;
  passRate: number;
  blocked: number;
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
  const { state } = useStore();
  const navigate = useNavigate();

  const stats = useMemo<DashboardStats>(() => {
    const cases = state.testCases;
    const totalCases = cases.length;
    const passed = cases.filter((c) => c.reviewStatus === "已通过").length;
    const automatable = cases.filter((c) => c.automation === "适合").length;
    return {
      projectCount: state.projects.length,
      requirementCount: state.requirements.length,
      caseCount: totalCases,
      p0Cases: cases.filter((c) => c.priority === "P0").length,
      passRate: totalCases > 0 ? Math.round((passed / totalCases) * 100) : 0,
      blocked: state.projects.filter((p) => p.status === "阻塞").length,
      autoRate: totalCases > 0 ? Math.round((automatable / totalCases) * 100) : 0,
    };
  }, [state]);

  const statusData = useMemo<ChartDataItem[]>(() => {
    const map: Record<string, number> = {};
    state.projects.forEach((p) => { map[p.status] = (map[p.status] || 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value, fill: STATUS_COLORS[name] || C.slate }));
  }, [state.projects]);

  const priorityData = useMemo<ChartDataItem[]>(() => {
    const map: Record<string, number> = {};
    state.testCases.forEach((c) => { map[c.priority] = (map[c.priority] || 0) + 1; });
    return ["P0", "P1", "P2", "P3"].map((p) => ({ name: p, value: map[p] || 0, fill: PRIORITY_COLORS[p] }));
  }, [state.testCases]);

  const moduleData = useMemo(() => {
    const map: Record<string, number> = {};
    state.testCases.forEach((c) => { map[c.module] = (map[c.module] || 0) + 1; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, value]) => ({ name, value }));
  }, [state.testCases]);

  const reviewData = useMemo<ChartDataItem[]>(() => {
    const map: Record<string, number> = {};
    const colors: Record<string, string> = { "已通过": C.green, "待评审": C.amber, "需修改": C.red };
    state.testCases.forEach((c) => { map[c.reviewStatus] = (map[c.reviewStatus] || 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value, fill: colors[name] || C.slate }));
  }, [state.testCases]);

  const autoBarData = useMemo<ChartDataItem[]>(() => {
    const map: Record<string, number> = {};
    const colors: Record<string, string> = { "适合": C.green, "不适合": C.red, "待评估": C.amber };
    state.testCases.forEach((c) => { map[c.automation] = (map[c.automation] || 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value, fill: colors[name] || C.slate }));
  }, [state.testCases]);

  const radialData = useMemo(() => [{ name: "自动化覆盖", value: stats.autoRate, fill: C.blue }], [stats.autoRate]);

  const recentProjects = useMemo(() =>
    [...state.projects].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5),
  [state.projects]);

  const cards: { icon: LucideIcon; label: string; value: string | number; sub: string; color: string }[] = [
    { icon: FolderOpen, label: "项目总数", value: stats.projectCount, sub: `${stats.blocked} 个阻塞`, color: C.blue },
    { icon: FileText, label: "测试用例", value: stats.caseCount, sub: `P0 用例 ${stats.p0Cases} 条`, color: C.green },
    { icon: ShieldCheck, label: "用例通过率", value: `${stats.passRate}%`, sub: `共 ${stats.requirementCount} 条需求`, color: C.purple },
    { icon: AlertTriangle, label: "阻塞项目", value: stats.blocked, sub: stats.blocked > 0 ? "需及时处理" : "运行正常", color: stats.blocked > 0 ? C.red : C.green },
  ];

  return (
    <div className="dashboard">
      <div className="dash-stats">
        {cards.map((c) => <StatCard key={c.label} {...c} />)}
      </div>

      <div className="dash-charts-row">
        <div className="dash-card">
          <h3 className="dash-card-title">项目状态分布</h3>
          <div className="dash-chart-wrap">
            {statusData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={statusData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value" stroke="none">
                    {statusData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            ) : <EmptyChart />}
            <Legend data={statusData} />
          </div>
        </div>

        <div className="dash-card">
          <h3 className="dash-card-title">用例优先级分布</h3>
          <div className="dash-chart-wrap">
            {priorityData.some((d) => d.value > 0) ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={priorityData} barSize={36}>
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
            {stats.caseCount > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <RadialBarChart cx="50%" cy="50%" innerRadius="60%" outerRadius="90%" barSize={18} startAngle={90} endAngle={-270} data={radialData}>
                  <RadialBar background={{ fill: `${C.blue}18` }} dataKey="value" cornerRadius={90} />
                </RadialBarChart>
              </ResponsiveContainer>
            ) : <EmptyChart />}
            <div className="dash-radial-label">
              <strong>{stats.autoRate}%</strong>
              <span>自动化用例 {stats.caseCount > 0 ? Math.round(stats.caseCount * stats.autoRate / 100) : 0} 条</span>
            </div>
          </div>
          <div className="dash-auto-bars">
            {autoBarData.map((d) => (
              <div key={d.name} className="dash-auto-bar-row">
                <span>{d.name}</span>
                <div className="dash-auto-bar-track">
                  <div className="dash-auto-bar-fill" style={{
                    width: stats.caseCount > 0 ? `${(d.value / stats.caseCount) * 100}%` : "0%",
                    background: d.fill,
                  }} />
                </div>
                <span className="dash-auto-bar-val">{d.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="dash-charts-row">
        <div className="dash-card dash-card--wide">
          <h3 className="dash-card-title">模块用例分布</h3>
          <div className="dash-chart-wrap">
            {moduleData.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={moduleData} layout="vertical" barSize={20}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 12, fill: C.muted }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 12, fill: C.muted }} axisLine={false} tickLine={false} width={100} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="value" name="用例数" radius={[0, 6, 6, 0]} fill={C.blue} />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyChart />}
          </div>
        </div>

        <div className="dash-card">
          <h3 className="dash-card-title">用例评审状态</h3>
          <div className="dash-chart-wrap">
            {reviewData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={reviewData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value" stroke="none">
                    {reviewData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            ) : <EmptyChart />}
            <Legend data={reviewData} />
          </div>
        </div>
      </div>

      <div className="dash-card">
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
                <th>状态</th>
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
                    <StatusPill tone={p.status === "阻塞" ? "red" : p.status === "已完成" ? "green" : p.status === "执行中" ? "blue" : "amber"}>
                      {p.status}
                    </StatusPill>
                  </td>
                  <td>
                    <StatusPill tone={p.priority === "高" ? "red" : p.priority === "中" ? "amber" : "green"}>
                      {p.priority}
                    </StatusPill>
                  </td>
                  <td>{p.caseCount}</td>
                  <td>{p.passRate}%</td>
                  <td>{new Date(p.createdAt).toLocaleDateString("zh-CN")}</td>
                </tr>
              ))}
              {recentProjects.length === 0 && (
                <tr><td colSpan={7} className="dash-empty">暂无项目</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
