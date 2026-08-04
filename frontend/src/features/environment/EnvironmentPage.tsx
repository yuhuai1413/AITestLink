import { useState, useEffect, useCallback } from "react";
import type { MouseEvent, ReactNode } from "react";
import { MoreHorizontal, Plus, Server, Users } from "lucide-react";
import { environmentApi, type EnvironmentConfig, type TestAccount, type UISnapshot } from "../../api/environment.api";
import { Modal } from "../../shared/components/Modal";
import { SectionHeader } from "../../shared/components/SectionHeader";
import { DataTable } from "../../shared/components/DataTable";
import { ConfirmDialog } from "../../shared/components/ConfirmDialog";
import { MenuSelect } from "../../shared/components/MenuSelect";
import { StatusPill } from "../../shared/components/StatusPill";
import { toast } from "sonner";
import { EnvironmentAccountsModal } from "./EnvironmentAccountsModal";
import { formatDateTime } from "../../shared/utils/dateTime";
import { useStore } from "../../app/store";
import { startRecognizeUI, getRecognizingEnvId } from "../../shared/hooks/aiTaskManager";

function formatTime(iso: string | undefined): string {
  return formatDateTime(iso);
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

function compactText(value: unknown, fallback = "-"): string {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((item) => compactText(item, "")).filter(Boolean).join(" / ") || fallback;
  if (value && typeof value === "object") {
    try { return JSON.stringify(value); } catch { return fallback; }
  }
  return fallback;
}

function hasMeaningfulText(value: unknown): boolean {
  return typeof value === "string" && value.trim() !== "" && value.trim() !== "-";
}

function visibleTextField(item: JsonRecord, keys: string[]): string {
  for (const key of keys) {
    const value = item[key];
    if (hasMeaningfulText(value)) return String(value).trim();
  }
  return "";
}

function isVisible(item: JsonRecord): boolean {
  return item.visible !== false;
}

function meaningfulLoginInput(item: JsonRecord): boolean {
  return isVisible(item) && (hasMeaningfulText(item.placeholder) || hasMeaningfulText(item.name) || hasMeaningfulText(item.id) || hasMeaningfulText(item.type));
}

function meaningfulButton(item: JsonRecord): boolean {
  const text = visibleTextField(item, ["text", "name", "ariaLabel", "title"]);
  if (!text || !isVisible(item)) return false;
  return !/^el-carousel|carousel|swiper|轮播/.test(String(item.className || "").toLowerCase());
}

function meaningfulMenu(item: JsonRecord): boolean {
  return hasMeaningfulText(item.title) || hasMeaningfulText(item.text) || hasMeaningfulText(item.name);
}

function meaningfulTable(item: JsonRecord): boolean {
  return asArray(item.columns).some((column) => hasMeaningfulText(column));
}

function meaningfulPageObject(page: JsonRecord): boolean {
  return hasMeaningfulText(page.pageName) || asArray(page.elements).length > 0 || asArray(page.routeOrMenuPath).length > 0;
}

function meaningfulElement(element: JsonRecord): boolean {
  return hasMeaningfulText(element.name) || hasMeaningfulText(element.selector) || hasMeaningfulText(element.evidence);
}

interface Props {
  projectId: string;
}

export function EnvironmentPage({ projectId }: Props) {
  const { state } = useStore();
  const [environments, setEnvironments] = useState<EnvironmentConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [uiSnapshots, setUiSnapshots] = useState<Record<string, UISnapshot | null>>({});
  const [detailSnapshot, setDetailSnapshot] = useState<UISnapshot | null>(null);
  const [moreMenu, setMoreMenu] = useState<{ environmentId: string; top: number; left: number } | null>(null);

  // 系统识别状态来自全局 store，切换页面不丢失
  const recognizing = state.activeAITasks.includes(`${projectId}:系统识别`);

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
    isAdmin: false,
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

  // 系统识别完成后（后台任务结束）刷新对应环境的 snapshot
  useEffect(() => {
    const handler = async (event: Event) => {
      const detail = (event as CustomEvent).detail as { environmentId?: string } | undefined;
      const envId = detail?.environmentId;
      if (!envId) return;
      try {
        const snapshot = await environmentApi.getUISnapshot(envId);
        setUiSnapshots((prev) => ({ ...prev, [envId]: "status" in snapshot ? snapshot : null }));
      } catch { /* ignore */ }
    };
    window.addEventListener("aitestlink:ui-snapshot-refresh", handler);
    return () => window.removeEventListener("aitestlink:ui-snapshot-refresh", handler);
  }, []);
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
    // 走统一异步任务管理器：状态存全局 store，切换页面不丢失
    await startRecognizeUI(projectId, environment.id);
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

  const resetAccountForm = () => setAccountForm({ name: "", username: "", department: "", password: "", role: "", isAdmin: false });
  const accountManagerEnvironment = environments.find((environment) => environment.id === accountManagerEnvId) ?? null;

  const openCreateAccount = (environmentId: string) => {
    resetAccountForm();
    setEditingAccount(null);
    setCurrentEnvId(environmentId);
    setShowAccountModal(true);
  };

  const openEditAccount = (account: TestAccount) => {
    setAccountForm({ name: account.name, username: account.username, department: account.department || "", password: "", role: account.role, isAdmin: !!account.isAdmin });
    setEditingAccount(account);
    setCurrentEnvId(account.environmentId);
    setShowAccountModal(true);
  };

  // 切换识别账号：同一环境只能有一个识别账号。开启当前账号时，先把同环境其他识别账号关掉。
  const handleToggleAdmin = async (account: TestAccount) => {
    try {
      const env = environments.find((e) => e.id === account.environmentId);
      const siblings = env?.accounts ?? [];
      // 关闭已是识别账号的兄弟账号（识别账号只能有一个）
      await Promise.all(
        siblings
          .filter((a) => a.id !== account.id && a.isAdmin)
          .map((a) => environmentApi.updateAccount(a.id, { isAdmin: false })),
      );
      // 切换当前账号
      await environmentApi.updateAccount(account.id, { isAdmin: !account.isAdmin });
      await loadData();
    } catch (err) {
      toast.error("切换识别账号失败，请重试");
      console.error("toggle recognition account failed:", err);
    }
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
          <Server size={48} className="empty-state__icon" />
          <p>暂无环境配置</p>
          <p className="empty-state__hint">点击上方按钮创建测试环境</p>
        </div>
      ) : (
        <section className="work-panel">
        <DataTable<EnvironmentConfig>
          rows={environments}
          getRowKey={(r) => r.id}
          columns={[
            { key: "name", label: "环境名称", width: "16%", align: "center", lineClamp: 3, render: (r) => <strong>{r.name}{r.isDefault ? `（默认${r.environmentType}）` : ""}</strong> },
            { key: "environmentType", label: "类型", width: "8%", align: "center", render: (r) => <StatusPill tone="blue">{r.environmentType}</StatusPill> },
            { key: "targetUrl", label: "测试入口", width: "26%", align: "left", lineClamp: 3, render: (r) => (r.environmentType === "APP" ? r.appUrl : r.webUrl) || <span className="text-muted">-</span> },
            { key: "accounts", label: "账号数量", width: "10%", align: "center", render: (r) => <span className="inline-icon-text"><Users size={14} /> {r.accounts?.length || 0}</span> },
            { key: "captchaRequired", label: "验证码", width: "10%", align: "center", render: (r) => r.captchaRequired ? (r.captchaCode ? `固定 ${r.captchaCode}` : "需要") : (r.captchaCode ? `忽略/填 ${r.captchaCode}` : "不需要") },
            { key: "uiSnapshot", label: "系统识别", width: "12%", align: "center", render: (r) => {
              if (r.environmentType === "APP") return <span className="text-muted">暂未支持</span>;
              const snapshot = uiSnapshots[r.id];
              if (recognizing && getRecognizingEnvId(projectId) === r.id) return <span className="text-blue">识别中...</span>;
              if (!snapshot) return <span className="text-muted">未识别</span>;
              return <span className={snapshot.status === "成功" ? "text-green" : "text-red"} title={snapshot.summary || snapshot.error}>{snapshot.status}</span>;
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
        recognizing={!!moreMenu && recognizing && getRecognizingEnvId(projectId) === moreMenu.environmentId}
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
        onToggleAdmin={handleToggleAdmin}
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
            <div className="form-check-grid">
              <label className="form-check-label">
                <input type="checkbox" checked={envForm.isDefault} onChange={(e) => setEnvForm({ ...envForm, isDefault: e.target.checked })} />
                设为默认{envForm.environmentType}测试环境
              </label>
              <label className="form-check-label">
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
          <div className="form-row form-row--2">
              <label className="form-label">超时时间(秒)
                <input className="form-input" type="number" value={envForm.timeout} onChange={(e) => setEnvForm({ ...envForm, timeout: e.target.value })} />
              </label>
              <label className="form-label">重试次数
                <input className="form-input" type="number" value={envForm.retryCount} onChange={(e) => setEnvForm({ ...envForm, retryCount: e.target.value })} />
              </label>
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
  const [activeTab, setActiveTab] = useState<"basic" | "result" | "trace" | "raw">("basic");
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
  const loginButtons = asArray<JsonRecord>(loginPage.buttons);
  const loginUrl = textOf(loginPage.url);
  const appUrl = textOf(appPage.url);
  const effectiveLoginInputs = loginInputs.filter(meaningfulLoginInput);
  const effectiveLoginButtons = loginButtons.filter(meaningfulButton);
  const effectiveMenus = appMenus.filter(meaningfulMenu);
  const effectiveButtons = appButtons.filter(meaningfulButton);
  const effectiveTables = appTables.filter(meaningfulTable);
  const effectivePageObjects = pageObjects.filter(meaningfulPageObject);
  const screenshots = asArray<JsonRecord>(root.screenshots);
  const countMenuTotal = (nodes: JsonRecord[]): number => nodes.reduce((sum, n) => sum + 1 + countMenuTotal(asArray<JsonRecord>(n.menus ?? n.children)), 0);
  const menuTotal = countMenuTotal(appMenus);

  useEffect(() => {
    if (snapshot) setActiveTab("basic");
  }, [snapshot?.id]);

  return (
    <Modal open={!!snapshot} onClose={onClose} title="系统识别详情" width={760} height="84vh" bodyOverflow="hidden" footer={<button className="primary-button" type="button" onClick={onClose}>关闭</button>}>
      {!snapshot ? null : (
        <div className="recognition-modal-layout">
          <div className="result-tabs recognition-tabs">
            <div className="result-tabs__inner">
              <button className={`result-tabs__button${activeTab === "basic" ? " result-tabs__button--active" : ""}`} type="button" onClick={() => setActiveTab("basic")}>基本信息</button>
              <button className={`result-tabs__button${activeTab === "result" ? " result-tabs__button--active" : ""}`} type="button" onClick={() => setActiveTab("result")}>识别结果</button>
              <button className={`result-tabs__button${activeTab === "trace" ? " result-tabs__button--active" : ""}`} type="button" onClick={() => setActiveTab("trace")}>过程日志</button>
              <button className={`result-tabs__button${activeTab === "raw" ? " result-tabs__button--active" : ""}`} type="button" onClick={() => setActiveTab("raw")}>原始数据</button>
            </div>
          </div>

          <div className="scroll-fill recognition-modal-scroll">
            {activeTab === "basic" ? (
              <div className="panel-stack">
                <div className="detail-grid">
                  <div className="detail-row"><span className="detail-label">识别状态</span><StatusPill tone={snapshot.status === "成功" ? "green" : "red"}>{snapshot.status || "-"}</StatusPill></div>
                  <div className="detail-row"><span className="detail-label">开始时间</span><span>{snapshot.createdAt ? formatTime(snapshot.createdAt) : "-"}</span></div>
                  <div className="detail-row"><span className="detail-label">完成时间</span><span>{snapshot.updatedAt ? formatTime(snapshot.updatedAt) : "-"}</span></div>
                  <div className="detail-row"><span className="detail-label">识别范围</span><span>{(() => { const m = textOf(scope.mode ?? aiAnalysis.scopeMode, "full"); return m === "incremental" ? "增量识别（仅识别需求相关模块）" : "全量识别（识别整个系统）"; })()}</span></div>
                  <div className="detail-row detail-row--full"><span className="detail-label">识别摘要</span><pre className={`detail-pre${snapshot.status === "成功" ? "" : " text-red"}`}>{snapshot.summary || snapshot.error || "暂无摘要"}</pre></div>
                  <div className="detail-row"><span className="detail-label">入口页面</span><span>{textOf(loginPage.title)}</span></div>
                  <div className="detail-row"><span className="detail-label">登录后页面</span><span>{textOf(appPage.title)}</span></div>
                  <div className="detail-row detail-row--full"><span className="detail-label">入口地址</span><span className="text-anywhere">{loginUrl}</span></div>
                  <div className="detail-row detail-row--full"><span className="detail-label">当前地址</span><span className="text-anywhere">{appUrl}</span></div>
                  <div className="detail-row"><span className="detail-label">尝试登录</span><span>{textOf(loginResult.attempted)}</span></div>
                  <div className="detail-row"><span className="detail-label">登录结果</span><StatusPill tone={loginResult.success ? "green" : "red"}>{loginResult.success ? "成功" : "失败/未确认"}</StatusPill></div>
                  <div className="detail-row"><span className="detail-label">账号角色</span><span>{textOf(loginResult.accountRole)}</span></div>
                  <div className="detail-row"><span className="detail-label">有效采集</span><span>菜单 {menuTotal} 个（{effectiveMenus.length} 根）/ 按钮 {effectiveButtons.length} / 表格 {effectiveTables.length}</span></div>
                </div>

                {screenshots.length > 0 ? (
                  <DetailSection title="识别过程截图">
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {screenshots.map((shot, idx) => {
                        const url = textOf(shot.url);
                        const label = textOf(shot.label) || textOf(shot.step) || `截图 ${idx + 1}`;
                        return url ? (
                          <div key={idx}>
                            <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 4 }}>{label}</div>
                            <a href={url} target="_blank" rel="noreferrer">
                              <img src={url} alt={label} style={{ width: "100%", borderRadius: 6, border: "1px solid var(--border-color, #e5e7eb)", cursor: "zoom-in", display: "block" }} />
                            </a>
                          </div>
                        ) : null;
                      })}
                    </div>
                  </DetailSection>
                ) : null}

                <DetailSection title="登录页字段">
                  <ListBlock
                    title="输入框"
                    items={effectiveLoginInputs.map((item) => `${visibleTextField(item, ["placeholder", "name", "id"]) || "无字段名"} / ${textOf(item.type, "text")}`)}
                    emptyText="未识别到可用输入框"
                  />
                  <ListBlock
                    title="按钮"
                    items={effectiveLoginButtons.map((item) => visibleTextField(item, ["text", "name", "ariaLabel", "title"]))}
                    emptyText="未识别到可用按钮"
                  />
                </DetailSection>
              </div>
            ) : null}

            {activeTab === "result" ? (
              <div className="panel-stack">
                <DetailSection title="AI 结构化识别">
                  {effectivePageObjects.length === 0 && relevantModules.length === 0 && navigationPlan.length === 0 ? (
                    <EmptyLine text="本次 AI 结构化识别未产出有效数据（规则采集结果仍可用）。可检查模型配置中的「系统识别」节点后重新识别。" />
                  ) : (
                    <>
                      <ListBlock title="相关模块" items={relevantModules.map((item) => `${textOf(item.name)}：${textOf(item.reason, "无说明")}`)} emptyText="暂无相关模块" />
                      <ListBlock title="导航计划" items={navigationPlan.map((item) => `${textOf(item.fromPage)} → ${textOf(item.toPage)}：${asArray<unknown>(item.steps).map((step) => compactText(step, "")).filter(Boolean).join(" / ") || "无步骤"}`)} emptyText="暂无导航计划" />
                      <div className="recognition-card-list">
                        {effectivePageObjects.map((page, index) => {
                          const elements = asArray<JsonRecord>(page.elements).filter(meaningfulElement);
                          return (
                            <div className="detail-card recognition-page-card" key={`${textOf(page.pageName)}-${index}`}>
                              <div className="detail-card__value">{textOf(page.pageName)}</div>
                              <div className="trace-row__url">{asArray<unknown>(page.routeOrMenuPath).map((p) => compactText(p, "")).filter(Boolean).join(" / ") || textOf(page.purpose)}</div>
                              <ListBlock title="元素" compact items={elements.map((element) => `${textOf(element.name)} [${textOf(element.type)}] ${textOf(element.selector, "无稳定定位")}`)} emptyText="暂无元素" />
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </DetailSection>

                <DetailSection title="规则采集结果">
                  <div className="recognition-menu-tree">
                    <div className="recognition-menu-tree__head">系统菜单（共 {menuTotal} 个，{effectiveMenus.length} 个一级菜单）</div>
                    {effectiveMenus.length === 0 ? <EmptyLine text="未采集到有效菜单" /> : (
                      <ul className="menu-tree-list">
                        {effectiveMenus.map((node, idx) => renderMenuNode(node, idx))}
                      </ul>
                    )}
                  </div>
                  <ListBlock title="页面按钮" items={effectiveButtons.slice(0, 40).map((item) => visibleTextField(item, ["text", "name", "ariaLabel", "title"]))} emptyText="未采集到有效按钮" />
                  <ListBlock title="表格列" items={effectiveTables.map((item) => `列：${asArray<unknown>(item.columns).map((column) => compactText(column, "")).filter(Boolean).join(" / ")}`)} emptyText="未采集到有效表格" />
                </DetailSection>

                <DetailSection title="问题与建议">
                  <ListBlock title="未解决问题" items={unresolvedQuestions.map((item) => compactText(item)).filter((t) => t && !/^[a-zA-Z\s\d:.()'"\-_,]+$/.test(t))} emptyText="无未解决问题" />
                  <ListBlock title="脚本生成建议" items={scriptGuidance.map((item) => compactText(item)).filter(Boolean)} emptyText="无建议" />
                </DetailSection>
              </div>
            ) : null}

            {activeTab === "trace" ? (
              <DetailSection title="识别过程">
                {trace.length === 0 ? <EmptyLine text="暂无过程日志。请重新执行一次识别以生成过程详情。" /> : (
                  <div className="log-block">
                    {trace.map((item, index) => (
                      <div className="trace-row recognition-trace-row" key={`${textOf(item.step)}-${index}`}>
                        <span className="trace-row__index">{index + 1}</span>
                        <code className="trace-row__step">{textOf(item.step)}</code>
                        <StatusText status={textOf(item.status)} />
                        <div>
                          <div className="trace-row__message">{textOf(item.message)}</div>
                          {item.url ? <div className="trace-row__url text-anywhere">{textOf(item.url)}</div> : null}
                          {Object.keys(asRecord(item.data)).length > 0 ? <pre className="json-block json-block--mini">{JSON.stringify(item.data, null, 2)}</pre> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </DetailSection>
            ) : null}

            {activeTab === "raw" ? (
              <DetailSection title="原始 JSON">
                <pre className="json-block recognition-json-block">{JSON.stringify(root, null, 2)}</pre>
              </DetailSection>
            ) : null}
          </div>
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
    <section className="work-panel work-panel--compact">
      <h3 className="panel-title">{title}</h3>
      {children}
    </section>
  );
}

function DetailMetric({ label, value, tone }: { label: string; value: string; tone?: "green" | "red" }) {
  return (
    <div className="detail-card">
      <div className="detail-card__label">{label}</div>
      <div className={`detail-card__value${tone ? ` detail-card__value--${tone}` : ""}`}>{value}</div>
    </div>
  );
}

function StatusText({ status }: { status: string }) {
  const color = status === "success" ? "var(--green)" : status === "failed" ? "var(--red)" : status === "skipped" ? "var(--muted)" : "var(--blue)";
  const text = status === "success" ? "成功" : status === "failed" ? "失败" : status === "skipped" ? "跳过" : status === "running" ? "执行中" : status;
  return <span style={{ color }} className="detail-card__value">{text}</span>;
}

function ListBlock({ title, items, emptyText = "暂无数据", compact = false }: { title: string; items: string[]; emptyText?: string; compact?: boolean }) {
  return (
    <div className={compact ? "list-block list-block--compact" : "list-block"}>
      <div className="list-block__title">{title}</div>
      {items.length === 0 ? <EmptyLine text={emptyText} /> : (
        <ul className="list-block__list">
          {items.map((item, index) => <li className="list-block__item" key={`${item}-${index}`}>{item}</li>)}
        </ul>
      )}
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <div className="muted-empty">{text}</div>;
}

function renderMenuNode(node: JsonRecord, key: number | string): ReactNode {
  const title = visibleTextField(node, ["title", "text", "name"]) || "未命名";
  const selector = textOf(node.selectorHint, "");
  const className = String(node.className || "");
  const isSubmenu = className.includes("submenu");
  const children = asArray<JsonRecord>(node.children).filter(meaningfulMenu);
  const isOpened = className.includes("is-opened");
  return (
    <li className={`menu-tree-node${isSubmenu ? " menu-tree-node--branch" : ""}`} key={key}>
      <div className="menu-tree-node__label">
        <span className="menu-tree-node__icon">{isSubmenu ? (isOpened ? "▾" : "▸") : "•"}</span>
        <span className="menu-tree-node__title">{title}</span>
        {isSubmenu ? <span className="menu-tree-node__tag">子菜单{children.length > 0 ? `(${children.length})` : ""}</span> : null}
        {selector ? <span className="menu-tree-node__selector">{selector}</span> : null}
      </div>
      {children.length > 0 ? (
        <ul className="menu-tree-list">
          {children.map((child, idx) => renderMenuNode(child, `${key}-${idx}`))}
        </ul>
      ) : null}
    </li>
  );
}
