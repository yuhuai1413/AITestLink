import { useEffect, useRef, useState } from "react";
import { Camera, Eye, EyeOff, X } from "lucide-react";
import { updateProfile, uploadAvatar, changePassword } from "../auth/api/auth";
import { toast } from "../auth/components/ToastProvider";
import { Modal } from "../../shared/components/Modal";

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
      if (res.ok) { toast.success("保存成功"); onSaved(); window.dispatchEvent(new Event("profile-updated")); onClose(); }
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

  const initial = nickname ? nickname.charAt(0) : "用";
  const tabs: { key: TabKey; label: string }[] = [{ key: "info", label: "基本信息" }, { key: "password", label: "修改密码" }];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="编辑个人信息"
      width={460}
      footer={<>
        <button className="ghost-button" type="button" onClick={onClose}>取消</button>
        {tab === "info" ? (
          <button className="primary-button" type="button" disabled={saving} onClick={handleSave}>
            {saving ? "保存中..." : "保存"}
          </button>
        ) : (
          <button className="primary-button" type="button" disabled={changingPwd} onClick={handleChangePassword}>
            {changingPwd ? "修改中..." : "修改密码"}
          </button>
        )}
      </>}
    >
      <div className="personal-settings">
        <div className="segmented-tabs" role="tablist" aria-label="个人设置">
          <span className={`segmented-tabs__indicator segmented-tabs__indicator--${tab}`} />
          {tabs.map((item) => (
            <button
              key={item.key}
              className={tab === item.key ? "segmented-tabs__button segmented-tabs__button--active" : "segmented-tabs__button"}
              type="button"
              role="tab"
              aria-selected={tab === item.key}
              onClick={() => setTab(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className={tab === "info" ? "personal-settings__panel personal-settings__panel--active" : "personal-settings__panel"} hidden={tab !== "info"}>
          <div className="personal-settings__avatar-block">
            <input ref={fileInputRef} className="personal-settings__file-input" type="file" accept="image/*" onChange={handleAvatarChange} />
            <button className="personal-settings__avatar-button" type="button" onClick={handleAvatarClick} title="上传头像">
              <span className="user-avatar user-avatar--lg" style={avatar ? { backgroundImage: `url(${avatar})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}>
                {!avatar && <span>{initial}</span>}
              </span>
              <span className="personal-settings__avatar-badge">
                <Camera size={12} />
              </span>
            </button>
            <p className="personal-settings__hint">点击头像上传新图片（最大 2MB）</p>
          </div>

          <div className="form-stack">
            <label className="form-label">
              昵称
              <span className="form-field">
                <input className="form-input form-input--pill form-input--with-action" type="text" value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="请输入昵称" />
                {nickname ? (
                  <button className="form-input-action" type="button" onClick={() => setNickname("")} title="清空昵称">
                    <X size={13} />
                  </button>
                ) : null}
              </span>
            </label>

            <label className="form-label">
              手机号
              <span className="form-input form-input--pill form-input-display">{phone || "-"}</span>
            </label>
          </div>
        </div>

        <div className={tab === "password" ? "personal-settings__panel personal-settings__panel--active" : "personal-settings__panel"} hidden={tab !== "password"}>
          <p className="personal-settings__hint personal-settings__hint--left">请输入原密码，并设置新的登录密码</p>
          <div className="form-stack">
            {[
              { label: "原密码", value: oldPwd, onChange: setOldPwd, show: showOldPwd, onToggle: () => setShowOldPwd(!showOldPwd), placeholder: "请输入原密码" },
              { label: "新密码", value: newPwd, onChange: setNewPwd, show: showNewPwd, onToggle: () => setShowNewPwd(!showNewPwd), placeholder: "不少于8位，含字母和数字" },
              { label: "确认新密码", value: confirmPwd, onChange: setConfirmPwd, show: showConfirmPwd, onToggle: () => setShowConfirmPwd(!showConfirmPwd), placeholder: "再次输入新密码" },
            ].map(({ label, value, onChange, show, onToggle, placeholder }) => (
              <label className="form-label" key={label}>
                {label}
                <span className="form-field">
                  <input className="form-input form-input--pill form-input--with-action" type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
                  <button className="form-input-action" type="button" onClick={onToggle} title={show ? "隐藏密码" : "显示密码"}>
                    {show ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
