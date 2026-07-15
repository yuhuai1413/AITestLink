import { useState } from "react";
import { Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "../../../app/store";
import { useProjectData } from "../useProjectData";
import { startExecuteScripts } from "../../../shared/hooks/aiTaskManager";
import { DataTable } from "../../../shared/components/DataTable";
import { SectionHeader } from "../../../shared/components/SectionHeader";
import { StatusPill } from "../../../shared/components/StatusPill";
import { Modal } from "../../../shared/components/Modal";
import type { AutomationScript } from "../../../shared/types/platform";
import { formatProjectTime as formatTime } from "./projectDetail.config";

// ═══════════════════════════════════════
// 执行脚本
// ═══════════════════════════════════════

export function ExecuteScriptsTab({ projectId }: { projectId: string }) {
  const { scripts, testCases, refreshScripts, loading, initialLoading } = useProjectData(projectId);
  const { dispatch } = useStore();
  const [viewScript, setViewScript] = useState<AutomationScript | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [runningAll, setRunningAll] = useState(false);
  const executionAvailable = false;

  const allSelected = scripts.length > 0 && scripts.every((s) => selectedIds.has(s.id));
  const toggleSelectAll = () => setSelectedIds(allSelected ? new Set() : new Set(scripts.map((s) => s.id)));
  const toggleSelect = (id: string) => setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const unreviewedScriptCount = scripts.filter((s) => (s as any).reviewStatus !== "已通过").length;

  const runAll = async () => {
    if (scripts.length === 0) { toast.warning("请先在「自动化脚本」页面生成脚本"); return; }
    if (unreviewedScriptCount > 0) { toast.warning(`还有 ${unreviewedScriptCount} 个脚本未评审通过，请先完成脚本评审后再执行`); return; }
    setRunningAll(true);
    try {
      const result = await startExecuteScripts(projectId);
      if (result.success) {
        await refreshScripts();
      }
    } finally {
      setRunningAll(false);
    }
  };

  const handleRun = async (script: AutomationScript) => {
    if ((script as any).reviewStatus !== "已通过") { toast.warning("该脚本未评审通过，请先在「自动化脚本」页面完成评审"); return; }
    setRunningId(script.id);
    try {
      const result = await startExecuteScripts(projectId);
      if (result.success) {
        await refreshScripts();
      }
    } finally {
      setRunningId(null);
    }
  };

  const getTestCaseTitle = (testCaseId: string | null | undefined) => {
    if (!testCaseId) return "-";
    const tc = testCases.find((t) => t.id === testCaseId);
    return tc ? tc.title : "-";
  };

  // 未配置隔离执行器时不伪造执行步骤、耗时或截图。
  const getMockResults = (script: AutomationScript) => {
    return {
      duration: "-",
      steps: [] as { name: string; status: "通过" | "失败"; time: string }[],
      screenshots: [] as string[],
      errors: ["尚未接入隔离执行器，当前没有真实执行日志"],
    };
  };

  return (
    <div className="page-stack page-stack--spaced page-stack--fill">
      <SectionHeader title="执行脚本" description="自动化脚本必须通过隔离 Worker 执行；当前环境尚未配置执行器。"
        actions={<>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="primary-button" type="button" onClick={runAll} disabled={!executionAvailable || runningAll} title="尚未配置隔离执行器">
                {runningAll ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                {runningAll ? "执行中..." : "全部执行"}
              </button>
            </div>
            <span style={{ color: "var(--muted)", fontSize: 12 }}>共 <strong style={{ color: "var(--text)" }}>{scripts.length}</strong> 个脚本</span>
          </div>
        </>} />
      <section className="work-panel">
        {initialLoading && scripts.length === 0 ? (
          <div className="empty-state"><Loader2 size={20} className="animate-spin" style={{ color: "var(--muted)" }} /><p style={{ marginTop: 8, color: "var(--muted)" }}>加载中...</p></div>
        ) : scripts.length === 0 ? (
          <div className="empty-state">
            <p>暂无脚本，请先在「自动化脚本」页面生成脚本</p>
          </div>
        ) : (
          <DataTable rows={scripts} getRowKey={(r) => r.id} columns={[
            { key: "select", label: <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />, width: "40px", sticky: "left" as const, render: (r) => <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleSelect(r.id)} /> },
            { key: "scriptCode", label: "脚本编号", render: (r) => r.scriptCode || <span style={{ color: "var(--muted)" }}>-</span> },
            { key: "testCase", label: "关联用例", align: "left", render: (r) => getTestCaseTitle(r.testCaseId) },
            { key: "testType", label: "测试类型", align: "center", render: (r) => {
              const tc = testCases.find((t) => t.id === r.testCaseId);
              return tc ? (tc.testType || "功能测试") : <span style={{ color: "var(--muted)" }}>-</span>;
            }},
            { key: "targetPlatform", label: "测试端", align: "center", render: (r) => testCases.find((t) => t.id === r.testCaseId)?.targetPlatform || "-" },
            { key: "testUrl", label: "测试地址", align: "left", render: (r) => testCases.find((t) => t.id === r.testCaseId)?.testUrl || "未配置" },
            { key: "requiredRole", label: "角色", align: "center", render: (r) => testCases.find((t) => t.id === r.testCaseId)?.requiredRole || "无" },
            { key: "framework", label: "框架", render: (r) => r.framework },
            { key: "scriptType", label: "脚本类型", render: (r) => r.scriptType },
            { key: "status", label: "状态", align: "center", render: (r) => (
              <StatusPill tone={r.status === "成功" ? "green" : r.status === "失败" ? "red" : r.status === "执行中" ? "blue" : "slate"}>
                {r.status}
              </StatusPill>
            )},
            { key: "review", label: "评审", align: "center", render: (r) => {
              const rev = (r as any).reviewStatus || "待评审";
              return <StatusPill tone={rev === "已通过" ? "green" : "slate"}>{rev}</StatusPill>;
            }},
            { key: "executedAt", label: "执行时间", render: (r) => r.executedAt ? formatTime(r.executedAt) : <span style={{ color: "var(--muted)" }}>-</span> },
            { key: "actions", label: "操作", width: "120px", sticky: "right" as const, align: "center", render: (r) => (
              <div className="inline-actions">
                <button className="text-button" type="button" onClick={() => handleRun(r)} disabled={!executionAvailable || runningId === r.id} title="尚未配置隔离执行器">
                  {runningId === r.id ? "执行中" : "执行"}
                </button>
                <button className="text-button" type="button" onClick={() => setViewScript(r)}>查看</button>
              </div>
            )},
          ]} />
        )}
      </section>

      {/* 执行结果查看弹窗 */}
      <Modal open={!!viewScript} onClose={() => setViewScript(null)} title={`执行结果 - ${viewScript?.framework || ""}`} width={800} height="85vh">
        {viewScript && (() => {
          const results = getMockResults(viewScript);
          const tc = testCases.find((t) => t.id === viewScript.testCaseId);
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 16, height: "100%", overflow: "auto" }}>
              {/* 基本信息 */}
              <div className="detail-grid">
                <div className="detail-row"><span className="detail-label">脚本编号</span><span>{viewScript.scriptCode || "-"}</span></div>
                <div className="detail-row"><span className="detail-label">脚本类型</span><span>{viewScript.scriptType}</span></div>
                <div className="detail-row"><span className="detail-label">测试类型</span><span>{tc?.testType || "功能测试"}</span></div>
                <div className="detail-row"><span className="detail-label">测试端</span><span>{tc?.targetPlatform || "-"}</span></div>
                <div className="detail-row detail-row--full"><span className="detail-label">测试地址</span><span style={{ overflowWrap: "anywhere" }}>{tc?.testUrl || "未配置"}</span></div>
                <div className="detail-row"><span className="detail-label">所需角色</span><span>{tc?.requiredRole || "无"}</span></div>
                <div className="detail-row"><span className="detail-label">执行状态</span><StatusPill tone={viewScript.status === "成功" ? "green" : viewScript.status === "失败" ? "red" : "slate"}>{viewScript.status}</StatusPill></div>
                <div className="detail-row"><span className="detail-label">执行时间</span><span>{viewScript.executedAt ? formatTime(viewScript.executedAt) : "未执行"}</span></div>
                <div className="detail-row"><span className="detail-label">执行耗时</span><span>{results.duration}</span></div>
                <div className="detail-row"><span className="detail-label">步骤统计</span><span><span style={{ color: "var(--green)" }}>{results.steps.filter((s) => s.status === "通过").length}</span> / {results.steps.length}</span></div>
              </div>

              {/* 执行步骤 */}
              <div>
                <h4 style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600 }}>执行步骤</h4>
                <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                  {results.steps.map((step, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", padding: "8px 12px", borderBottom: i < results.steps.length - 1 ? "1px solid var(--border)" : "none", gap: 10 }}>
                      <StatusPill tone={step.status === "通过" ? "green" : "red"}>{step.status}</StatusPill>
                      <span style={{ flex: 1, fontSize: 13 }}>{step.name}</span>
                      <span style={{ fontSize: 12, color: "var(--muted)" }}>{step.time}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 执行截图 */}
              <div>
                <h4 style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600 }}>执行截图</h4>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 }}>
                  {results.screenshots.map((desc, i) => (
                    <div key={i} style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                      <div style={{ height: 100, background: "var(--bg-secondary)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)", fontSize: 12 }}>
                        截图 {i + 1}
                      </div>
                      <div style={{ padding: "6px 10px", fontSize: 12, color: "var(--muted)" }}>{desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 错误日志 */}
              {results.errors.length > 0 && (
                <div>
                  <h4 style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "red" }}>错误日志</h4>
                  <pre style={{ background: "#1e1e2e", color: "#f38ba8", padding: 12, borderRadius: 8, fontSize: 12, lineHeight: 1.6, margin: 0, overflow: "auto", maxHeight: 120 }}>
                    {results.errors.join("\n")}
                  </pre>
                </div>
              )}

              {/* 脚本代码 */}
              <div style={{ flex: 1, minHeight: 0 }}>
                <h4 style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600 }}>脚本代码</h4>
                <pre style={{ background: "#1e1e2e", color: "#cdd6f4", padding: 12, borderRadius: 8, fontSize: 12, lineHeight: 1.6, margin: 0, overflow: "auto", height: "100%", minHeight: 150 }}>
                  {viewScript.code || "// 暂无代码"}
                </pre>
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}
