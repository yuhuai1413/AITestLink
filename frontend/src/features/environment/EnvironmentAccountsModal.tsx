import { KeyRound, Plus, Users } from "lucide-react";

import type { EnvironmentConfig, TestAccount } from "../../api/environment.api";
import { DataTable } from "../../shared/components/DataTable";
import { Modal } from "../../shared/components/Modal";
import { StatusPill } from "../../shared/components/StatusPill";
import { formatDateTime } from "../../shared/utils/dateTime";

interface EnvironmentAccountsModalProps {
  environment: EnvironmentConfig | null;
  onClose: () => void;
  onAdd: (environmentId: string) => void;
  onEdit: (account: TestAccount) => void;
  onDelete: (account: TestAccount) => void;
  onToggleAdmin: (account: TestAccount) => void;
}

function formatTime(iso: string | undefined): string {
  return formatDateTime(iso);
}

export function EnvironmentAccountsModal({
  environment,
  onClose,
  onAdd,
  onEdit,
  onDelete,
  onToggleAdmin,
}: EnvironmentAccountsModalProps) {
  const accounts = environment?.accounts ?? [];
  const environmentType = environment?.environmentType === "APP" ? "APP" : "Web";
  const targetLabel = environmentType === "APP" ? "APP 端地址" : "PC 端地址";
  const targetUrl = environmentType === "APP"
    ? (environment?.appUrl || environment?.targetUrl || "")
    : (environment?.webUrl || environment?.targetUrl || "");

  return (
    <Modal
      open={!!environment}
      onClose={onClose}
      title={environment ? `账号管理 · ${environment.name}` : "账号管理"}
      width={1180}
      height="78vh"
      footer={<button className="ghost-button" type="button" onClick={onClose}>关闭</button>}
    >
      {environment && (
        <div className="page-stack page-stack--spaced page-stack--fill">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) auto",
              gap: 12,
              alignItems: "stretch",
            }}
          >
            <div className="work-panel" style={{ padding: "14px 16px", minWidth: 0, display: "grid", gridTemplateColumns: "72px minmax(0, 1fr)", alignItems: "center", columnGap: 14 }}>
              <div style={{ color: "var(--muted)", fontSize: 13 }}>{targetLabel}</div>
              <div title={targetUrl || "未配置"} style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600, textAlign: "left" }}>
                {targetUrl || "未配置"}
              </div>
            </div>
            <button className="primary-button" type="button" onClick={() => onAdd(environment.id)} style={{ alignSelf: "center" }}>
              <Plus size={14} /> 添加账号
            </button>
          </div>

          <section className="work-panel environment-accounts-table" style={{ minHeight: 0, flex: 1 }}>
            {accounts.length === 0 ? (
              <div className="empty-state" style={{ minHeight: 260 }}>
                <Users size={36} style={{ color: "var(--muted)", marginBottom: 10 }} />
                <p>当前环境还没有测试账号</p>
                <p style={{ color: "var(--muted)", fontSize: 13 }}>添加的账号只会绑定到“{environment.name}”。</p>
                <button className="primary-button" type="button" onClick={() => onAdd(environment.id)}>
                  <Plus size={14} /> 添加第一个账号
                </button>
              </div>
            ) : (
              <DataTable<TestAccount>
                rows={accounts}
                getRowKey={(account) => account.id}
                columns={[
                  { key: "department", label: "部门", width: "84px", align: "center", render: (account) => account.department || <span style={{ color: "var(--muted)" }}>-</span> },
                  { key: "name", label: "用户名", width: "88px", align: "center", render: (account) => <strong>{account.name}</strong> },
                  { key: "username", label: "账号", width: "118px", align: "center", render: (account) => account.username },
                  { key: "password", label: "密码", width: "88px", align: "center", render: (account) => account.hasPassword ? (
                    <span title="密码已加密保存，不回显明文" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <KeyRound size={13} /> ••••••••
                    </span>
                  ) : <StatusPill tone="slate">未配置</StatusPill> },
                  { key: "role", label: "角色/权限", width: "96px", align: "center", render: (account) => account.role || <span style={{ color: "var(--muted)" }}>-</span> },
                  { key: "isAdmin", label: "识别账号", width: "84px", align: "center", render: (account) => (
                    <button
                      type="button"
                      className={`admin-toggle${account.isAdmin ? " admin-toggle--on" : ""}`}
                      onClick={() => onToggleAdmin(account)}
                      title={account.isAdmin ? "已设为识别账号（点击关闭）" : "设为识别账号（系统识别时使用此账号登录以采集完整菜单）"}
                      aria-label="切换识别账号"
                    >
                      <span className="admin-toggle__knob" />
                    </button>
                  ) },
                  { key: "createdAt", label: "创建时间", width: "132px", align: "center", render: (account) => formatTime(account.createdAt) },
                  { key: "actions", label: "操作", width: "84px", sticky: "right", align: "center", render: (account) => (
                    <div className="inline-actions">
                      <button className="text-button" type="button" onClick={() => onEdit(account)}>编辑</button>
                      <button className="text-button text-button--danger" type="button" onClick={() => onDelete(account)}>删除</button>
                    </div>
                  ) },
                ]}
              />
            )}
          </section>
          <div style={{ color: "var(--muted)", fontSize: 12 }}>
            共 {accounts.length} 个账号；账号与当前环境独立绑定，密码以加密方式保存。
          </div>
        </div>
      )}
    </Modal>
  );
}
