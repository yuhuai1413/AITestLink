import { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff, Sparkles, FileSearch, ListChecks, PlayCircle, ClipboardCheck, LayoutDashboard } from "lucide-react";

import { Button } from "./components/Button";
import { Input } from "./components/Input";
import { useTypeCycle } from "./hooks/useTypeCycle";
import { cn, iosRadius, loginStyles, pageStyles } from "./styles/pageStyles";
import { getCaptcha, register, login } from "./api/auth";
import { toast } from "./components/ToastProvider";

type MainTab = "login" | "register";

const ROLE_TEXTS = ["需求解析", "测试设计", "用例生成", "自动化测试", "质量报告"];

const ORBIT_ICONS = [FileSearch, ListChecks, PlayCircle, ClipboardCheck, LayoutDashboard];

const orbitPositions = ORBIT_ICONS.map((_, i) => {
  const angle = (i / ORBIT_ICONS.length) * 2 * Math.PI - Math.PI / 2;
  const r = 96;
  return { left: 128 + r * Math.cos(angle) - 24, top: 128 + r * Math.sin(angle) - 24 };
});

function LogoIcon({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 2L3 7v10l9 5 9-5V7l-9-5z" stroke="white" strokeWidth="1.8" strokeLinejoin="round" fill="rgba(255,255,255,0.1)" />
      <path d="M8.5 12.5l2.5 2.5 5-5.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="18.5" cy="5.5" r="1.5" fill="white" opacity="0.7" />
    </svg>
  );
}

