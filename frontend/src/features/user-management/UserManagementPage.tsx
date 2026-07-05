import { useCallback, useEffect, useMemo, useState } from "react";
import { Shield, ShieldOff, X, RotateCcw } from "lucide-react";
import { listUsers, deleteUser, updateUser, getMeWithAdmin, type UserItem } from "../auth/api/auth";
import { DataTable } from "../../shared/components/DataTable";
import { DataPanel } from "../../shared/components/DataPanel";
import { ConfirmDialog } from "../../shared/components/ConfirmDialog";
import { Modal } from "../../shared/components/Modal";

export function UserManagementPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [nicknameFilter, setNicknameFilter] = useState("");
  const [phoneFilter, setPhoneFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [editForm, setEditForm] = useState({ nickname: "", is_admin: false, is_active: true });
  const [saving, setSaving] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, meRes] = await Promise.all([listUsers(), getMeWithAdmin()]);
      if (usersRes.ok) {
        setUsers(usersRes.users);
      }
      if (meRes.ok && meRes.user) {
        setCurrentUserId(meRes.user.user_id);
      }
    } catch {
      // 静默失败
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (nicknameFilter && !(u.nickname || "").toLowerCase().includes(nicknameFilter.toLowerCase())) return false;
      if (phoneFilter && !(u.phone || "").includes(phoneFilter)) return false;
      if (roleFilter !== "all") {
        if (roleFilter === "admin" && !u.is_admin) return false;
        if (roleFilter === "user" && u.is_admin) return false;
      }
      return true;
    });
  }, [users, nicknameFilter, phoneFilter, roleFilter]);

  const paginatedUsers = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredUsers.slice(start, start + pageSize);
  }, [filteredUsers, page, pageSize]);

  const resetFilters = () => {
    setNicknameFilter("");
    setPhoneFilter("");
    setRoleFilter("all");
    setPage(1);
  };

  const handleDeleteClick = (user: UserItem) => {
    if (user.id === currentUserId) {
      alert("不能删除自己的账号");
      return;
    }
    setUserToDelete(user);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!userToDelete) return;

    setDeleting(true);
    try {
      const res = await deleteUser(userToDelete.id);
      if (res.ok) {
        await loadUsers();
        setDeleteDialogOpen(false);
        setUserToDelete(null);
      } else {
        alert(res.message || "删除失败");
      }
    } catch {
      alert("删除失败，请重试");
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setUserToDelete(null);
  };

  const handleEditClick = (user: UserItem) => {
    setEditingUser(user);
    setEditForm({
      nickname: user.nickname || "",
      is_admin: user.is_admin,
      is_active: user.is_active,
    });
  };

  const handleSaveEdit = async () => {
    if (!editingUser) return;
    setSaving(true);
    try {
      const res = await updateUser(editingUser.id, editForm);
      if (res.ok) {
        await loadUsers();
        setEditingUser(null);
      } else {
        alert(res.message || "保存失败");
      }
    } catch {
      alert("保存失败，请重试");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (user: UserItem) => {
    const newIsActive = !user.is_active;
    // 先本地更新状态，避免闪烁
    setUsers(users.map(u => u.id === user.id ? { ...u, is_active: newIsActive } : u));
    try {
      const res = await updateUser(user.id, { is_active: newIsActive });
      if (!res.ok) {
        // 失败时恢复原状态
        setUsers(users.map(u => u.id === user.id ? { ...u, is_active: user.is_active } : u));
      }
    } catch {
      // 失败时恢复原状态
      setUsers(users.map(u => u.id === user.id ? { ...u, is_active: user.is_active } : u));
    }
  };

  const toolbar = (
    <div className="search-form">
      <div className="search-form__field">
        <label className="search-form__label">昵称</label>
        <input
          className="search-form__input"
          type="text"
          placeholder="搜索昵称"
          value={nicknameFilter}
          onChange={(e) => { setNicknameFilter(e.target.value); setPage(1); }}
        />
        {nicknameFilter && (
          <button className="search-form__clear" type="button" onClick={() => { setNicknameFilter(""); setPage(1); }}>
            <X size={14} />
          </button>
        )}
      </div>
      <div className="search-form__field">
        <label className="search-form__label">手机号</label>
        <input
          className="search-form__input"
          type="text"
          placeholder="搜索手机号"
          value={phoneFilter}
          onChange={(e) => { setPhoneFilter(e.target.value); setPage(1); }}
        />
        {phoneFilter && (
          <button className="search-form__clear" type="button" onClick={() => { setPhoneFilter(""); setPage(1); }}>
            <X size={14} />
          </button>
        )}
      </div>
      <div className="search-form__field">
        <label className="search-form__label">角色</label>
        <select
          className="search-form__select"
          value={roleFilter}
          onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
        >
          <option value="all">全部角色</option>
          <option value="admin">管理员</option>
          <option value="user">普通用户</option>
        </select>
      </div>
      <div className="search-form__actions">
        <button className="ghost-button" type="button" onClick={resetFilters}>
          <RotateCcw size={16} />
          重置
        </button>
      </div>
    </div>
  );

  return (
    <div className="page-stack">
      <DataPanel
        toolbar={toolbar}
        total={filteredUsers.length}
        pageSize={pageSize}
        currentPage={page}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      >
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>加载中...</div>
        ) : paginatedUsers.length === 0 ? (
          <div className="empty-state">
            <p>暂无用户数据</p>
          </div>
        ) : (
          <DataTable
            rows={paginatedUsers}
            getRowKey={(row) => row.id}
            columns={[
              {
                key: "avatar",
                label: "头像",
                width: "8%",
                render: (row) => (
                  <div className="user-avatar user-avatar--sm" style={{ margin: "0 auto", ...(row.avatar ? { backgroundImage: `url(${row.avatar})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined) }}>
                    {!row.avatar && <span>{(row.nickname || "用").charAt(0)}</span>}
                  </div>
                ),
              },
              { key: "nickname", label: "昵称", render: (row) => <strong>{row.nickname || "未设置"}</strong> },
              { key: "phone", label: "手机号", render: (row) => row.phone },
              {
                key: "role",
                label: "角色",
                render: (row) => row.is_admin ? (
                  <span className="status-pill status-pill--blue">
                    <Shield size={12} style={{ marginRight: 4 }} /> 管理员
                  </span>
                ) : (
                  <span className="status-pill status-pill--slate">
                    <ShieldOff size={12} style={{ marginRight: 4 }} /> 普通用户
                  </span>
                ),
              },
              {
                key: "is_active",
                label: "状态",
                width: "6%",
                align: "center",
                render: (row) => (
                  <label className="toggle-switch" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={row.is_active} onChange={() => handleToggleStatus(row)} />
                    <span className="toggle-switch__slider" />
                  </label>
                ),
              },
              {
                key: "created_at",
                label: "创建时间",
                render: (row) => {
                  if (!row.created_at) return "-";
                  const d = new Date(row.created_at);
                  const y = d.getFullYear();
                  const m = String(d.getMonth() + 1).padStart(2, "0");
                  const day = String(d.getDate()).padStart(2, "0");
                  const h = String(d.getHours()).padStart(2, "0");
                  const min = String(d.getMinutes()).padStart(2, "0");
                  const sec = String(d.getSeconds()).padStart(2, "0");
                  return `${y}-${m}-${day} ${h}:${min}:${sec}`;
                },
              },
              {
                key: "actions",
                label: "操作",
                align: "center",
                render: (row) => (
                  <div className="inline-actions">
                    <button className="text-button" type="button" onClick={() => handleEditClick(row)}>
                      编辑
                    </button>
                    <button
                      className="text-button text-button--danger"
                      type="button"
                      onClick={() => handleDeleteClick(row)}
                    >
                      删除
                    </button>
                  </div>
                ),
              },
            ]}
          />
        )}
      </DataPanel>

      <ConfirmDialog
        open={deleteDialogOpen}
        title="删除用户"
        message={`确定要删除用户"${userToDelete?.nickname || userToDelete?.phone}"吗？此操作不可撤销。`}
        confirmLabel={deleting ? "删除中..." : "删除"}
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
        danger={true}
      />

      <Modal open={!!editingUser} onClose={() => setEditingUser(null)} title="编辑用户" width={520}>
        <div className="form-stack">
          <div className="form-label">
            <span>昵称</span>
            <input
              className="form-input"
              value={editForm.nickname}
              onChange={(e) => setEditForm({ ...editForm, nickname: e.target.value })}
            />
          </div>
          <div className="form-label">
            <span>角色</span>
            <select
              className="form-select"
              value={editForm.is_admin ? "admin" : "user"}
              onChange={(e) => setEditForm({ ...editForm, is_admin: e.target.value === "admin" })}
            >
              <option value="user">普通用户</option>
              <option value="admin">管理员</option>
            </select>
          </div>
          <div className="form-label">
            <span>状态</span>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={editForm.is_active}
                onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })}
              />
              <span className="toggle-switch__slider" />
            </label>
          </div>
        </div>
        <div className="form-actions" style={{ marginTop: 20 }}>
          <button className="ghost-button" type="button" onClick={() => setEditingUser(null)}>
            取消
          </button>
          <button className="primary-button" type="button" onClick={handleSaveEdit} disabled={saving}>
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
