import { useState, useEffect, useCallback } from "react";
import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { MoreHorizontal, Plus, Server, Users } from "lucide-react";
import { environmentApi, type EnvironmentConfig, type TestAccount, type UISnapshot } from "../../api/environment.api";
import { Modal } from "../../shared/components/Modal";
import { SectionHeader } from "../../shared/components/SectionHeader";
import { DataTable } from "../../shared/components/DataTable";
import { ConfirmDialog } from "../../shared/components/ConfirmDialog";
import { MenuSelect } from "../../shared/components/MenuSelect";
import { toast } from "sonner";
import { EnvironmentAccountsModal } from "./EnvironmentAccountsModal";

function formatTime(iso: string | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function asArray<T = JsonRecord>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function textOf(value: unknown, fallback = "-"): string {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

interface Props {
  projectId: string;
}

export function EnvironmentPage({ projectId }: Props) {
  const [environments, setEnvironments] = useState<EnvironmentConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [uiSnapshots, setUiSnapshots] = useState<Record<string, UISnapshot | null>>({});
  const [recognizingId, setRecognizingId] = useState<string | null>(null);
  const [detailSnapshot, setDetailSnapshot] = useState<UISnapshot | null>(null);
  const [moreMenu, setMoreMenu] = useState<{ environmentId: string; top: number; left: number } | null>(null);

  // 环境配置弹窗
  const [showEnvModal, setShowEnvModal] = useState(false);
  const [editingEnv, setEditingEnv] = useState<EnvironmentConfig | null>(null);
  const [envForm, setEnvForm] = useState({
    name: "",
    environmentType: "Web" as "Web" | "APP",
    webUrl: "",
    appUrl: "",
    timeout: "30",
    retryCount: "3",
    captchaRequired: true,
    captchaCode: "",
    notes: "",
    isDefault: false,
  });

  // 测试账号弹窗
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<TestAccount | null>(null);
  const [currentEnvId, setCurrentEnvId] = useState("");
  const [accountManagerEnvId, setAccountManagerEnvId] = useState<string | null>(null);
  const [accountForm, setAccountForm] = useState({
    name: "",
    username: "",
    department: "",
    password: "",
    role: "",
  });

  // 删除确认
  const [deleteTarget, setDeleteTarget] = useState<{ type: "env" | "account"; id: string; name: string } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await environmentApi.list(projectId);
      setEnvironments(data);
      const entries = await Promise.all(data.map(async (environment) => {
        try {
          const snapshot = await environmentApi.getUISnapshot(environment.id);
          return [environment.id, "status" in snapshot ? snapshot : null] as const;
        } catch {
          return [environment.id, null] as const;
        }
      }));
      setUiSnapshots(Object.fromEntries(entries));
    } catch {
      toast.error("加载环境配置失败");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => {
    if (!moreMenu) return;
    const close = () => setMoreMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [moreMenu]);

  // 环境配置操作
  const handleSaveEnv = async () => {
    if (!envForm.name.trim()) { toast.warning("请输入环境名称"); return; }
    if (envForm.environmentType === "Web" && !envForm.webUrl.trim()) { toast.warning("请输入 Web 地址"); return; }
    if (envForm.environmentType === "APP" && !envForm.appUrl.trim()) { toast.warning("请输入 APP 地址"); return; }
    try {
      const payload = {
        ...envForm,
        webUrl: envForm.environmentType === "Web" ? envForm.webUrl : "",
        appUrl: envForm.environmentType === "APP" ? envForm.appUrl : "",
      };
      if (editingEnv) {
        await environmentApi.update(editingEnv.id, payload);
        toast.success("更新成功");
      } else {
        await environmentApi.create(projectId, payload);
        toast.success("创建成功");
      }
      setShowEnvModal(false);
      setEditingEnv(null);
      resetEnvForm();
      await loadData();
    } catch (err) { toast.error(err instanceof Error ? err.message : "保存失败"); }
  };

  const handleDeleteEnv = async () => {
    if (!deleteTarget || deleteTarget.type !== "env") return;
    try {
      await environmentApi.delete(deleteTarget.id);
      toast.success("删除成功");
      await loadData();
    } catch { toast.error("删除失败"); }
    setDeleteTarget(null);
  };

  const resetEnvForm = () => setEnvForm({ name: "", environmentType: "Web", webUrl: "", appUrl: "", timeout: "30", retryCount: "3", captchaRequired: true, captchaCode: "", notes: "", isDefault: false });

  const handleRecognizeUI = async (environment: EnvironmentConfig) => {
    if (environment.environmentType === "APP") { toast.warning("APP 环境暂不支持系统识别"); return; }
    if (!environment.webUrl) { toast.warning("请先配置 Web 地址"); return; }
    setRecognizingId(environment.id);
    try {
      const snapshot = await environmentApi.recognizeUI(environment.id);
      setUiSnapshots((prev) => ({ ...prev, [environment.id]: snapshot }));
      snapshot.status === "成功" ? toast.success("系统识别完成") : toast.error(snapshot.error || "系统识别失败");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "系统识别失败");
    } finally {
      setRecognizingId(null);
    }
  };

  const toggleMoreMenu = (environment: EnvironmentConfig, event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    setMoreMenu((current) => current?.environmentId === environment.id ? null : {
      environmentId: environment.id,
      top: rect.bottom + 6,
      left: Math.max(12, rect.right - 168),
    });
  };

  const runMoreAction = (action: () => void) => {
    setMoreMenu(null);
    action();
  };

  // 测试账号操作
  const handleSaveAccount = async () => {
    if (!accountForm.name.trim() || !accountForm.username.trim() || (!editingAccount && !accountForm.password.trim())) {
      toast.warning(editingAccount ? "请填写用户名和账号" : "请填写用户名、账号和密码");
      return;
    }
    try {
      if (editingAccount) {
        await environmentApi.updateAccount(editingAccount.id, accountForm);
        toast.success("更新成功");
      } else {
        await environmentApi.createAccount(currentEnvId, { ...accountForm, environmentId: currentEnvId });
        toast.success("创建成功");
      }
      setShowAccountModal(false);
      setEditingAccount(null);
      resetAccountForm();
      await loadData();
    } catch { toast.error("保存失败"); }
  };

  const handleDeleteAccount = async () => {
    if (!deleteTarget || deleteTarget.type !== "account") return;
    try {
      await environmentApi.deleteAccount(deleteTarget.id);
      toast.success("删除成功");
      await loadData();
    } catch { toast.error("删除失败"); }
    setDeleteTarget(null);
  };

  const resetAccountForm = () => setAccountForm({ name: "", username: "", department: "", password: "", role: "" });
  const accountManagerEnvironment = environments.find((environment) => environment.id === accountManagerEnvId) ?? null;

  const openCreateAccount = (environmentId: string) => {
    resetAccountForm();
    setEditingAccount(null);
    setCurrentEnvId(environmentId);
    setShowAccountModal(true);
  };

  const openEditAccount = (account: TestAccount) => {
    setAccountForm({ name: account.name, username: account.username, department: account.department || "", password: "", role: account.role });
    setEditingAccount(account);
    setCurrentEnvId(account.environmentId);
    setShowAccountModal(true);
  };

  return (
    <div className="page-stack page-stack--spaced page-stack--fill">
      <SectionHeader
        title="环境配置"
        description="配置测试环境地址和测试账号，用于生成测试用例和自动化脚本。"
        actions={
          <button className="primary-button" type="button" onClick={() => { resetEnvForm(); setEditingEnv(null); setShowEnvModal(true); }}>
            <Plus size={13} /> 新建环境
          </button>
        }
      />

      {loading ? (
        <div className="empty-state"><p>加载中...</p></div>
      ) : environments.length === 0 ? (
        <div className="empty-state">
          <Server size={48} style={{ color: "var(--muted)", marginBottom: 12 }} />
          <p>暂无环境配置</p>
          <p style={{ fontSize: 13, color: "var(--muted)" }}>点击上方按钮创建测试环境</p>
        </div>
      ) : (
        <section className="work-panel">
        <DataTable<EnvironmentConfig>
          rows={environments}
          getRowKey={(r) => r.id}
          columns={[
            { key: "name", label: "环境名称", width: "16%", align: "center", lineClamp: 2, render: (r) => <strong>{r.name}{r.isDefault ? `（默认${r.environmentType}）` : ""}</strong> },
            { key: "environmentType", label: "类型", width: "8%", align: "center", render: (r) => <span className="status-pill status-pill--blue">{r.environmentType}</span> },
            { key: "targetUrl", label: "测试入口", width: "26%", align: "left", lineClamp: 2, render: (r) => (r.environmentType === "APP" ? r.appUrl : r.webUrl) || <span style={{ color: "var(--muted)" }}>-</span> },
            { key: "accounts", label: "账号数量", width: "10%", align: "center", render: (r) => <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Users size={14} /> {r.accounts?.length || 0}</span> },
            { key: "captchaRequired", label: "验证码", width: "10%", align: "center", render: (r) => r.captchaRequired ? (r.captchaCode ? `固定 ${r.captchaCode}` : "需要") : (r.captchaCode ? `忽略/填 ${r.captchaCode}` : "不需要") },
            { key: "uiSnapshot", label: "系统识别", width: "12%", align: "center", render: (r) => {
              if (r.environmentType === "APP") return <span style={{ color: "var(--muted)" }}>暂未支持</span>;
              const snapshot = uiSnapshots[r.id];
              if (recognizingId === r.id) return <span style={{ color: "var(--blue)" }}>识别中...</span>;
              if (!snapshot) return <span style={{ color: "var(--muted)" }}>未识别</span>;
              return <span title={snapshot.summary || snapshot.error} style={{ color: snapshot.status === "成功" ? "var(--green)" : "var(--red)" }}>{snapshot.status}</span>;
            } },
            { key: "timeout", label: "超时", width: "8%", align: "center", render: (r) => `${r.timeout}s` },
            { key: "createdAt", label: "创建时间", width: "15%", align: "center", render: (r) => formatTime(r.createdAt) },
            { key: "actions", label: "操作", width: "128px", sticky: "right" as const, align: "center", render: (r) => (
              <div className="inline-actions">
                <button className="text-button" type="button" onClick={() => { setEnvForm({ name: r.name, environmentType: r.environmentType || (r.appUrl && !r.webUrl ? "APP" : "Web"), webUrl: r.webUrl, appUrl: r.appUrl, timeout: r.timeout, retryCount: r.retryCount, captchaRequired: r.captchaRequired, captchaCode: r.captchaCode || "", notes: r.notes, isDefault: r.isDefault }); setEditingEnv(r); setShowEnvModal(true); }}>
                  编辑
                </button>
                <button className="text-button text-button--danger" type="button" onClick={() => setDeleteTarget({ type: "env", id: r.id, name: r.name })}>
                  删除
                </button>
                <button className="text-button" type="button" onClick={(event) => toggleMoreMenu(r, event)} title="更多操作">
                  <MoreHorizontal size={15} />
                </button>
              </div>
            ) },
          ]}
        />
        </section>
      )}

      <EnvironmentMoreMenu
        environment={moreMenu ? environments.find((item) => item.id === moreMenu.environmentId) ?? null : null}
        snapshot={moreMenu ? uiSnapshots[moreMenu.environmentId] ?? null : null}
        recognizing={!!moreMenu && recognizingId === moreMenu.environmentId}
        position={moreMenu}
        onAccount={(environment) => runMoreAction(() => setAccountManagerEnvId(environment.id))}
        onRecognize={(environment) => runMoreAction(() => handleRecognizeUI(environment))}
        onViewResult={(snapshot) => runMoreAction(() => setDetailSnapshot(snapshot))}
      />

      <EnvironmentAccountsModal
        environment={accountManagerEnvironment}
        onClose={() => setAccountManagerEnvId(null)}
        onAdd={openCreateAccount}
        onEdit={openEditAccount}
        onDelete={(account) => setDeleteTarget({ type: "account", id: account.id, name: account.name })}
      />

      {/* 环境配置弹窗 */}
      <Modal
        open={showEnvModal}
        onClose={() => { setShowEnvModal(false); setEditingEnv(null); }}
        title={editingEnv ? "编辑环境" : "新建环境"}
        width={560}
        footer={<>
          <button className="ghost-button" type="button" onClick={() => { setShowEnvModal(false); setEditingEnv(null); }}>取消</button>
          <button className="primary-button" type="button" onClick={handleSaveEnv}>保存</button>
        </>}
      >
        <div className="form-stack">
          <div className="form-row">
            <label className="form-label">
              <span className="form-label-text">环境名称 <span className="form-required" aria-hidden="true">*</span></span>
              <input className="form-input" required aria-required="true" value={envForm.name} onChange={(e) => setEnvForm({ ...envForm, name: e.target.value })} placeholder="如：测试环境、预发环境" />
            </label>
          </div>
          <div className="form-row">
            <label className="form-label">环境类型
              <MenuSelect
                value={envForm.environmentType}
                options={[
                  { value: "Web", label: "Web 环境" },
                  { value: "APP", label: "APP 环境" },
                ]}
                onChange={(environmentType) => {
                  setEnvForm({
                    ...envForm,
                    environmentType,
                    webUrl: environmentType === "Web" ? envForm.webUrl : "",
                    appUrl: environmentType === "APP" ? envForm.appUrl : "",
                  });
                }}
              />
            </label>
          </div>
          <div className="form-row">
            {envForm.environmentType === "Web" ? (
              <label className="form-label">Web 地址
                <input className="form-input" value={envForm.webUrl} onChange={(e) => setEnvForm({ ...envForm, webUrl: e.target.value })} placeholder="https://test.example.com" />
              </label>
            ) : (
              <label className="form-label">APP 地址
                <input className="form-input" value={envForm.appUrl} onChange={(e) => setEnvForm({ ...envForm, appUrl: e.target.value })} placeholder="如：移动端测试入口、安装包地址或 Appium 启动地址" />
              </label>
            )}
          </div>
          <div className="form-row">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <label className="form-label" style={{ gridAutoFlow: "column", justifyContent: "start", alignItems: "center", gap: 8 }}>
                <input type="checkbox" checked={envForm.isDefault} onChange={(e) => setEnvForm({ ...envForm, isDefault: e.target.checked })} />
                设为默认{envForm.environmentType}测试环境
              </label>
              <label className="form-label" style={{ gridAutoFlow: "column", justifyContent: "start", alignItems: "center", gap: 8 }}>
                <input type="checkbox" checked={envForm.captchaRequired} onChange={(e) => setEnvForm({ ...envForm, captchaRequired: e.target.checked })} />
                登录/认证需要验证码
              </label>
            </div>
          </div>
          <div className="form-row">
            <label className="form-label">固定验证码/占位值
              <input className="form-input" value={envForm.captchaCode} onChange={(e) => setEnvForm({ ...envForm, captchaCode: e.target.value })} placeholder="如：0000；无固定值可留空" />
            </label>
          </div>
          <div className="form-row">
            <div style={{ display: "flex", gap: 16 }}>
              <label className="form-label" style={{ flex: 1 }}>超时时间(秒)
                <input className="form-input" type="number" value={envForm.timeout} onChange={(e) => setEnvForm({ ...envForm, timeout: e.target.value })} />
              </label>
              <label className="form-label" style={{ flex: 1 }}>重试次数
                <input className="form-input" type="number" value={envForm.retryCount} onChange={(e) => setEnvForm({ ...envForm, retryCount: e.target.value })} />
              </label>
            </div>
          </div>
          <div className="form-row">
            <label className="form-label">环境说明
              <textarea className="form-textarea" rows={2} value={envForm.notes} onChange={(e) => setEnvForm({ ...envForm, notes: e.target.value })} placeholder="如：访问限制、数据重置时间、登录特殊规则、版本说明" />
            </label>
          </div>
        </div>
      </Modal>

      {/* 测试账号弹窗 */}
      <Modal
        open={showAccountModal}
        onClose={() => { setShowAccountModal(false); setEditingAccount(null); }}
        title={editingAccount ? "编辑账号" : "添加账号"}
        width={480}
        footer={<>
          <button className="ghost-button" type="button" onClick={() => { setShowAccountModal(false); setEditingAccount(null); }}>取消</button>
          <button className="primary-button" type="button" onClick={handleSaveAccount}>保存</button>
        </>}
      >
        <div className="form-stack">
          <div className="form-row">
            <label className="form-label">部门
              <input className="form-input" value={accountForm.department} onChange={(e) => setAccountForm({ ...accountForm, department: e.target.value })} placeholder="如：质量部、研发一组" />
            </label>
          </div>
          <div className="form-row">
            <label className="form-label">
              <span className="form-label-text">用户名 <span className="form-required" aria-hidden="true">*</span></span>
              <input className="form-input" required aria-required="true" value={accountForm.name} onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })} placeholder="姓名、简称代号等" />
            </label>
          </div>
          <div className="form-row">
            <label className="form-label">
              <span className="form-label-text">账号 <span className="form-required" aria-hidden="true">*</span></span>
              <input className="form-input" required aria-required="true" value={accountForm.username} onChange={(e) => setAccountForm({ ...accountForm, username: e.target.value })} placeholder="登录账号、手机号或邮箱" />
            </label>
          </div>
          <div className="form-row">
            <label className="form-label">
              <span className="form-label-text">密码 {!editingAccount && <span className="form-required" aria-hidden="true">*</span>}</span>
              <input className="form-input" type="password" required={!editingAccount} aria-required={!editingAccount} value={accountForm.password} onChange={(e) => setAccountForm({ ...accountForm, password: e.target.value })} placeholder={editingAccount ? "留空表示不修改密码" : "密码"} />
            </label>
          </div>
          <div className="form-row">
            <label className="form-label">角色/权限
              <input className="form-input" value={accountForm.role} onChange={(e) => setAccountForm({ ...accountForm, role: e.target.value })} placeholder="如：管理员、普通用户" />
            </label>
          </div>
        </div>
      </Modal>

      <RecognitionDetailModal
        snapshot={detailSnapshot}
        onClose={() => setDetailSnapshot(null)}
      />

      {/* 删除确认 */}
      <ConfirmDialog
        open={!!deleteTarget}
        title={`删除${deleteTarget?.type === "env" ? "环境" : "账号"}`}
        message={`确定要删除「${deleteTarget?.name}」吗？${deleteTarget?.type === "env" ? "该操作会同时删除所有关联的测试账号。" : ""}`}
        confirmLabel="删除"
        onConfirm={deleteTarget?.type === "env" ? handleDeleteEnv : handleDeleteAccount}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function RecognitionDetailModal({ snapshot, onClose }: { snapshot: UISnapshot | null; onClose: () => void }) {
  const root = asRecord(snapshot?.snapshot);
  const trace = asArray<JsonRecord>(root.recognitionTrace);
  const loginPage = asRecord(root.loginPage);
  const appPage = asRecord(root.appPage);
  const loginResult = asRecord(root.loginResult);
  const aiAnalysis = asRecord(root.aiAnalysis);
  const scope = asRecord(root.scope);
  const pageObjects = asArray<JsonRecord>(aiAnalysis.pageObjects);
  const relevantModules = asArray<JsonRecord>(aiAnalysis.relevantModules);
  const navigationPlan = asArray<JsonRecord>(aiAnalysis.navigationPlan);
  const unresolvedQuestions = asArray<unknown>(aiAnalysis.unresolvedQuestions);
  const scriptGuidance = asArray<unknown>(aiAnalysis.scriptGuidance);
  const loginInputs = asArray<JsonRecord>(loginPage.inputs);
  const appMenus = asArray<JsonRecord>(appPage.menus);
  const appButtons = asArray<JsonRecord>(appPage.buttons);
  const appTables = asArray<JsonRecord>(appPage.tables);

  return (
    <Modal open={!!snapshot} onClose={onClose} title="系统识别详情" width={920} footer={<button className="primary-button" type="button" onClick={onClose}>关闭</button>}>
      {!snapshot ? null : (
        <div className="page-stack" style={{ gap: 16 }}>
          <section className="work-panel" style={{ padding: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
              <DetailMetric label="状态" value={snapshot.status} tone={snapshot.status === "成功" ? "green" : "red"} />
              <DetailMetric label="识别模式" value={textOf(scope.mode ?? aiAnalysis.scopeMode, "full")} />
              <DetailMetric label="入口页面" value={textOf(loginPage.title)} />
              <DetailMetric label="当前页面" value={textOf(appPage.title)} />
            </div>
            <p style={{ margin: "12px 0 0", color: snapshot.status === "成功" ? "var(--muted)" : "var(--red)", lineHeight: 1.6 }}>
              {snapshot.summary || snapshot.error || "暂无摘要"}
            </p>
          </section>

          <DetailSection title="识别过程">
            {trace.length === 0 ? <EmptyLine text="暂无过程日志。请重新执行一次识别以生成过程详情。" /> : (
              <div style={{ display: "grid", gap: 8 }}>
                {trace.map((item, index) => (
                  <div key={`${textOf(item.step)}-${index}`} style={{ display: "grid", gridTemplateColumns: "32px 110px 90px 1fr", gap: 10, alignItems: "start", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface)" }}>
                    <span style={{ color: "var(--muted)" }}>{index + 1}</span>
                    <code style={{ fontSize: 12 }}>{textOf(item.step)}</code>
                    <StatusText status={textOf(item.status)} />
                    <div>
                      <div style={{ lineHeight: 1.5 }}>{textOf(item.message)}</div>
                      {item.url ? <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{textOf(item.url)}</div> : null}
                      {Object.keys(asRecord(item.data)).length > 0 ? <pre style={miniPreStyle}>{JSON.stringify(item.data, null, 2)}</pre> : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </DetailSection>

          <DetailSection title="登录识别">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
              <DetailMetric label="是否尝试登录" value={textOf(loginResult.attempted)} />
              <DetailMetric label="是否登录成功" value={textOf(loginResult.success)} tone={loginResult.success ? "green" : "red"} />
              <DetailMetric label="账号角色" value={textOf(loginResult.accountRole)} />
            </div>
            <ListBlock title="入口页输入框" items={loginInputs.map((item) => `${textOf(item.placeholder, "无 placeholder")} / ${textOf(item.type, "text")} / ${item.visible ? "可见" : "不可见"}`)} />
          </DetailSection>

          <DetailSection title="AI 识别结果">
            <ListBlock title="相关模块" items={relevantModules.map((item) => `${textOf(item.name)}：${textOf(item.reason, "无说明")}（置信度 ${textOf(item.confidence, "0")}）`)} />
            <ListBlock title="导航计划" items={navigationPlan.map((item) => `${textOf(item.fromPage)} → ${textOf(item.toPage)}：${asArray<unknown>(item.steps).map((step) => textOf(step)).join(" / ")}`)} />
            <div style={{ display: "grid", gap: 10 }}>
              {pageObjects.length === 0 ? <EmptyLine text="暂无页面对象。可能是 AI 未配置、识别失败，或当前只完成了规则采集。" /> : pageObjects.map((page, index) => {
                const elements = asArray<JsonRecord>(page.elements);
                return (
                  <div key={`${textOf(page.pageName)}-${index}`} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 10 }}>
                    <div style={{ fontWeight: 700 }}>{textOf(page.pageName)}</div>
                    <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>{asArray<unknown>(page.routeOrMenuPath).map((item) => textOf(item)).join(" / ") || textOf(page.purpose)}</div>
                    <ListBlock title="元素" compact items={elements.map((element) => `${textOf(element.name)} [${textOf(element.type)}] ${textOf(element.selector, "无稳定定位")} - ${textOf(element.evidence, "无证据")}`)} />
                  </div>
                );
              })}
            </div>
          </DetailSection>

          <DetailSection title="规则采集结果">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
              <DetailMetric label="菜单数" value={String(appMenus.length)} />
              <DetailMetric label="按钮数" value={String(appButtons.length)} />
              <DetailMetric label="表格数" value={String(appTables.length)} />
            </div>
            <ListBlock title="菜单" items={appMenus.slice(0, 20).map((item) => `${textOf(item.title)} ${textOf(item.selectorHint, "")}`)} />
            <ListBlock title="表格" items={appTables.map((item) => `列：${asArray<unknown>(item.columns).map((column) => textOf(column)).join(" / ") || "未识别到表头"}`)} />
          </DetailSection>

          <DetailSection title="问题与建议">
            <ListBlock title="未解决问题" items={unresolvedQuestions.map((item) => textOf(item))} emptyText="暂无未解决问题" />
            <ListBlock title="脚本生成建议" items={scriptGuidance.map((item) => textOf(item))} emptyText="暂无建议" />
            {snapshot.error ? <pre style={errorPreStyle}>{snapshot.error}</pre> : null}
          </DetailSection>

          <DetailSection title="原始 JSON">
            <pre style={jsonPreStyle}>{JSON.stringify(root, null, 2)}</pre>
          </DetailSection>
        </div>
      )}
    </Modal>
  );
}

function EnvironmentMoreMenu({
  environment,
  snapshot,
  recognizing,
  position,
  onAccount,
  onRecognize,
  onViewResult,
}: {
  environment: EnvironmentConfig | null;
  snapshot: UISnapshot | null;
  recognizing: boolean;
  position: { top: number; left: number } | null;
  onAccount: (environment: EnvironmentConfig) => void;
  onRecognize: (environment: EnvironmentConfig) => void;
  onViewResult: (snapshot: UISnapshot) => void;
}) {
  if (!environment || !position) return null;
  const isApp = environment.environmentType === "APP";
  const canRecognize = !isApp && !recognizing;
  const recognizeLabel = snapshot ? "重新识别" : "识别系统";
  const resultLabel = snapshot?.status === "成功" ? "查看结果" : "查看问题";

  return (
    <div
      className="environment-more-menu"
      style={{ top: position.top, left: position.left }}
      onClick={(event) => event.stopPropagation()}
    >
      <button className="environment-more-menu__item" type="button" onClick={() => onAccount(environment)}>
        账号管理
      </button>
      <button
        className="environment-more-menu__item"
        type="button"
        disabled={!canRecognize}
        title={isApp ? "APP 环境暂不支持系统识别" : recognizing ? "识别中" : undefined}
        onClick={() => canRecognize && onRecognize(environment)}
      >
        {isApp ? "识别系统（暂未支持）" : recognizing ? "识别中..." : recognizeLabel}
      </button>
      {snapshot ? (
        <button className="environment-more-menu__item" type="button" onClick={() => onViewResult(snapshot)}>
          {resultLabel}
        </button>
      ) : null}
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="work-panel" style={{ padding: 14 }}>
      <h3 style={{ fontSize: 15, margin: "0 0 12px" }}>{title}</h3>
      {children}
    </section>
  );
}

function DetailMetric({ label, value, tone }: { label: string; value: string; tone?: "green" | "red" }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 10, minWidth: 0 }}>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontWeight: 700, color: tone === "green" ? "var(--green)" : tone === "red" ? "var(--red)" : "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</div>
    </div>
  );
}

function StatusText({ status }: { status: string }) {
  const color = status === "success" ? "var(--green)" : status === "failed" ? "var(--red)" : status === "skipped" ? "var(--muted)" : "var(--blue)";
  const text = status === "success" ? "成功" : status === "failed" ? "失败" : status === "skipped" ? "跳过" : status === "running" ? "执行中" : status;
  return <span style={{ color, fontWeight: 700 }}>{text}</span>;
}

function ListBlock({ title, items, emptyText = "暂无数据", compact = false }: { title: string; items: string[]; emptyText?: string; compact?: boolean }) {
  return (
    <div style={{ marginTop: compact ? 8 : 12 }}>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>{title}</div>
      {items.length === 0 ? <EmptyLine text={emptyText} /> : (
        <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
          {items.map((item, index) => <li key={`${item}-${index}`} style={{ lineHeight: 1.5 }}>{item}</li>)}
        </ul>
      )}
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <div style={{ color: "var(--muted)", fontSize: 13 }}>{text}</div>;
}

const miniPreStyle: CSSProperties = {
  margin: "6px 0 0",
  padding: 8,
  borderRadius: 8,
  background: "var(--background)",
  overflow: "auto",
  fontSize: 12,
};

const jsonPreStyle: CSSProperties = {
  margin: 0,
  maxHeight: 360,
  overflow: "auto",
  padding: 12,
  borderRadius: 10,
  background: "var(--background)",
  fontSize: 12,
};

const errorPreStyle: CSSProperties = {
  ...jsonPreStyle,
  color: "var(--red)",
  whiteSpace: "pre-wrap",
};
