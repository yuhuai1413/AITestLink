import { useEffect, useMemo, useState } from "react";
import { Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import { useProjectData } from "../useProjectData";
import { scriptsApi } from "../../../api/automation.api";
import { DataTable } from "../../../shared/components/DataTable";
import { MenuSelect } from "../../../shared/components/MenuSelect";
import { SectionHeader } from "../../../shared/components/SectionHeader";
import { StatusPill } from "../../../shared/components/StatusPill";
import { Modal } from "../../../shared/components/Modal";
import type { ExecutionRun } from "../../../contracts/automation";
import type { AutomationScript } from "../../../shared/types/platform";
import { formatProjectTime as formatTime } from "./projectDetail.config";

// ═══════════════════════════════════════
// 执行脚本
// ═══════════════════════════════════════

export function ExecuteScriptsTab({ projectId }: { projectId: string }) {
  const { scripts, testCases, refreshScripts, loading, initialLoading } = useProjectData(projectId);
  const [viewScript, setViewScript] = useState<AutomationScript | null>(null);
  const [resultTab, setResultTab] = useState<"info" | "code" | "result">("info");
  const [runningId, setRunningId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [moduleFilter, setModuleFilter] = useState("all");
  const [runningAll, setRunningAll] = useState(false);
  const [executionRuns, setExecutionRuns] = useState<Record<string, ExecutionRun[]>>({});

  useEffect(() => {
    if (scripts.length === 0) {
      setExecutionRuns({});
      return;
    }
    let cancelled = false;
    Promise.all(
      scripts.map(async (script) => {
        try {
          return [script.id, await scriptsApi.executions(script.id)] as const;
        } catch {
          return [script.id, []] as const;
        }
      }),
    ).then((items) => {
      if (cancelled) return;
      setExecutionRuns(Object.fromEntries(items));
    });
    return () => { cancelled = true; };
  }, [scripts]);

  const modules = useMemo(() => Array.from(new Set(scripts.map((script) => testCases.find((tc) => tc.id === script.testCaseId)?.module).filter(Boolean) as string[])), [scripts, testCases]);
  const filteredScripts = useMemo(() => moduleFilter === "all" ? scripts : scripts.filter((script) => testCases.find((tc) => tc.id === script.testCaseId)?.module === moduleFilter), [scripts, testCases, moduleFilter]);
  const allSelected = filteredScripts.length > 0 && filteredScripts.every((s) => selectedIds.has(s.id));
  const toggleSelectAll = () => setSelectedIds(allSelected ? new Set() : new Set(filteredScripts.map((s) => s.id)));
  const toggleSelect = (id: string) => setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const normalizeTestStatus = (status?: string | null) => {
    if (status === "通过") return "通过";
    if (status === "失败") return "失败";
    return "未测试";
  };
  const statusTone = (status?: string | null) => {
    const normalized = normalizeTestStatus(status);
    return normalized === "通过" ? "green" : normalized === "失败" ? "red" : "slate";
  };

  const getExecutionStatus = (script: AutomationScript) => {
    if (runningId === script.id) return "执行中";
    const run = latestRun(script);
    if (run?.status === "执行中") return "执行中";
    if (run?.finishedAt || script.executedAt) return "已完成";
    return "未执行";
  };

  const executionStatusTone = (status: string) => {
    if (status === "执行中") return "blue";
    if (status === "已完成") return "green";
    return "slate";
  };

  const getExecutionPayload = async (script: AutomationScript) => {
    const options = await scriptsApi.executionOptions(script.id);
    const environmentId = options.boundEnvironmentId || options.environments[0]?.id;
    if (!environmentId) throw new Error("该脚本没有可用测试环境，请先在环境配置中补充 Web/APP 地址");
    const environment = options.environments.find((item) => item.id === environmentId) || options.environments[0];
    if (options.requiredRole === "待配置") throw new Error("该用例的执行角色仍为待配置，请先重新生成或编辑测试用例");
    const needsAccount = options.requiredRole && options.requiredRole !== "无";
    const account = needsAccount ? environment?.accounts?.[0] : undefined;
    if (needsAccount && !account) throw new Error(`该用例需要“${options.requiredRole}”角色账号，请先在环境配置中添加账号`);
    return { environmentId, accountId: account?.id };
  };

  const executeOne = async (script: AutomationScript, silent = false, visual = false) => {
    if ((script as any).validityStatus === "已失效") {
      if (!silent) toast.warning((script as any).invalidReason || "脚本已失效，请重新生成脚本");
      return false;
    }
    if ((script as any).reviewStatus !== "已通过") {
      if (!silent) toast.warning("该脚本未评审通过，请先在「自动化脚本」页面完成评审");
      return false;
    }
    setRunningId(script.id);
    try {
      const payload = await getExecutionPayload(script);
      if (visual) toast.info("正在启动可视化浏览器窗口...");
      const result = await scriptsApi.execute(script.id, visual ? { ...payload, headed: true, slowMo: 500 } : payload);
      const latestRun = await scriptsApi.executions(script.id);
      setExecutionRuns((prev) => ({ ...prev, [script.id]: latestRun }));
      await refreshScripts();
      if (!silent) {
        result.status === "通过" ? toast.success("测试通过") : toast.error(result.error || "测试失败");
      }
      return result.status === "通过";
    } catch (err) {
      if (!silent) toast.error(err instanceof Error ? err.message : "脚本执行失败");
      return false;
    } finally {
      setRunningId(null);
    }
  };

  const runAll = async () => {
    if (scripts.length === 0) { toast.warning("请先在「自动化脚本」页面生成脚本"); return; }
    const targets = selectedIds.size > 0 ? scripts.filter((script) => selectedIds.has(script.id)) : scripts;
    const unreviewedScriptCount = targets.filter((s) => (s as any).reviewStatus !== "已通过").length;
    if (unreviewedScriptCount > 0) { toast.warning(`还有 ${unreviewedScriptCount} 个脚本未评审通过，请先完成脚本评审后再执行`); return; }
    setRunningAll(true);
    try {
      let passed = 0;
      for (const script of targets) {
        const ok = await executeOne(script, true);
        if (ok) passed += 1;
      }
      toast[passed === targets.length ? "success" : "warning"](`执行完成：通过 ${passed} 个，失败 ${targets.length - passed} 个`);
    } finally {
      setRunningAll(false);
    }
  };

  const handleRun = async (script: AutomationScript) => {
    await executeOne(script);
  };

  const handleVisualRun = async (script: AutomationScript) => {
    await executeOne(script, false, true);
  };

  const getTestCaseTitle = (testCaseId: string | null | undefined) => {
    if (!testCaseId) return "-";
    const tc = testCases.find((t) => t.id === testCaseId);
    return tc ? `${tc.caseCode} · ${tc.title}` : "-";
  };

  const openResultDetail = async (script: AutomationScript) => {
    setResultTab("result");
    setViewScript(script);
    try {
      const runs = await scriptsApi.executions(script.id);
      setExecutionRuns((prev) => ({ ...prev, [script.id]: runs }));
    } catch {
      setExecutionRuns((prev) => ({ ...prev, [script.id]: [] }));
    }
  };

  const latestRun = (script: AutomationScript) => executionRuns[script.id]?.[0];

  return (
    <div className="page-stack page-stack--spaced page-stack--fill">
      <SectionHeader title="执行脚本" description="按用例绑定的测试环境执行脚本，测试地址和账号通过环境变量注入。" meta={moduleFilter !== "all" ? <>显示 <strong>{filteredScripts.length}</strong> / 共 <strong>{scripts.length}</strong> 个脚本</> : <>共 <strong>{scripts.length}</strong> 个脚本</>}
        actions={<>
          <div className="section-actions-stack">
            <div className="section-actions-row">
              {modules.length > 1 ? <MenuSelect className="filter-menu-select" size="compact" value={moduleFilter} options={[{ value: "all", label: "全部模块" }, ...modules.map((m) => ({ value: m, label: m }))]} onChange={setModuleFilter} /> : null}
              <button className="primary-button" type="button" onClick={runAll} disabled={runningAll || loading}>
                {runningAll ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                {runningAll ? "执行中..." : "全部执行"}
              </button>
            </div>
          </div>
        </>} />
      <section className="work-panel">
        {initialLoading && filteredScripts.length === 0 ? (
          <div className="empty-state"><Loader2 size={20} className="animate-spin text-muted" /><p className="empty-state__hint">加载中...</p></div>
        ) : filteredScripts.length === 0 ? (
          <div className="empty-state">
            <p>{scripts.length === 0 ? "暂无脚本，请先在「自动化脚本」页面生成脚本" : "当前筛选条件下暂无脚本"}</p>
          </div>
        ) : (
          <DataTable rows={filteredScripts} getRowKey={(r) => r.id} columns={[
            { key: "select", label: <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />, width: "40px", sticky: "left" as const, render: (r) => <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleSelect(r.id)} /> },
            { key: "scriptCode", label: "脚本编号", render: (r) => r.scriptCode || <span className="text-muted">-</span> },
            { key: "testCase", label: "关联用例", align: "left", lineClamp: 2, render: (r) => getTestCaseTitle(r.testCaseId) },
            { key: "testType", label: "测试类型", align: "center", render: (r) => {
              const tc = testCases.find((t) => t.id === r.testCaseId);
              return tc ? (tc.testType || "功能测试") : <span className="text-muted">-</span>;
            }},
            { key: "targetPlatform", label: "测试端", align: "center", render: (r) => testCases.find((t) => t.id === r.testCaseId)?.targetPlatform || "-" },
            { key: "testUrl", label: "测试地址", align: "left", lineClamp: 2, render: (r) => testCases.find((t) => t.id === r.testCaseId)?.testUrl || "未配置" },
            { key: "requiredRole", label: "角色", align: "center", render: (r) => testCases.find((t) => t.id === r.testCaseId)?.requiredRole || "无" },
            { key: "framework", label: "框架", render: (r) => r.framework },
            { key: "scriptType", label: "脚本类型", render: (r) => r.scriptType },
            { key: "executionStatus", label: "执行状态", align: "center", width: "96px", render: (r) => {
              const status = getExecutionStatus(r);
              return <StatusPill tone={executionStatusTone(status)}>{status}</StatusPill>;
            }},
            { key: "status", label: "测试状态", align: "center", width: "96px", render: (r) => (
              <StatusPill tone={statusTone(r.status)}>
                {normalizeTestStatus(r.status)}
              </StatusPill>
            )},
            { key: "review", label: "评审", align: "center", render: (r) => {
              const rev = (r as any).reviewStatus || "待评审";
              return <StatusPill tone={rev === "已通过" ? "green" : "slate"}>{rev}</StatusPill>;
            }},
            { key: "validityStatus", label: "数据状态", align: "center", render: (r) => <span title={(r as any).invalidReason || ""}><StatusPill tone={(r as any).validityStatus === "已失效" ? "amber" : "green"}>{(r as any).validityStatus || "有效"}</StatusPill></span> },
            { key: "executedAt", label: "执行时间", render: (r) => r.executedAt ? formatTime(r.executedAt) : <span className="text-muted">-</span> },
            { key: "actions", label: "操作", width: "168px", sticky: "right" as const, align: "center", render: (r) => (
              <div className="inline-actions">
                <button className="text-button" type="button" onClick={() => handleRun(r)} disabled={runningAll || runningId === r.id}>
                  执行
                </button>
                <button className="text-button" type="button" onClick={() => handleVisualRun(r)} disabled={runningAll || runningId === r.id} title="弹出浏览器窗口并慢速执行">
                  可视化
                </button>
                <button className="text-button" type="button" onClick={() => openResultDetail(r)}>查看</button>
              </div>
            )},
          ]} />
        )}
      </section>

      {/* 执行结果查看弹窗 */}
      <Modal open={!!viewScript} onClose={() => setViewScript(null)} title="执行结果详情" width={860} height="85vh">
        {viewScript && (() => {
          const run = latestRun(viewScript);
          const tc = testCases.find((t) => t.id === viewScript.testCaseId);
          const tabs: { key: typeof resultTab; label: string }[] = [
            { key: "result", label: "执行结果" },
            { key: "info", label: "脚本信息" },
            { key: "code", label: "脚本代码" },
          ];
          return (
            <div className="panel-stack scroll-fill">
              <div className="result-tabs">
                <div className="result-tabs__inner">
                  {tabs.map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setResultTab(tab.key)}
                      className={resultTab === tab.key ? "result-tabs__button result-tabs__button--active" : "result-tabs__button"}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="scroll-fill">
                {resultTab === "info" && (
                  <div className="detail-grid">
                    <div className="detail-row"><span className="detail-label">脚本编号</span><span>{viewScript.scriptCode || "-"}</span></div>
                    <div className="detail-row"><span className="detail-label">关联用例</span><span>{getTestCaseTitle(viewScript.testCaseId)}</span></div>
                    <div className="detail-row"><span className="detail-label">框架</span><span>{viewScript.framework}</span></div>
                    <div className="detail-row"><span className="detail-label">语言</span><span>{viewScript.language}</span></div>
                    <div className="detail-row"><span className="detail-label">脚本类型</span><span>{viewScript.scriptType}</span></div>
                    <div className="detail-row"><span className="detail-label">测试类型</span><span>{tc?.testType || "功能测试"}</span></div>
                    <div className="detail-row"><span className="detail-label">测试端</span><span>{tc?.targetPlatform || "-"}</span></div>
                    <div className="detail-row"><span className="detail-label">所需角色</span><span>{tc?.requiredRole || "无"}</span></div>
                    <div className="detail-row detail-row--full"><span className="detail-label">测试地址</span><span className="text-anywhere">{tc?.testUrl || "未配置"}</span></div>
                  </div>
                )}

                {resultTab === "code" && (
                  <pre className="code-block code-block--tall">
                    {viewScript.code || "// 暂无代码"}
                  </pre>
                )}

                {resultTab === "result" && (
                  <div className="panel-stack">
                    <div className="detail-grid">
                      <div className="detail-row"><span className="detail-label">执行状态</span><StatusPill tone={executionStatusTone(getExecutionStatus(viewScript))}>{getExecutionStatus(viewScript)}</StatusPill></div>
                      <div className="detail-row"><span className="detail-label">测试状态</span><StatusPill tone={statusTone(run?.status || viewScript.status)}>{normalizeTestStatus(run?.status || viewScript.status)}</StatusPill></div>
                      <div className="detail-row"><span className="detail-label">开始时间</span><span>{run?.startedAt ? formatTime(run.startedAt) : "-"}</span></div>
                      <div className="detail-row"><span className="detail-label">结束时间</span><span>{run?.finishedAt ? formatTime(run.finishedAt) : (viewScript.executedAt ? formatTime(viewScript.executedAt) : "未执行")}</span></div>
                      <div className="detail-row"><span className="detail-label">执行记录</span><span>{run?.id || "暂无"}</span></div>
                    </div>

                    <div>
                      <h4 className="panel-title">标准输出</h4>
                      <pre className="code-block">
                        {run?.output?.trim() || "暂无 stdout 输出"}
                      </pre>
                    </div>

                    <div>
                      <h4 className={run?.error ? "panel-title text-red" : "panel-title"}>错误输出</h4>
                      <pre className={run?.error ? "code-block code-block--error" : "code-block code-block--muted"}>
                        {run?.error?.trim() || "暂无 stderr 输出"}
                      </pre>
                    </div>

                    <div>
                      <h4 className="panel-title">环境快照</h4>
                      <pre className="json-block">
                        {run?.environmentSnapshot || "暂无环境快照"}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}
