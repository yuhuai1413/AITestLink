import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE = "http://localhost:8001/api";

let toastState: { message: string; type: "success" | "error" } | null = null;
let toastListeners: Array<() => void> = [];
function showToast(message: string, type: "success" | "error") {
  toastState = { message, type };
  toastListeners.forEach((l) => l());
  setTimeout(() => { toastState = null; toastListeners.forEach((l) => l()); }, 3000);
}
function useToast() {
  const [, f] = useState(0);
  useEffect(() => { const l = () => f((n) => n + 1); toastListeners.push(l); return () => { toastListeners = toastListeners.filter((x) => x !== l); }; }, []);
  return toastState;
}

function LogoIcon({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 2L3 7v10l9 5 9-5V7l-9-5z" stroke="white" strokeWidth="1.8" strokeLinejoin="round" fill="rgba(255,255,255,0.1)" />
      <path d="M8.5 12.5l2.5 2.5 5-5.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="18.5" cy="5.5" r="1.5" fill="white" opacity="0.7" />
    </svg>
  );
}

const orbitIcons = [
  '<rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>',
  '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
];
const orbitCount = 6, orbitRadius = 96, orbitCenter = 130;
const orbitPositions = Array.from({ length: orbitCount }, (_, i) => {
  const a = (i / orbitCount) * 2 * Math.PI - Math.PI / 2;
  return { left: Math.round(orbitCenter + orbitRadius * Math.cos(a) - 24) + 1, top: Math.round(orbitCenter + orbitRadius * Math.sin(a) - 24) + 1 };
});
const btnGradient = "linear-gradient(135deg, #4c1d95 0%, #7c3aed 40%, #6d28d9 60%, #5b21b6 100%)";
const ROLE_TEXTS = ["需求解析", "测试设计", "用例生成", "自动化测试", "质量报告"];

