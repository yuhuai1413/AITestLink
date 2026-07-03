import { useCallback, useEffect, useState } from "react";
import { Users, Shield, ShieldOff } from "lucide-react";
import { listUsers, type UserItem } from "../auth/api/auth";

export function UserManagementPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listUsers();
      if (res.ok) {
        setUsers(res.users);
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

  return (
    <div className="page-stack">
      <div className="section-header">
        <div>
          <div className="section-header__eyebrow">
            <Users size={14} /> 用户管理
          </div>
          <h2>系统用户列表</h2>
          <p>查看所有注册用户的信息</p>
        </div>
      </div>

      <div className="work-panel">
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>加载中...</div>
        ) : users.length === 0 ? (
          <div className="empty-state">
            <p>暂无用户数据</p>
          </div>
        ) : (
          <div className="data-table-wrap">
            <table className="data-table" style={{ tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: "8%" }} />
                <col style={{ width: "18%" }} />
                <col style={{ width: "20%" }} />
                <col style={{ width: "18%" }} />
                <col style={{ width: "14%" }} />
                <col style={{ width: "22%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th>头像</th>
                  <th>昵称</th>
                  <th>手机号</th>
                  <th>角色</th>
                  <th>状态</th>
                  <th>注册时间</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td style={{ textAlign: "center" }}>
                      <div className="user-avatar user-avatar--sm" style={{ margin: "0 auto", ...(u.avatar ? { backgroundImage: `url(${u.avatar})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined) }}>
                        {!u.avatar && <span>{(u.nickname || "用").charAt(0)}</span>}
                      </div>
                    </td>
                    <td style={{ textAlign: "center" }}><strong>{u.nickname || "未设置"}</strong></td>
                    <td style={{ textAlign: "center", color: "var(--muted)" }}>{u.phone}</td>
                    <td style={{ textAlign: "center" }}>
                      {u.is_admin ? (
                        <span className="status-pill status-pill--blue">
                          <Shield size={12} style={{ marginRight: 4 }} /> 管理员
                        </span>
                      ) : (
                        <span className="status-pill status-pill--slate">
                          <ShieldOff size={12} style={{ marginRight: 4 }} /> 普通用户
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span className={`status-pill ${u.is_active ? "status-pill--green" : "status-pill--red"}`}>
                        {u.is_active ? "正常" : "禁用"}
                      </span>
                    </td>
                    <td style={{ textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
                      {u.created_at ? new Date(u.created_at).toLocaleDateString("zh-CN") : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
