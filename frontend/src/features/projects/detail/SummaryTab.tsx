import { useMemo } from "react";
import { Loader2 } from "lucide-react";
import type { ApiTestCase } from "../../../api/client";
import { useProjectData } from "../useProjectData";
import { StatusPill } from "../../../shared/components/StatusPill";

// ═══════════════════════════════════════
// 测试汇总
// ═══════════════════════════════════════

export function SummaryTab({ projectId }: { projectId: string }) {
  const { files, testPoints, testCases, refresh, loading, initialLoading } = useProjectData(projectId);

  // 判断用例是否通过：实测结果与预期结果一致
  const isCasePassed = (c: ApiTestCase) => {
    if (!c.actualResult || !c.actualResult.trim()) return false;
    return c.actualResult.trim() === (c.expectedResult || "").trim();
  };
  const isCaseFailed = (c: ApiTestCase) => {
    if (!c.actualResult || !c.actualResult.trim()) return false;
    return c.actualResult.trim() !== (c.expectedResult || "").trim();
  };

  const total = testCases.length;
  const passed = testCases.filter(isCasePassed).length;
  const failed = testCases.filter(isCaseFailed).length;
  const unexecuted = testCases.filter((c) => !c.actualResult || !c.actualResult.trim()).length;
  const passRate = total > 0 ? Math.round(passed / total * 100) : 0;
  const isPass = passRate >= 80 && failed === 0;
  const autoCount = testCases.filter((c) => c.automation === "是").length;

  // 按模块统计
  const modules = useMemo(() => {
    const map = new Map<string, { total: number; passed: number; failed: number; unexecuted: number }>();
    testCases.forEach((c) => {
      const m = map.get(c.module) || { total: 0, passed: 0, failed: 0, unexecuted: 0 };
      m.total++;
      if (isCasePassed(c)) m.passed++;
      else if (isCaseFailed(c)) m.failed++;
      else m.unexecuted++;
      map.set(c.module, m);
    });
    return Array.from(map.entries()).map(([name, data]) => ({
      name, ...data,
      rate: data.total > 0 ? Math.round(data.passed / data.total * 100) : 0,
    }));
  }, [testCases]);

  // 按优先级统计
  const priorities = useMemo(() => {
    const map = new Map<string, { total: number; passed: number; failed: number }>();
    const order = ["P0", "P1", "P2", "P3"];
    testCases.forEach((c) => {
      const p = map.get(c.priority) || { total: 0, passed: 0, failed: 0 };
      p.total++;
      if (isCasePassed(c)) p.passed++;
      else if (isCaseFailed(c)) p.failed++;
      map.set(c.priority, p);
    });
    return Array.from(map.entries())
      .map(([name, data]) => ({ name, ...data, rate: data.total > 0 ? Math.round(data.passed / data.total * 100) : 0 }))
      .sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
  }, [testCases]);

  const toneForRate = (r: number) => r >= 80 ? "green" : r >= 50 ? "amber" : "red";

  return (
    <div className="page-stack page-stack--spaced page-stack--fill">
      {/* 测试结论 */}
      <div className={isPass ? "summary-result" : "summary-result summary-result--failed"}>
        <div className="summary-result__header">
          <StatusPill tone={isPass ? "green" : "red"}>{isPass ? "测试通过" : "测试未通过"}</StatusPill>
          <span className="summary-result__text">
            用例通过率 <strong>{passRate}%</strong>（{passed}/{total}）
            {!isPass && passRate < 80 && `，低于 80% 阈值`}
          </span>
        </div>
        {!isPass && <p className="summary-result__hint">存在 {failed} 条失败用例和 {unexecuted} 条未执行用例，建议排查后重新执行。</p>}
      </div>

      {/* 核心指标 */}
      <div className="dash-stats" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        {[
          { label: "用例总数", value: total },
          { label: "通过", value: passed, sub: `${passRate}%`, color: "var(--green)" },
          { label: "失败", value: failed, sub: failed > 0 ? "需排查" : "", color: "var(--red)" },
          { label: "未执行", value: unexecuted, sub: unexecuted > 0 ? "待执行" : "", color: "var(--amber)" },
        ].map((s) => <div className="dash-stat-card" key={s.label}><div className="dash-stat-body"><span className="dash-stat-label">{s.label}</span><strong className="dash-stat-value" style={s.color ? { color: s.color } : undefined}>{s.value}</strong>{s.sub && <span className="dash-stat-sub">{s.sub}</span>}</div></div>)}
      </div>

      {/* 模块通过率 + 优先级通过率 并排 */}
      <div className="panel-grid panel-grid--2">
        {/* 模块通过率 */}
        <section className="work-panel work-panel--column">
          <h3 className="panel-title">模块通过率</h3>
          {initialLoading && modules.length === 0 ? <div className="empty-state"><Loader2 size={20} className="animate-spin text-muted" /><p className="text-muted">加载中...</p></div> : modules.length === 0 ? <div className="empty-state"><p>暂无数据</p></div> : (
            <div className="ratio-list">
              {modules.map((m) => (
                <div className="ratio-row" key={m.name}>
                  <span className="ratio-row__name">{m.name}</span>
                  <div className="ratio-row__bar">
                    {m.total > 0 && (
                      <>
                        <div className="ratio-row__pass" style={{ width: `${(m.passed / m.total) * 100}%` }} />
                        <div className="ratio-row__fail" style={{ width: `${(m.failed / m.total) * 100}%` }} />
                      </>
                    )}
                  </div>
                  <span className="ratio-row__count">{m.passed}/{m.total}</span>
                  <StatusPill tone={toneForRate(m.rate)}>{m.rate}%</StatusPill>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 优先级通过率 */}
        <section className="work-panel work-panel--column">
          <h3 className="panel-title">优先级通过率</h3>
          {initialLoading && priorities.length === 0 ? <div className="empty-state"><Loader2 size={20} className="animate-spin text-muted" /><p className="text-muted">加载中...</p></div> : priorities.length === 0 ? <div className="empty-state"><p>暂无数据</p></div> : (
            <div className="ratio-list">
              {priorities.map((p) => (
                <div className="ratio-row" key={p.name}>
                  <span className="ratio-row__name">{p.name}</span>
                  <div className="ratio-row__bar">
                    {p.total > 0 && (
                      <>
                        <div className="ratio-row__pass" style={{ width: `${(p.passed / p.total) * 100}%` }} />
                        <div className="ratio-row__fail" style={{ width: `${(p.failed / p.total) * 100}%` }} />
                      </>
                    )}
                  </div>
                  <span className="ratio-row__count">{p.passed}/{p.total}</span>
                  <StatusPill tone={toneForRate(p.rate)}>{p.rate}%</StatusPill>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* 补充信息 */}
      <div className="dash-stats" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        {[
          { label: "测试点", value: testPoints.length, sub: `通过 ${testPoints.filter((tp) => tp.reviewStatus === "已通过").length}` },
          { label: "自动化用例", value: autoCount, sub: `覆盖率 ${total > 0 ? Math.round(autoCount / total * 100) : 0}%` },
          { label: "需求文档", value: files.length },
        ].map((s) => <div className="dash-stat-card" key={s.label}><div className="dash-stat-body"><span className="dash-stat-label">{s.label}</span><strong className="dash-stat-value">{s.value}</strong>{s.sub && <span className="dash-stat-sub">{s.sub}</span>}</div></div>)}
      </div>
    </div>
  );
}