interface LoginPageProps {
  onLogin: () => void;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [mainTab, setMainTab] = useState<MainTab>("login");
  const [phone, setPhone] = useState(() => localStorage.getItem("lastPhone") || "");
  const [password, setPassword] = useState(() => localStorage.getItem("lastPassword") || "");
  const [showPassword, setShowPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [captchaCode, setCaptchaCode] = useState("");
  const [captchaId, setCaptchaId] = useState("");
  const [captchaDisplay, setCaptchaDisplay] = useState("");
  const [loading, setLoading] = useState(false);
  const [tabKey, setTabKey] = useState(0);

  const { text: roleText, visible: roleVisible } = useTypeCycle(ROLE_TEXTS);

  const loadCaptcha = useCallback(async () => {
    try {
      const res = await getCaptcha();
      setCaptchaId(res.captcha_id);
      setCaptchaDisplay(res.code);
    } catch {
      // 静默失败
    }
  }, []);

  useEffect(() => {
    loadCaptcha();
  }, [loadCaptcha]);

  const switchTab = (tab: MainTab) => {
    setMainTab(tab);
    setConfirmPassword("");
    setCaptchaCode("");
    setTabKey((k) => k + 1);
    loadCaptcha();
  };

  const handleSubmit = async () => {
    if (!phone || phone.length !== 11) { toast.error("请输入正确的手机号"); return; }
    if (!password || password.length < 8) { toast.error("密码长度不能少于8位"); return; }
    if (!/[a-zA-Z]/.test(password)) { toast.error("密码必须包含字母"); return; }
    if (!/\d/.test(password)) { toast.error("密码必须包含数字"); return; }
    if (mainTab === "register" && password !== confirmPassword) { toast.error("两次密码输入不一致"); return; }
    if (!captchaCode) { toast.error("请输入验证码"); return; }

    setLoading(true);
    try {
      if (mainTab === "register") {
        const res = await register(phone, password, captchaId, captchaCode);
        if (res.ok) {
          toast.success("注册成功");
          switchTab("login");
        } else {
          toast.error(res.message);
          loadCaptcha();
          setCaptchaCode("");
        }
      } else {
        const res = await login(phone, password, captchaId, captchaCode);
        if (res.ok) {
          localStorage.setItem("lastPhone", phone);
          localStorage.setItem("lastPassword", password);
          toast.success("登录成功");
          onLogin();
        } else {
          toast.error(res.message);
          loadCaptcha();
          setCaptchaCode("");
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "操作失败");
      loadCaptcha();
      setCaptchaCode("");
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    onLogin();
  };

  const ClearButton = ({ onClick }: { onClick: () => void }) => (
    <button type="button" onClick={onClick} className="w-5 h-5 rounded-full bg-black/[0.06] hover:bg-black/[0.12] flex items-center justify-center transition-colors shrink-0">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-muted-foreground/60">
        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  );

  return (
    <div className={cn(loginStyles.shell, "login-page-root")}>
      {/* 手机端左上角 logo */}
      <div className="fixed top-0 left-0 z-50 md:hidden flex items-center gap-2.5 pl-5 pt-5 pr-4 pb-3">
        <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center shadow-md shadow-primary/20">
          <LogoIcon size={22} />
        </div>
        <span className="text-xl font-bold text-foreground" style={{ fontFamily: '"Times New Roman", serif' }}>AITestLink</span>
      </div>

      {/* 左侧视觉区 */}
      <div className={loginStyles.visualSide} style={{ background: "linear-gradient(145deg, #160b3e 0%, #2e1278 40%, #5b21b6 100%)" }}>
        <div className={cn(loginStyles.visualBlob, "w-[420px] h-[420px] xl:w-[560px] xl:h-[560px] animate-blob-drift-1")} style={{ background: "radial-gradient(circle, rgba(124,58,237,0.38) 0%, transparent 68%)", top: "-100px", right: "-80px" }} />
        <div className={cn(loginStyles.visualBlob, "w-[320px] h-[320px] xl:w-[420px] xl:h-[420px] animate-blob-drift-2")} style={{ background: "radial-gradient(circle, rgba(99,102,241,0.28) 0%, transparent 70%)", bottom: "-80px", left: "-60px" }} />
        <div className={cn(loginStyles.visualBlob, "w-[240px] h-[240px] xl:w-[320px] xl:h-[320px] animate-blob-drift-3")} style={{ background: "radial-gradient(circle, rgba(167,139,250,0.18) 0%, transparent 70%)", top: "48%", left: "28%" }} />

        <div className={loginStyles.visualContent}>
          <div className="flex items-center gap-3 animate-stagger-1">
            <div className={loginStyles.visualBrandIcon} style={{ background: "rgba(255,255,255,0.16)", border: "1.5px solid rgba(255,255,255,0.24)" }}>
              <LogoIcon size={30} />
            </div>
            <span className="text-2xl xl:text-[1.75rem] font-bold text-white" style={{ fontFamily: '"Times New Roman", serif' }}>AITestLink</span>
          </div>

          <div className="flex-1 flex flex-col">
            <div className="flex-1 flex flex-col items-center justify-center text-center animate-stagger-1">
              <p className={loginStyles.visualEyebrow}>AI 软件测试平台</p>
              <h1 className="text-5xl xl:text-6xl font-black text-white leading-tight mb-4" style={{ fontFamily: '"Times New Roman", serif' }}>专业智能化测试</h1>
              <div className="flex items-baseline justify-center gap-2">
                <span className="text-2xl xl:text-3xl text-white/55 font-bold">专为</span>
                <span className={loginStyles.roleText} style={{ backgroundImage: "linear-gradient(90deg,#c4b5fd,#f97316,#c4b5fd)", backgroundSize: "200% auto", transition: "opacity 0.35s ease, transform 0.35s ease", opacity: roleVisible ? 1 : 0, transform: roleVisible ? "translateY(0)" : "translateY(8px)", display: "inline-block", minWidth: "5em", textAlign: "center" }}>{roleText}</span>
                <span className="text-2xl xl:text-3xl text-white/55 font-bold">而生</span>
              </div>
            </div>

            <div className="flex-1 flex items-center justify-center animate-stagger-2">
              <div className="origin-center xl:scale-[1.23] transition-transform">
                <div className={loginStyles.orbitWrap}>
                  <svg className="absolute inset-0 w-full h-full" viewBox="0 0 260 260">
                    <circle cx="130" cy="130" r="102" stroke="rgba(255,255,255,0.13)" strokeWidth="1.5" fill="none" strokeDasharray="5 5" />
                  </svg>
                  <div className="absolute inset-0 animate-orb">
                    {ORBIT_ICONS.map((Icon, i) => (
                      <div key={i} className={loginStyles.orbitItem} style={{ left: orbitPositions[i].left + 1, top: orbitPositions[i].top + 1, background: "rgba(255,255,255,0.11)", border: "1px solid rgba(255,255,255,0.3)", backdropFilter: "blur(40px) saturate(2.0) brightness(1.05) contrast(1.05)" }}>
                        <Icon className="w-5 h-5 text-white" />
                      </div>
                    ))}
                  </div>
                  <div className={loginStyles.orbitCore} style={{ top: "50%", left: "50%", transform: "translate(-50%,-50%)", background: "rgba(255,255,255,0.18)", border: "2px solid rgba(255,255,255,0.3)", backdropFilter: "blur(40px) saturate(2.0) brightness(1.05) contrast(1.05)" }}>
                    <Sparkles className="w-8 h-8 text-white" />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center gap-6 xl:gap-8 animate-stagger-3">
              <div className="flex justify-center">
                <div className="grid w-full max-w-[480px] xl:max-w-[560px] grid-cols-3 gap-2 xl:gap-3">
                  {[
                    { label: "AI 需求解析", Icon: FileSearch },
                    { label: "智能测试设计", Icon: ListChecks },
                    { label: "自动化测试", Icon: PlayCircle },
                  ].map(({ label, Icon: PillIcon }) => (
                    <div key={label} className={loginStyles.featurePill} style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.14)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)" }}>
                      <PillIcon className="w-4 h-4 xl:w-5 xl:h-5 text-violet-200" />
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
      <div className={loginStyles.formSide}>
        <div className={loginStyles.formPanel}>
          <style>{`
            @keyframes onAutoFillStart { from { opacity: 0.999; } to { opacity: 1; } }
            .login-field input { border-color: transparent !important; background-color: transparent !important; caret-color: currentColor; }
            .login-field input:-webkit-autofill, .login-field input:-webkit-autofill:hover, .login-field input:-webkit-autofill:focus, .login-field input:-webkit-autofill:active {
              -webkit-box-shadow: 0 0 0 1000px #ffffff inset !important; -webkit-text-fill-color: #1a1a2e !important;
              background-color: #ffffff !important; background-image: none !important; caret-color: currentColor;
              animation-name: onAutoFillStart; animation-duration: 50000s; animation-fill-mode: both;
            }
          `}</style>

          {/* 手机端视觉区域 */}
          <div className="md:hidden mb-4 animate-stagger-5">
            <div className="relative -mx-5 -mt-5 px-5 pt-8 pb-0 overflow-hidden">
              <div className="relative z-10 flex flex-col items-center">
                <p className="text-muted-foreground text-[10px] font-bold tracking-[0.25em] uppercase mb-2 mt-4">AI 软件测试平台</p>
                <h1 className="text-3xl font-black text-foreground leading-tight mb-3" style={{ fontFamily: '"Times New Roman", serif' }}>专业智能化测试</h1>
                <div className="flex items-baseline justify-center gap-1.5 mb-0">
                  <span className="text-lg text-muted-foreground font-bold">专为</span>
                  <span className="text-lg font-bold inline-block" style={{ backgroundImage: "linear-gradient(90deg,#7c3aed,#f97316,#7c3aed)", backgroundSize: "200% auto", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", transition: "opacity 0.35s ease, transform 0.35s ease", opacity: roleVisible ? 1 : 0, transform: roleVisible ? "translateY(0)" : "translateY(8px)", minWidth: "4em", textAlign: "center" }}>{roleText}</span>
                  <span className="text-lg text-muted-foreground font-bold">而生</span>
                </div>
              </div>
            </div>
          </div>

          {/* 手机端特性标签 */}
          <div className="md:hidden grid grid-cols-3 gap-2 mb-4 w-full animate-stagger-5">
            {[{ label: "AI 需求解析", Icon: FileSearch }, { label: "智能测试设计", Icon: ListChecks }, { label: "自动化测试", Icon: PlayCircle }].map(({ label, Icon: PillIcon }) => (
              <div key={label} className="h-8 flex items-center justify-center gap-1.5 px-2 rounded-full text-[11px] font-semibold bg-primary/5 border border-primary/10 text-primary/70">
                <PillIcon className="w-3 h-3 shrink-0" />
                <span className="whitespace-nowrap">{label}</span>
              </div>
            ))}
          </div>

          <div key={tabKey} className="animate-[fadeIn_0.3s_ease-out]">
          <h2 className="text-2xl text-foreground mb-1">
            {mainTab === "register" ? <span style={{ fontFamily: "var(--font-serif)" }}>注册新账号</span> : <><span style={{ fontFamily: "var(--font-serif)" }}>欢迎使用</span> <span style={{ fontFamily: '"Times New Roman", serif' }}>AITestLink</span></>}
          </h2>
          <p className={cn(pageStyles.bodyMuted, "mb-6 leading-relaxed animate-stagger-6")}>
            {mainTab === "register" ? "注册后即可使用 AI 测试平台" : "登录账号，开启您的专业智能化测试"}
          </p>

          {/* 手机号 */}
          <div className="mb-4 animate-stagger-7">
            <div className={cn(loginStyles.glassField, "login-field relative h-[52px] sm:h-[58px] flex items-center")}>
              <Input type="tel" maxLength={11} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }} placeholder="请输入手机号" autoComplete="tel" className="flex-1 border-0 shadow-none focus-visible:ring-0 bg-transparent h-full pl-5 pr-10" />
              {phone && <div className="absolute right-3 top-1/2 -translate-y-1/2"><ClearButton onClick={() => setPhone("")} /></div>}
            </div>
          </div>

          {/* 密码 */}
          <div className="mb-4 animate-stagger-8">
            <div className={cn(loginStyles.glassField, "login-field relative h-[52px] sm:h-[58px] flex items-center")}>
              <Input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }} placeholder={mainTab === "register" ? "设置密码（不少于8位，含字母和数字）" : "请输入密码"} autoComplete={mainTab === "register" ? "new-password" : "current-password"} className="flex-1 border-0 shadow-none focus-visible:ring-0 bg-transparent h-full pl-5 pr-20" />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="w-5 h-5 rounded-full flex items-center justify-center hover:bg-black/[0.06] transition-colors">
                  {showPassword ? <EyeOff className="w-3.5 h-3.5 text-muted-foreground/60" /> : <Eye className="w-3.5 h-3.5 text-muted-foreground/60" />}
                </button>
                {password && <ClearButton onClick={() => setPassword("")} />}
              </div>
            </div>
          </div>

          {/* 确认密码（仅注册） */}
          {mainTab === "register" && (
            <div className="mb-4 animate-stagger-8">
              <div className={cn(loginStyles.glassField, "login-field relative h-[52px] sm:h-[58px] flex items-center")}>
                <Input type={showConfirmPassword ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }} placeholder="请确认密码" autoComplete="new-password" className="flex-1 border-0 shadow-none focus-visible:ring-0 bg-transparent h-full pl-5 pr-20" />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="w-5 h-5 rounded-full flex items-center justify-center hover:bg-black/[0.06] transition-colors">
                    {showConfirmPassword ? <EyeOff className="w-3.5 h-3.5 text-muted-foreground/60" /> : <Eye className="w-3.5 h-3.5 text-muted-foreground/60" />}
                  </button>
                  {confirmPassword && <ClearButton onClick={() => setConfirmPassword("")} />}
                </div>
              </div>
            </div>
          )}

          {/* 数字验证码 */}
          <div className="mb-4 animate-stagger-9">
            <div className="flex gap-3 items-center w-full">
              <div className={cn(loginStyles.glassField, "login-field relative h-[52px] sm:h-[58px] flex items-center flex-1")}>
                <Input type="text" value={captchaCode} onChange={(e) => setCaptchaCode(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }} placeholder="请输入验证码" maxLength={4} autoComplete="off" className="flex-1 border-0 shadow-none focus-visible:ring-0 bg-transparent h-full pl-5 pr-4" />
              </div>
              <button type="button" onClick={loadCaptcha} className="h-[52px] sm:h-[58px] w-[130px] flex-shrink-0 overflow-hidden cursor-pointer flex items-center justify-center rounded-[29px]" style={{ background: "linear-gradient(135deg, #e0e7ff, #c7d2fe)" }} title="点击刷新验证码">
                <span style={{ fontSize: "24px", fontWeight: 700, color: "#4c1d95", letterSpacing: "8px", fontFamily: "'Courier New', monospace" }}>{captchaDisplay}</span>
              </button>
            </div>
          </div>

          {/* 提交按钮 */}
          <div className="animate-stagger-10">
            <Button variant="ghost" onClick={handleSubmit} disabled={loading} className={cn(`relative w-full h-[52px] sm:h-[58px] ${iosRadius.pill} text-sm font-bold text-white mb-2 border border-white/30 transition-all duration-300`, "shadow-[0_4px_16px_rgba(0,0,0,0.08)] hover:shadow-[0_8px_24px_rgba(91,33,182,0.15)] active:scale-[0.98]", "focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2", !loading ? "bg-gradient-to-r from-violet-700 via-purple-600 to-violet-700 hover:shadow-[0_8px_28px_rgba(91,33,182,0.3)] hover:scale-[1.01] active:scale-[0.98] cursor-pointer" : "bg-gradient-to-r from-violet-400 via-purple-300 to-violet-400 text-white cursor-not-allowed shadow-none hover:shadow-none hover:scale-100 opacity-100")} onMouseMove={(e) => { if (loading) return; const rect = e.currentTarget.getBoundingClientRect(); e.currentTarget.style.background = `radial-gradient(circle at ${((e.clientX - rect.left) / rect.width) * 100}% ${((e.clientY - rect.top) / rect.height) * 100}%, rgba(167,139,250,0.5) 0%, transparent 50%), linear-gradient(135deg, #4c1d95 0%, #7c3aed 40%, #6d28d9 60%, #5b21b6 100%)`; }} onMouseLeave={(e) => { if (!loading) e.currentTarget.style.background = ""; }}>
              <span className="relative z-10 flex items-center justify-center gap-2">
                <Sparkles className="w-4 h-4" />
                {loading ? "处理中..." : mainTab === "register" ? "注册" : "登录"}
              </span>
            </Button>
          </div>

          {/* 导航链接 */}
          <div className="flex items-center justify-center gap-2 mt-2 mb-2 animate-stagger-11">
            {mainTab === "login" ? (
              <Button variant="link" onClick={() => switchTab("register")} className="text-sm text-muted-foreground hover:text-primary p-0 h-auto">注册新账号</Button>
            ) : (
              <Button variant="link" onClick={() => switchTab("login")} className="text-sm text-muted-foreground hover:text-primary p-0 h-auto">返回登录</Button>
            )}
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}
