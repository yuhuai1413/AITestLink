import { useState } from "react";
import { User, X } from "lucide-react";

type EditTab = "info" | "password";

interface PersonalSettingsModalProps {
  open: boolean;
  onClose: () => void;
  initialTab?: EditTab;
}

export function PersonalSettingsModal({ open, onClose, initialTab = "info" }: PersonalSettingsModalProps) {
  const [editTab, setEditTab] = useState<EditTab>(initialTab);
  const [nickname, setNickname] = useState("管理员");
  const [phone] = useState("138****8888");
  const [showPwd1, setShowPwd1] = useState(false);
  const [showPwd2, setShowPwd2] = useState(false);
  const [showPwd3, setShowPwd3] = useState(false);

  const tabs: { key: EditTab; label: string }[] = [
    { key: "info", label: "基本信息" },
    { key: "password", label: "修改密码" },
  ];

  const tabIndex = tabs.findIndex((t) => t.key === editTab);

  if (!open) return null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      {/* 背景遮罩 */}
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)", animation: "dialogOverlayIn 0.3s cubic-bezier(0.22, 1, 0.36, 1) both" }} onClick={onClose} />

      {/* 弹窗内容 */}
      <div style={{ position: "relative", width: 460, background: "#fff", zIndex: 10, padding: 24, borderRadius: 38, animation: "dialogContentIn 0.4s cubic-bezier(0.22, 1, 0.36, 1) both" }}>
        {/* 关闭按钮 */}
        <button onClick={onClose} style={{ position: "absolute", top: 16, right: 16, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.4)", borderRadius: "50%", border: "none", cursor: "pointer", transition: "background 0.15s" }}>
          <X size={16} style={{ color: "#6b5b8a" }} />
        </button>

        {/* 标题 */}
        <h2 style={{ margin: "0 0 16px", fontSize: 18, fontWeight: 800, color: "#1a1040", fontFamily: "var(--font-serif)" }}>编辑个人信息</h2>

        {/* Tab 切换 — 胶囊滑动指示器 */}
        <div style={{ display: "flex", marginBottom: 20 }}>
          <div style={{ position: "relative", display: "flex", background: "#f8f7ff", borderRadius: 999, padding: 3, width: "100%" }}>
            <div style={{ position: "absolute", top: 3, bottom: 3, left: 3, width: "calc(50% - 2px)", borderRadius: 999, background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)", transform: `translateX(${tabIndex * 100}%)`, transition: "transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)" }} />
            {tabs.map((tab) => (
              <button key={tab.key} type="button" onClick={() => setEditTab(tab.key)} style={{ position: "relative", zIndex: 10, flex: 1, padding: "8px 0", border: "none", background: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, color: editTab === tab.key ? "#1a1040" : "#6b5b8a", borderRadius: 999, transition: "color 0.25s" }}>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab 内容 — 基本信息 */}
        <div style={{ display: "grid", gridTemplateRows: editTab === "info" ? "1fr" : "0fr", transition: "grid-template-rows 0.35s cubic-bezier(0.4, 0, 0.2, 1)" }}>
          <div style={{ overflow: "hidden" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 4, opacity: editTab === "info" ? 1 : 0, transform: editTab === "info" ? "translateY(0)" : "translateY(6px)", transition: "opacity 0.25s ease-out 0.05s, transform 0.25s ease-out 0.05s" }}>
              {/* 头像 */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 12 }}>
                <div className="user-avatar user-avatar--lg" style={{ cursor: "pointer", marginBottom: 12 }}>
                  <span>管</span>
                </div>
                <p style={{ fontSize: 12, color: "#6b5b8a", margin: 0 }}>点击头像上传新图片（最大 2MB）</p>
              </div>

              {/* 昵称 */}
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6b5b8a", marginBottom: 6 }}>昵称</label>
                <div style={{ position: "relative" }}>
                  <input type="text" value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="最多4个字符" style={{ width: "100%", height: 44, padding: "0 40px 0 16px", background: "#f8f7ff", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 999, fontSize: 14, color: "#6b5b8a", outline: "none", boxSizing: "border-box" }} />
                  {nickname && (
                    <button type="button" onClick={() => setNickname("")} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", width: 20, height: 20, borderRadius: "50%", background: "rgba(0,0,0,0.06)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ color: "rgba(100,116,139,0.6)" }}>
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              {/* 手机号 */}
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6b5b8a", marginBottom: 6 }}>手机号</label>
                <div style={{ width: "100%", height: 44, padding: "0 16px", background: "#f8f7ff", border: "1px solid rgba(0,0,0,0.04)", borderRadius: 999, fontSize: 14, color: "#6b5b8a", display: "flex", alignItems: "center", boxSizing: "border-box" }}>
                  {phone}
                </div>
              </div>

              {/* 保存按钮 */}
              <button style={{ width: "100%", height: 44, background: "#5b21b6", color: "#fff", border: "none", borderRadius: 999, fontSize: 14, fontWeight: 700, cursor: "pointer", transition: "opacity 0.15s", marginTop: 4 }} onClick={onClose}>
                保存
              </button>
            </div>
          </div>
        </div>

        {/* 修改密码 Tab */}
        <div style={{ display: "grid", gridTemplateRows: editTab === "password" ? "1fr" : "0fr", transition: "grid-template-rows 0.35s cubic-bezier(0.4, 0, 0.2, 1)" }}>
          <div style={{ overflow: "hidden" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 4, opacity: editTab === "password" ? 1 : 0, transform: editTab === "password" ? "translateY(0)" : "translateY(6px)", transition: "opacity 0.25s ease-out 0.05s, transform 0.25s ease-out 0.05s" }}>
              <p style={{ fontSize: 12, color: "#6b5b8a", margin: 0 }}>请输入原密码，并设置新的登录密码</p>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6b5b8a", marginBottom: 6 }}>原密码</label>
                <div style={{ position: "relative" }}>
                  <input type={showPwd1 ? "text" : "password"} placeholder="请输入原密码" style={{ width: "100%", height: 44, padding: "0 40px 0 16px", background: "#f8f7ff", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 999, fontSize: 14, color: "#6b5b8a", outline: "none", boxSizing: "border-box" }} />
                  <button type="button" onClick={() => setShowPwd1(!showPwd1)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", width: 24, height: 24, background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {showPwd1 ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(100,116,139,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/></svg> : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(100,116,139,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>}
                  </button>
                </div>
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6b5b8a", marginBottom: 6 }}>新密码</label>
                <div style={{ position: "relative" }}>
                  <input type={showPwd2 ? "text" : "password"} placeholder="不少于8位，含字母和数字" style={{ width: "100%", height: 44, padding: "0 40px 0 16px", background: "#f8f7ff", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 999, fontSize: 14, color: "#6b5b8a", outline: "none", boxSizing: "border-box" }} />
                  <button type="button" onClick={() => setShowPwd2(!showPwd2)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", width: 24, height: 24, background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {showPwd2 ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(100,116,139,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/></svg> : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(100,116,139,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>}
                  </button>
                </div>
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6b5b8a", marginBottom: 6 }}>确认新密码</label>
                <div style={{ position: "relative" }}>
                  <input type={showPwd3 ? "text" : "password"} placeholder="再次输入新密码" style={{ width: "100%", height: 44, padding: "0 40px 0 16px", background: "#f8f7ff", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 999, fontSize: 14, color: "#6b5b8a", outline: "none", boxSizing: "border-box" }} />
                  <button type="button" onClick={() => setShowPwd3(!showPwd3)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", width: 24, height: 24, background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {showPwd3 ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(100,116,139,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/></svg> : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(100,116,139,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>}
                  </button>
                </div>
              </div>
              <button style={{ width: "100%", height: 44, background: "#5b21b6", color: "#fff", border: "none", borderRadius: 999, fontSize: 14, fontWeight: 700, cursor: "pointer", marginTop: 4 }} onClick={onClose}>修改密码</button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
