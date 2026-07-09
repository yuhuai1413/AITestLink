import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, X } from "lucide-react";
import { updateProfile, uploadAvatar, changePassword } from "../auth/api/auth";
import { toast } from "../auth/components/ToastProvider";

type TabKey = "info" | "password";

interface PersonalSettingsModalProps {
  open: boolean;
  onClose: () => void;
  userInfo: { nickname: string; phone: string; avatar: string };
  onSaved: () => void;
}

export function PersonalSettingsModal({ open, onClose, userInfo, onSaved }: PersonalSettingsModalProps) {
  const [tab, setTab] = useState<TabKey>("info");
  const [nickname, setNickname] = useState("");
  const [phone, setPhone] = useState("");
  const [avatar, setAvatar] = useState("");
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [showOldPwd, setShowOldPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [changingPwd, setChangingPwd] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTab("info");
    setNickname(userInfo.nickname);
    setPhone(userInfo.phone);
    setAvatar(userInfo.avatar);
    setOldPwd("");
    setNewPwd("");
    setConfirmPwd("");
  }, [open, userInfo]);

  const handleAvatarClick = () => fileInputRef.current?.click();

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error("图片大小不能超过 2MB"); return; }
    if (!file.type.startsWith("image/")) { toast.error("请上传图片文件"); return; }
    try {
      const res = await uploadAvatar(file);
      if (res.ok) { setAvatar(res.avatar); toast.success("头像上传成功"); onSaved(); }
      else { toast.error(res.message); }
    } catch { toast.error("上传失败"); }
    e.target.value = "";
  };

  const handleSave = async () => {
    if (!nickname.trim()) { toast.error("请输入昵称"); return; }
    setSaving(true);
    try {
      const res = await updateProfile(nickname.trim());
      if (res.ok) { toast.success("保存成功"); onSaved(); onClose(); }
      else { toast.error(res.message); }
    } catch { toast.error("保存失败"); }
    finally { setSaving(false); }
  };

  const handleChangePassword = async () => {
    if (!oldPwd) { toast.error("请输入原密码"); return; }
    if (!newPwd || newPwd.length < 8) { toast.error("新密码长度不能少于8位"); return; }
    if (!/[a-zA-Z]/.test(newPwd)) { toast.error("新密码必须包含字母"); return; }
    if (!/\d/.test(newPwd)) { toast.error("新密码必须包含数字"); return; }
    if (newPwd !== confirmPwd) { toast.error("两次密码输入不一致"); return; }
    setChangingPwd(true);
    try {
      const res = await changePassword(oldPwd, newPwd);
      if (res.ok) { toast.success("密码修改成功"); setOldPwd(""); setNewPwd(""); setConfirmPwd(""); onClose(); }
      else { toast.error(res.message); }
    } catch { toast.error("修改失败"); }
    finally { setChangingPwd(false); }
  };

  if (!open) return null;
  const initial = nickname ? nickname.charAt(0) : "用";
  const tabs: { key: TabKey; label: string }[] = [{ key: "info", label: "基本信息" }, { key: "password", label: "修改密码" }];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)", animation: "dialogOverlayIn 0.3s cubic-bezier(0.22, 1, 0.36, 1) both" }} onClick={onClose} />
      <div style={{ position: "relative", width: 460, background: "#fff", zIndex: 10, padding: 24, borderRadius: 38, animation: "dialogContentIn 0.4s cubic-bezier(0.22, 1, 0.36, 1) both" }}>
        <button onClick={onClose} style={{ position: "absolute", top: 16, right: 16, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.4)", borderRadius: "50%", border: "none", cursor: "pointer" }}>
          <X size={16} style={{ color: "#6b5b8a" }} />
        </button>

        <h2 style={{ margin: "0 0 16px", fontSize: 18, fontWeight: 800, color: "#1a1040", fontFamily: "var(--font-serif)" }}>编辑个人信息</h2>

        {/* Tab 切换 */}
        <div style={{ display: "flex", marginBottom: 20 }}>
          <div style={{ position: "relative", display: "flex", background: "#f8f7ff", borderRadius: 999, padding: 3, width: "100%" }}>
            <div style={{ position: "absolute", top: 3, bottom: 3, left: 3, width: "calc(50% - 2px)", borderRadius: 999, background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)", transform: `translateX(${tab === "password" ? "100%" : "0%"})`, transition: "transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)" }} />
            {tabs.map((t) => (
              <button key={t.key} type="button" onClick={() => setTab(t.key)} style={{ position: "relative", zIndex: 10, flex: 1, padding: "8px 0", border: "none", background: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, color: tab === t.key ? "#1a1040" : "#6b5b8a", borderRadius: 999, transition: "color 0.25s" }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* 基本信息 Tab */}
        <div style={{ display: "grid", gridTemplateRows: tab === "info" ? "1fr" : "0fr", transition: "grid-template-rows 0.35s cubic-bezier(0.4, 0, 0.2, 1)" }}>
          <div style={{ overflow: "hidden" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 4, opacity: tab === "info" ? 1 : 0, transform: tab === "info" ? "translateY(0)" : "translateY(6px)", transition: "opacity 0.25s ease-out 0.05s, transform 0.25s ease-out 0.05s" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 12 }}>
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleAvatarChange} />
              <div onClick={handleAvatarClick} style={{ cursor: "pointer", marginBottom: 12, position: "relative" }}>
                <div className="user-avatar user-avatar--lg" style={avatar ? { backgroundImage: `url(${avatar})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}>
                  {!avatar && <span>{initial}</span>}
                </div>
                <div style={{ position: "absolute", bottom: 0, right: 0, width: 24, height: 24, borderRadius: "50%", background: "#5b21b6", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #fff" }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                </div>
              </div>
              <p style={{ fontSize: 12, color: "#6b5b8a", margin: 0 }}>点击头像上传新图片（最大 2MB）</p>
            </div>

            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6b5b8a", marginBottom: 6 }}>昵称</label>
              <div style={{ position: "relative" }}>
                <input type="text" value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="请输入昵称" style={{ width: "100%", height: 44, padding: "0 40px 0 16px", background: "#f8f7ff", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 999, fontSize: 14, color: "#6b5b8a", outline: "none", boxSizing: "border-box" }} />
                {nickname && <button type="button" onClick={() => setNickname("")} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", width: 20, height: 20, borderRadius: "50%", background: "rgba(0,0,0,0.06)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ color: "rgba(100,116,139,0.6)" }}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>}
              </div>
            </div>

            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6b5b8a", marginBottom: 6 }}>手机号</label>
              <div style={{ width: "100%", height: 44, padding: "0 16px", background: "#f8f7ff", border: "1px solid rgba(0,0,0,0.04)", borderRadius: 999, fontSize: 14, color: "#6b5b8a", display: "flex", alignItems: "center", boxSizing: "border-box" }}>{phone}</div>
            </div>

            <button disabled={saving} onClick={handleSave} style={{ width: "100%", height: 44, background: saving ? "#a78bfa" : "#5b21b6", color: "#fff", border: "none", borderRadius: 999, fontSize: 14, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", marginTop: 4 }}>
              {saving ? "保存中..." : "保存"}
            </button>
            </div>
          </div>
        </div>

        {/* 修改密码 Tab */}
        <div style={{ display: "grid", gridTemplateRows: tab === "password" ? "1fr" : "0fr", transition: "grid-template-rows 0.35s cubic-bezier(0.4, 0, 0.2, 1)" }}>
          <div style={{ overflow: "hidden" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 4, opacity: tab === "password" ? 1 : 0, transform: tab === "password" ? "translateY(0)" : "translateY(6px)", transition: "opacity 0.25s ease-out 0.05s, transform 0.25s ease-out 0.05s" }}>
            <p style={{ fontSize: 12, color: "#6b5b8a", margin: 0 }}>请输入原密码，并设置新的登录密码</p>

            {[
              { label: "原密码", value: oldPwd, onChange: setOldPwd, show: showOldPwd, onToggle: () => setShowOldPwd(!showOldPwd), placeholder: "请输入原密码" },
              { label: "新密码", value: newPwd, onChange: setNewPwd, show: showNewPwd, onToggle: () => setShowNewPwd(!showNewPwd), placeholder: "不少于8位，含字母和数字" },
              { label: "确认新密码", value: confirmPwd, onChange: setConfirmPwd, show: showConfirmPwd, onToggle: () => setShowConfirmPwd(!showConfirmPwd), placeholder: "再次输入新密码" },
            ].map(({ label, value, onChange, show, onToggle, placeholder }) => (
              <div key={label}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6b5b8a", marginBottom: 6 }}>{label}</label>
                <div style={{ position: "relative" }}>
                  <input type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={{ width: "100%", height: 44, padding: "0 40px 0 16px", background: "#f8f7ff", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 999, fontSize: 14, color: "#6b5b8a", outline: "none", boxSizing: "border-box" }} />
                  <button type="button" onClick={onToggle} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", width: 24, height: 24, background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {show ? <EyeOff size={16} style={{ color: "rgba(100,116,139,0.5)" }} /> : <Eye size={16} style={{ color: "rgba(100,116,139,0.5)" }} />}
                  </button>
                </div>
              </div>
            ))}

            <button disabled={changingPwd} onClick={handleChangePassword} style={{ width: "100%", height: 44, background: changingPwd ? "#a78bfa" : "#5b21b6", color: "#fff", border: "none", borderRadius: 999, fontSize: 14, fontWeight: 700, cursor: changingPwd ? "not-allowed" : "pointer", marginTop: 4 }}>
              {changingPwd ? "修改中..." : "修改密码"}
            </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