export function LoginPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const btnRef = useRef<HTMLButtonElement>(null);
  const [isRegister, setIsRegister] = useState(false);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [captchaId, setCaptchaId] = useState("");
  const [captchaCode, setCaptchaCode] = useState("");
  const [captchaValue, setCaptchaValue] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [roleIndex, setRoleIndex] = useState(0);
  const [roleVisible, setRoleVisible] = useState(true);

  useEffect(() => {
    const t = setInterval(() => { setRoleVisible(false); setTimeout(() => { setRoleIndex((p) => (p + 1) % ROLE_TEXTS.length); setRoleVisible(true); }, 360); }, 2400);
    return () => clearInterval(t);
  }, []);

  const loadCaptcha = async () => {
    try { const r = await fetch(`${API_BASE}/auth/captcha`); const d = await r.json(); setCaptchaId(d.captcha_id); setCaptchaValue(d.code); } catch {}
  };
  useEffect(() => { loadCaptcha(); }, []);

  const onBtnMove = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    if (loading) return; const btn = btnRef.current; if (!btn) return;
    const rect = btn.getBoundingClientRect();
    btn.style.background = `radial-gradient(circle at ${((e.clientX - rect.left) / rect.width) * 100}% ${((e.clientY - rect.top) / rect.height) * 100}%, rgba(167,139,250,0.5) 0%, transparent 50%), ${btnGradient}`;
  }, [loading]);
  const onBtnLeave = useCallback(() => { if (!loading && btnRef.current) btnRef.current.style.background = btnGradient; }, [loading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || phone.length !== 11) { showToast("请输入正确的手机号", "error"); return; }
    if (!password || password.length < 6) { showToast("密码长度至少6位", "error"); return; }
    if (!captchaCode) { showToast("请输入验证码", "error"); return; }
    if (isRegister && password !== confirmPassword) { showToast("两次密码输入不一致", "error"); return; }
    setLoading(true);
    try {
      const url = isRegister ? `${API_BASE}/auth/register` : `${API_BASE}/auth/login`;
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, password, captcha_id: captchaId, captcha_code: captchaCode }) });
      const d = await r.json();
      if (d.ok) { showToast(d.message, "success"); if (!isRegister && d.token) { localStorage.setItem("token", d.token); localStorage.setItem("user", JSON.stringify(d.user)); setTimeout(() => navigate("/"), 500); } else { setIsRegister(false); setPassword(""); setConfirmPassword(""); setCaptchaCode(""); loadCaptcha(); } }
      else { showToast(d.message || "操作失败", "error"); loadCaptcha(); setCaptchaCode(""); }
    } catch { showToast("网络错误，请重试", "error"); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {toast && <div className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-xl text-sm font-medium shadow-lg ${toast.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}><span>{toast.type === "success" ? "✓ " : "✕ "}{toast.message}</span></div>}
      {/* 左侧视觉区 */}
      <div className="hidden md:flex md:w-[61.8%] relative flex-col overflow-hidden" style={{ background: "linear-gradient(145deg, #160b3e 0%, #2e1278 40%, #5b21b6 100%)" }}>
        <div className="absolute rounded-full pointer-events-none w-[420px] h-[420px] xl:w-[560px] xl:h-[560px] animate-blob-drift-1" style={{ background: "radial-gradient(circle, rgba(124,58,237,0.38) 0%, transparent 68%)", top: "-100px", right: "-80px" }} />
        <div className="absolute rounded-full pointer-events-none w-[320px] h-[320px] xl:w-[420px] xl:h-[420px] animate-blob-drift-2" style={{ background: "radial-gradient(circle, rgba(99,102,241,0.28) 0%, transparent 70%)", bottom: "-80px", left: "-60px" }} />
        <div className="absolute rounded-full pointer-events-none w-[240px] h-[240px] xl:w-[320px] xl:h-[320px] animate-blob-drift-3" style={{ background: "radial-gradient(circle, rgba(167,139,250,0.18) 0%, transparent 70%)", top: "48%", left: "28%" }} />
        <div className="relative z-10 flex flex-col h-full px-10 xl:px-14 pt-6 pb-8 xl:pt-8 xl:pb-10">
          <div className="flex items-center gap-3 animate-stagger-1">
            <div className="w-11 h-11 xl:w-12 xl:h-12 rounded-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.16)", border: "1.5px solid rgba(255,255,255,0.24)" }}><LogoIcon size={30} /></div>
            <span className="text-2xl xl:text-[1.75rem] font-bold text-white" style={{ fontFamily: "var(--font-serif)" }}>智测通</span>
          </div>
          <div className="flex-1 flex flex-col">
            <div className="flex-1 flex flex-col items-center justify-center text-center animate-stagger-1">
              <p className="text-white/40 text-xs xl:text-sm font-bold tracking-[0.25em] uppercase mb-5">AI 智能测试平台</p>
              <h1 className="text-5xl xl:text-6xl font-black text-white leading-tight mb-4" style={{ fontFamily: "var(--font-serif)" }}>智能测试</h1>
              <div className="flex items-baseline justify-center gap-2">
                <span className="text-2xl xl:text-3xl text-white/55 font-bold">专为</span>
                <span className="text-3xl xl:text-4xl font-black text-transparent bg-clip-text inline-block" style={{ backgroundImage: "linear-gradient(90deg,#c4b5fd,#f97316,#c4b5fd)", backgroundSize: "200% auto", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", animation: "gradShift 3s linear infinite", opacity: roleVisible ? 1 : 0, transform: roleVisible ? "translateY(0)" : "translateY(8px)", transition: "opacity 0.35s ease, transform 0.35s ease", display: "inline-block", minWidth: "5em", textAlign: "center" }}>{ROLE_TEXTS[roleIndex]}</span>
                <span className="text-2xl xl:text-3xl text-white/55 font-bold">而生</span>
              </div>
            </div>
            <div className="flex-1 flex items-center justify-center animate-stagger-2">
              <div className="origin-center xl:scale-[1.23] transition-transform">
                <div className="relative w-[260px] h-[260px] mt-4 xl:mt-6">
                  <svg className="absolute inset-0 w-full h-full" viewBox="0 0 260 260"><circle cx="130" cy="130" r="102" stroke="rgba(255,255,255,0.13)" strokeWidth="1.5" fill="none" strokeDasharray="5 5" /></svg>
                  <div className="absolute inset-0 animate-orb">
                    {orbitIcons.map((path, i) => (<div key={i} className="absolute w-12 h-12 rounded-full flex items-center justify-center animate-orb-reverse" style={{ left: orbitPositions[i].left + 1, top: orbitPositions[i].top + 1, background: "rgba(255,255,255,0.11)", border: "1px solid rgba(255,255,255,0.3)" }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: path }} /></div>))}
                  </div>
                  <div className="absolute w-[72px] h-[72px] rounded-full flex items-center justify-center animate-pulse-glow" style={{ top: "50%", left: "50%", transform: "translate(-50%,-50%)", background: "rgba(255,255,255,0.18)", border: "2px solid rgba(255,255,255,0.3)", backdropFilter: "blur(40px) saturate(2.0) brightness(1.05) contrast(1.05)" }}><LogoIcon size={32} /></div>
                </div>
              </div>
            </div>
            <div className="flex-1 flex flex-col items-center justify-center gap-6 xl:gap-8 animate-stagger-3">
              <div className="flex justify-center">
                <div className="grid w-full max-w-[480px] xl:max-w-[560px] grid-cols-3 gap-2 xl:gap-3">
                  {[{ label: "AI 需求解析", icon: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" }, { label: "智能测试设计", icon: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" }, { label: "自动化测试", icon: "M9 11l3 3L22 4" }].map(({ label, icon }) => (
                    <div key={label} className="h-11 xl:h-12 min-w-0 rounded-full flex items-center justify-center gap-2 px-3 xl:px-4" style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.14)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)" }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c4b5fd" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={icon} /></svg>
                      <span className="text-sm xl:text-base text-white/80 font-semibold whitespace-nowrap">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <p className="text-center text-base xl:text-lg font-bold text-white/55 tracking-wide animate-stagger-4">专业测试设计 · AI 智能生成 · 质量闭环管理</p>
            </div>
          </div>
        </div>
      </div>
      {/* 右侧表单区 */}
      <div className="w-full md:w-[38.2%] md:min-w-[300px] flex flex-col items-center justify-center px-5 sm:px-6 py-8 sm:py-12 min-h-screen md:min-h-0" style={{ background: "#f8f7ff" }}>
        <div className="w-full max-w-[380px]">
          <h2 className="text-2xl font-black mb-1" style={{ color: "#1a1040", fontFamily: "var(--font-serif)" }}>{isRegister ? "注册新账号" : "欢迎使用智测通"}</h2>
          <p className="text-sm mb-6 leading-relaxed" style={{ color: "#6b5b8a" }}>{isRegister ? "注册后即可使用 AI 测试平台" : "登录后台，管理测试平台"}</p>
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <div className="relative h-[52px] sm:h-[58px] flex items-center w-full overflow-hidden rounded-[29px]" style={{ background: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.4)", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", transition: "all 0.3s" }}>
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="请输入手机号" maxLength={11} className="flex-1 border-0 shadow-none bg-transparent h-full pl-5 pr-10 text-[15px] outline-none" style={{ color: "#1a1a2e" }} />
              </div>
            </div>
            <div className="mb-4">
              <div className="relative h-[52px] sm:h-[58px] flex items-center w-full overflow-hidden rounded-[29px]" style={{ background: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.4)", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", transition: "all 0.3s" }}>
                <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="请输入密码" className="flex-1 border-0 shadow-none bg-transparent h-full pl-5 pr-20 text-[15px] outline-none" style={{ color: "#1a1a2e" }} />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  <button type="button" className="w-5 h-5 rounded-full flex items-center justify-center" style={{ transition: "background 0.2s" }} onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(107,91,138,0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg> : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(107,91,138,0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>}
                  </button>
                </div>
              </div>
            </div>
            {isRegister && <div className="mb-4"><div className="relative h-[52px] sm:h-[58px] flex items-center w-full overflow-hidden rounded-[29px]" style={{ background: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.4)", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}><input type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="请确认密码" className="flex-1 border-0 shadow-none bg-transparent h-full pl-5 pr-10 text-[15px] outline-none" style={{ color: "#1a1a2e" }} /></div></div>}
            <div className="mb-4">
              <div className="flex gap-3 items-center w-full">
                <div className="relative h-[52px] sm:h-[58px] flex items-center flex-1 overflow-hidden rounded-[29px]" style={{ background: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.4)", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
                  <input type="text" value={captchaCode} onChange={(e) => setCaptchaCode(e.target.value)} placeholder="请输入验证码" maxLength={4} className="flex-1 border-0 shadow-none bg-transparent h-full pl-5 pr-4 text-[15px] outline-none" style={{ color: "#1a1a2e" }} />
                </div>
                <div className="h-[52px] sm:h-[58px] w-[130px] flex-shrink-0 overflow-hidden cursor-pointer flex items-center justify-center" style={{ background: "linear-gradient(135deg, #e0e7ff, #c7d2fe)", borderRadius: "8px" }} onClick={loadCaptcha} title="点击刷新验证码">
                  <span style={{ fontSize: "24px", fontWeight: 700, color: "#4c1d95", letterSpacing: "8px", fontFamily: "'Courier New', monospace" }}>{captchaValue}</span>
                </div>
              </div>
            </div>
            <button ref={btnRef} type="submit" className="relative w-full h-[52px] sm:h-[58px] rounded-[29px] text-sm font-bold text-white mb-3 border transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer" style={{ borderColor: "rgba(255,255,255,0.3)", boxShadow: "0 4px 16px rgba(0,0,0,0.08)", background: loading ? "linear-gradient(to right, #a78bfa, #c4b5fd, #a78bfa)" : btnGradient }} disabled={loading} onMouseMove={onBtnMove} onMouseLeave={onBtnLeave}>
              {!loading && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>}
              {loading ? "处理中..." : isRegister ? "注册" : "登录"}
            </button>
          </form>
          <div className="flex items-center justify-center gap-2 mt-2 mb-2">
            {isRegister ? <button type="button" className="text-sm text-muted-foreground hover:text-primary p-0 h-auto" style={{ color: "#6b5b8a" }} onClick={() => { setIsRegister(false); setPassword(""); setCaptchaCode(""); loadCaptcha(); }}>返回登录</button> : <>
              <button type="button" className="text-sm text-muted-foreground hover:text-primary p-0 h-auto" style={{ color: "#6b5b8a" }} onClick={() => { setIsRegister(true); setPassword(""); setCaptchaCode(""); loadCaptcha(); }}>注册新账号</button>
              <span style={{ color: "rgba(107,91,138,0.4)" }}>|</span>
              <button type="button" className="text-sm text-muted-foreground hover:text-primary p-0 h-auto" style={{ color: "#6b5b8a" }} onClick={() => navigate("/")}>找回密码</button>
              <span style={{ color: "rgba(107,91,138,0.4)" }}>|</span>
            </>}
            <button type="button" className="text-sm text-muted-foreground hover:text-primary p-0 h-auto" style={{ color: "#6b5b8a" }} onClick={() => navigate("/")}>跳过，先体验一下 →</button>
          </div>
        </div>
      </div>
    </div>
  );
}
