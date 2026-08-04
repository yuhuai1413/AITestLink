import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Shield, ShieldOff, X, RotateCcw } from "lucide-react";
import { listUsers, deleteUser, updateUser, createUser, getMeWithAdmin, type UserItem } from "../auth/api/auth";
import { toast } from "../auth/components/ToastProvider";
import { DataTable } from "../../shared/components/DataTable";
import { DataPanel } from "../../shared/components/DataPanel";
import { ConfirmDialog } from "../../shared/components/ConfirmDialog";
import { MenuSelect } from "../../shared/components/MenuSelect";
import { Modal } from "../../shared/components/Modal";
import { useUnsavedChanges } from "../../shared/hooks/useUnsavedChanges";
import { formatDateTime } from "../../shared/utils/dateTime";

export function UserManagementPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [nicknameFilter, setNicknameFilter] = useState("");
  const [phoneFilter, setPhoneFilter] = useState("");
  const [roleTab, setRoleTab] = useState<"all" | "admin" | "user">("all");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [editForm, setEditForm] = useState({ nickname: "", is_admin: false, is_active: true });
  const [saving, setSaving] = useState(false);
  const userDirty = useUnsavedChanges();
  // 新增用户弹窗
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ phone: "", password: "", role: "user" as "user" | "admin", is_active: true });
  const [creating, setCreating] = useState(false);
  const createDirty = useUnsavedChanges("新增用户");
  const phoneError = createForm.phone && !/^1[3-9]\d{9}$/.test(createForm.phone) ? "请输入正确的手机号" : "";

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, meRes] = await Promise.all([listUsers(), getMeWithAdmin()]);
      if (usersRes.ok) {
        setUsers(usersRes.users);
      }
      if (meRes.ok && meRes.user) {
        setCurrentUserId(meRes.user.id);
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

  useEffect(() => {
    const handler = () => loadUsers();
    window.addEventListener("profile-updated", handler);
    return () => window.removeEventListener("profile-updated", handler);
  }, [loadUsers]);

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (roleTab === "admin" && !u.is_admin) return false;
      if (roleTab === "user" && u.is_admin) return false;
      if (nicknameFilter && !(u.nickname || "").toLowerCase().includes(nicknameFilter.toLowerCase())) return false;
      if (phoneFilter && !(u.phone || "").includes(phoneFilter)) return false;
      return true;
    });
  }, [users, nicknameFilter, phoneFilter, roleTab]);

  const paginatedUsers = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredUsers.slice(start, start + pageSize);
  }, [filteredUsers, page, pageSize]);

  const resetFilters = () => {
    setNicknameFilter("");
    setPhoneFilter("");
    setRoleTab("all");
    setPage(1);
  };

  const handleDeleteClick = (user: UserItem) => {
    if (user.id === currentUserId) {
      toast.error("不能删除自己的账号");
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
        toast.success("删除成功");
      } else {
        toast.error(res.message || "删除失败");
      }
    } catch {
      toast.error("删除失败，请重试");
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
        if (editingUser.id === currentUserId) {
          window.dispatchEvent(new Event("profile-updated"));
        }
        setEditingUser(null);
        userDirty.markClean();
        toast.success("保存成功");
      } else {
        toast.error(res.message || "保存失败");
      }
    } catch {
      toast.error("保存失败，请重试");
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

  const openCreate = () => {
    setCreateForm({ phone: "", password: "", role: "user", is_active: true });
    createDirty.markClean();
    setCreateOpen(true);
  };

  const handleCreate = async () => {
    if (!createForm.phone.trim()) { toast.error("请输入手机号"); return; }
    if (phoneError) { toast.error(phoneError); return; }
    setCreating(true);
    try {
      const res = await createUser({
        phone: createForm.phone.trim(),
        password: createForm.password.trim() || undefined, // 空 → 后端用默认密码 password123
        is_admin: createForm.role === "admin",
        is_active: createForm.is_active,
      });
      if (res.ok) {
        await loadUsers();
        setCreateOpen(false);
        createDirty.markClean();
        toast.success("创建成功");
      } else {
        toast.error(res.message || "创建失败");
      }
    } catch {
      toast.error("创建失败，请重试");
    } finally {
      setCreating(false);
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
        <MenuSelect
          className="search-form__menu-select"
          size="compact"
          value={roleTab}
          options={[{ value: "all", label: "全部角色" }, { value: "admin", label: "管理员" }, { value: "user", label: "普通用户" }]}
          onChange={(value) => { setRoleTab(value); setPage(1); }}
        />
      </div>
      <div className="search-form__actions">
        <button className="ghost-button toolbar-button toolbar-ghost-button" type="button" onClick={resetFilters}>
          <RotateCcw size={16} />
          重置
        </button>
      </div>
      <button className="primary-button toolbar-button toolbar-primary-button" type="button" style={{ marginLeft: "auto" }} onClick={openCreate}>
        <Plus size={16} />
        新增用户
      </button>
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
                  <label className="toggle-switch" style={{ opacity: row.is_admin ? 0.5 : 1, cursor: row.is_admin ? "not-allowed" : "pointer" }} onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={row.is_active} disabled={row.is_admin} onChange={() => handleToggleStatus(row)} />
                    <span className="toggle-switch__slider" />
                  </label>
                ),
              },
              {
                key: "created_at",
                label: "创建时间",
                render: (row) => formatDateTime(row.created_at),
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
                    {!row.is_admin && (
                      <button
                        className="text-button text-button--danger"
                        type="button"
                        onClick={() => handleDeleteClick(row)}
                      >
                        删除
                      </button>
                    )}
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
        confirmLabel="删除"
        confirmLoading={deleting}
        onConfirm={() => { setDeleteDialogOpen(false); handleDeleteConfirm(); }}
        onCancel={handleDeleteCancel}
        danger={true}
      />

      <Modal open={!!editingUser} onClose={() => userDirty.requestClose(() => setEditingUser(null))} title="编辑用户" width={640}
        footer={<>
          <button className="ghost-button" type="button" onClick={() => userDirty.requestClose(() => setEditingUser(null))}>取消</button>
          <button className="primary-button" type="button" onClick={handleSaveEdit} disabled={saving}>
            {saving ? "保存中..." : "保存"}
          </button>
        </>}
      >
        <form className="form-stack" onSubmit={(e) => { e.preventDefault(); handleSaveEdit(); }}>
          <div className="form-label">
            <span>昵称</span>
            <input
              className="form-input"
              value={editForm.nickname}
              onChange={(e) => { setEditForm({ ...editForm, nickname: e.target.value }); userDirty.markDirty(); }}
            />
          </div>
          <div className="form-label">
            <span>角色</span>
            <MenuSelect
              value={editForm.is_admin ? "admin" : "user"}
              options={[{ value: "user", label: "普通用户" }, { value: "admin", label: "管理员" }]}
              onChange={(value) => { setEditForm({ ...editForm, is_admin: value === "admin" }); userDirty.markDirty(); }}
            />
          </div>
          <div className="form-label">
            <span>状态</span>
            <label className="toggle-switch" style={{ opacity: editForm.is_admin ? 0.5 : 1, cursor: editForm.is_admin ? "not-allowed" : "pointer" }}>
              <input
                type="checkbox"
                checked={editForm.is_active}
                disabled={editForm.is_admin}
                onChange={(e) => { setEditForm({ ...editForm, is_active: e.target.checked }); userDirty.markDirty(); }}
              />
              <span className="toggle-switch__slider" />
            </label>
          </div>

        </form>
      </Modal>

      {/* 新增用户弹窗 */}
      <Modal
        open={createOpen}
        onClose={() => createDirty.requestClose(() => setCreateOpen(false))}
        title="新增用户"
        width={520}
        footer={<>
          <button className="ghost-button" type="button" onClick={() => createDirty.requestClose(() => setCreateOpen(false))}>取消</button>
          <button className="primary-button" type="button" onClick={handleCreate} disabled={creating || !!phoneError}>
            {creating ? "创建中..." : "创建"}
          </button>
        </>}
      >
        <form className="form-stack" onSubmit={(e) => { e.preventDefault(); handleCreate(); }}>
          <div className="form-label">
            <span>手机号 <span style={{ color: "var(--red)" }}>*</span></span>
            <input
              className="form-input"
              type="text"
              maxLength={11}
              placeholder="请输入 11 位手机号"
              value={createForm.phone}
              onChange={(e) => { setCreateForm({ ...createForm, phone: e.target.value.replace(/\D/g, "") }); createDirty.markDirty(); }}
            />
            {phoneError && <span className="form-help" style={{ color: "var(--red)" }}>{phoneError}</span>}
          </div>
          <div className="form-label">
            <span>密码</span>
            <input
              className="form-input"
              type="text"
              placeholder="不填则使用默认密码 password123（不少于8位，含字母和数字）"
              value={createForm.password}
              onChange={(e) => { setCreateForm({ ...createForm, password: e.target.value }); createDirty.markDirty(); }}
            />
          </div>
          <div className="form-label">
            <span>角色</span>
            <MenuSelect
              value={createForm.role}
              options={[{ value: "user", label: "普通用户" }, { value: "admin", label: "管理员" }]}
              onChange={(value) => { setCreateForm({ ...createForm, role: value as "user" | "admin" }); createDirty.markDirty(); }}
            />
          </div>
          <div className="form-label">
            <span>状态</span>
            <label className="toggle-switch" style={{ opacity: createForm.role === "admin" ? 0.5 : 1, cursor: createForm.role === "admin" ? "not-allowed" : "pointer" }}>
              <input
                type="checkbox"
                checked={createForm.role === "admin" ? true : createForm.is_active}
                disabled={createForm.role === "admin"}
                onChange={(e) => { setCreateForm({ ...createForm, is_active: e.target.checked }); createDirty.markDirty(); }}
              />
              <span className="toggle-switch__slider" />
            </label>
            <span className="form-help">{createForm.role === "admin" ? "管理员账号默认启用" : "启用 / 禁用"}</span>
          </div>
        </form>
      </Modal>
      {createDirty.confirmDialog}
      {userDirty.confirmDialog}
    </div>
  );
}
