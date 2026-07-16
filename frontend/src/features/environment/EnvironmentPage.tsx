import { useState, useEffect, useCallback } from "react";
import { Plus, Server, Users } from "lucide-react";
import { environmentApi, type EnvironmentConfig, type TestAccount } from "../../api/environment.api";
import { Modal } from "../../shared/components/Modal";
import { SectionHeader } from "../../shared/components/SectionHeader";
import { DataTable } from "../../shared/components/DataTable";
import { ConfirmDialog } from "../../shared/components/ConfirmDialog";
import { toast } from "sonner";
import { EnvironmentAccountsModal } from "./EnvironmentAccountsModal";

function formatTime(iso: string | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface Props {
  projectId: string;
}

export function EnvironmentPage({ projectId }: Props) {
  const [environments, setEnvironments] = useState<EnvironmentConfig[]>([]);
  const [loading, setLoading] = useState(true);

  // 环境配置弹窗
  const [showEnvModal, setShowEnvModal] = useState(false);
  const [editingEnv, setEditingEnv] = useState<EnvironmentConfig | null>(null);
  const [envForm, setEnvForm] = useState({
    name: "",
    webUrl: "",
    appUrl: "",
    timeout: "30",
    retryCount: "3",
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
    notes: "",
  });

  // 删除确认
  const [deleteTarget, setDeleteTarget] = useState<{ type: "env" | "account"; id: string; name: string } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await environmentApi.list(projectId);
      setEnvironments(data);
    } catch {
      toast.error("加载环境配置失败");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { loadData(); }, [loadData]);

  // 环境配置操作
  const handleSaveEnv = async () => {
    if (!envForm.name.trim()) { toast.warning("请输入环境名称"); return; }
    try {
      if (editingEnv) {
        await environmentApi.update(editingEnv.id, envForm);
        toast.success("更新成功");
      } else {
        await environmentApi.create(projectId, envForm);
        toast.success("创建成功");
      }
      setShowEnvModal(false);
      setEditingEnv(null);
      resetEnvForm();
      await loadData();
    } catch { toast.error("保存失败"); }
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

  const resetEnvForm = () => setEnvForm({ name: "", webUrl: "", appUrl: "", timeout: "30", retryCount: "3", notes: "", isDefault: false });

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

  const resetAccountForm = () => setAccountForm({ name: "", username: "", department: "", password: "", role: "", notes: "" });
  const accountManagerEnvironment = environments.find((environment) => environment.id === accountManagerEnvId) ?? null;

  const openCreateAccount = (environmentId: string) => {
    resetAccountForm();
    setEditingAccount(null);
    setCurrentEnvId(environmentId);
    setShowAccountModal(true);
  };

  const openEditAccount = (account: TestAccount) => {
    setAccountForm({ name: account.name, username: account.username, department: account.department || "", password: "", role: account.role, notes: account.notes });
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
            { key: "name", label: "环境名称", width: "15%", align: "center", render: (r) => <strong>{r.name}{r.isDefault ? "（默认）" : ""}</strong> },
            { key: "webUrl", label: "Web 地址", width: "20%", align: "center", render: (r) => r.webUrl || <span style={{ color: "var(--muted)" }}>-</span> },
            { key: "appUrl", label: "APP 地址", width: "20%", align: "center", render: (r) => r.appUrl || <span style={{ color: "var(--muted)" }}>-</span> },
            { key: "accounts", label: "账号数量", width: "10%", align: "center", render: (r) => <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Users size={14} /> {r.accounts?.length || 0}</span> },
            { key: "timeout", label: "超时", width: "8%", align: "center", render: (r) => `${r.timeout}s` },
            { key: "createdAt", label: "创建时间", width: "15%", align: "center", render: (r) => formatTime(r.createdAt) },
            { key: "actions", label: "操作", width: "120px", sticky: "right" as const, align: "center", render: (r) => (
              <div className="inline-actions">
                <button className="text-button" type="button" onClick={() => { setEnvForm({ name: r.name, webUrl: r.webUrl, appUrl: r.appUrl, timeout: r.timeout, retryCount: r.retryCount, notes: r.notes, isDefault: r.isDefault }); setEditingEnv(r); setShowEnvModal(true); }}>
                  编辑
                </button>
                <button className="text-button" type="button" onClick={() => setAccountManagerEnvId(r.id)}>
                  账号
                </button>
                <button className="text-button text-button--danger" type="button" onClick={() => setDeleteTarget({ type: "env", id: r.id, name: r.name })}>
                  删除
                </button>
              </div>
            ) },
          ]}
        />
        </section>
      )}

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
            <label className="form-label">Web 地址
              <input className="form-input" value={envForm.webUrl} onChange={(e) => setEnvForm({ ...envForm, webUrl: e.target.value })} placeholder="https://test.example.com" />
            </label>
          </div>
          <div className="form-row">
            <label className="form-label">APP 地址
              <input className="form-input" value={envForm.appUrl} onChange={(e) => setEnvForm({ ...envForm, appUrl: e.target.value })} placeholder="如：移动端测试入口或安装包地址" />
            </label>
          </div>
          <div className="form-row">
            <label className="form-label" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={envForm.isDefault} onChange={(e) => setEnvForm({ ...envForm, isDefault: e.target.checked })} />
              设为默认测试环境
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
            <label className="form-label">备注
              <textarea className="form-textarea" rows={2} value={envForm.notes} onChange={(e) => setEnvForm({ ...envForm, notes: e.target.value })} />
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
          <div className="form-row">
            <label className="form-label">备注
              <textarea className="form-textarea" rows={2} value={accountForm.notes} onChange={(e) => setAccountForm({ ...accountForm, notes: e.target.value })} />
            </label>
          </div>
        </div>
      </Modal>

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
