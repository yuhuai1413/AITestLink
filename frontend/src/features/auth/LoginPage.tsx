import { useCallback, useEffect, useState } from "react";
import { BarChart3, Code2, FileCheck2, FileSearch, FileText, ListChecks, ServerCog, Sparkles } from "lucide-react";

import { Button } from "./components/Button";
import { useTypeCycle } from "./hooks/useTypeCycle";
import { cn, loginStyles, pageStyles } from "./styles/pageStyles";
import { getCaptcha, register, login } from "./api/auth";
import { toast } from "./components/ToastProvider";
import { LogoMark } from "./components/LogoMark";
import { CaptchaField, LoginBrandText, LoginField, LoginSerifText, LoginSubmitButton } from "./components/LoginFormControls";

type MainTab = "login" | "register";

const KEY_FLOWS = [
  { label: "环境配置", Icon: ServerCog },
  { label: "需求分析", Icon: FileSearch },
  { label: "测试点生成", Icon: ListChecks },
  { label: "用例生成", Icon: FileCheck2 },
  { label: "自动化脚本", Icon: Code2 },
  { label: "数据汇总", Icon: BarChart3 },
  { label: "文档生成", Icon: FileText },
];

const ROLE_TEXTS = KEY_FLOWS.map((item) => item.label);

const ORBIT_ICONS = KEY_FLOWS.map((item) => item.Icon);

const orbitPositions = ORBIT_ICONS.map((_, i) => {
  const angle = (i / ORBIT_ICONS.length) * 2 * Math.PI - Math.PI / 2;
  const r = 96;
  return { left: 128 + r * Math.cos(angle) - 24, top: 128 + r * Math.sin(angle) - 24 };
});



interface LoginPageProps {
  onLogin: () => void;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [mainTab, setMainTab] = useState<MainTab>("login");
  const [phone, setPhone] = useState(() => localStorage.getItem("lastPhone") || "");
  const [password, setPassword] = useState("");
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
      toast.error("验证码加载失败，请检查后端服务后重试");
    }
  }, []);

  useEffect(() => {
    // 旧版本曾将明文密码写入 localStorage。启动登录页时主动清理，
    // 后续只保留账号，绝不在浏览器持久化用户密码。
    localStorage.removeItem("lastPassword");
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

          // 仅记住登录账号，密码不得持久化到浏览器存储。
          localStorage.setItem("lastPhone", phone);
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

  return (
    <div className={cn(loginStyles.shell, "login-page-root")}>
      {/* 手机端左上角 logo */}
      <div className="fixed top-0 left-0 z-50 md:hidden flex items-center gap-2.5 pl-5 pt-5 pr-4 pb-3">
        <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center shadow-md shadow-primary/20">
          <LogoMark size={30} />
        </div>
        <LoginBrandText className="text-xl font-bold text-foreground">AITestLink</LoginBrandText>
      </div>

      {/* 左侧视觉区 */}
      <div className={cn(loginStyles.visualSide, "login-visual-side")}>
        <div className={cn(loginStyles.visualBlob, "login-visual-blob login-visual-blob--primary animate-blob-drift-1")} />
        <div className={cn(loginStyles.visualBlob, "login-visual-blob login-visual-blob--secondary animate-blob-drift-2")} />
        <div className={cn(loginStyles.visualBlob, "login-visual-blob login-visual-blob--tertiary animate-blob-drift-3")} />

        <div className={loginStyles.visualContent}>
          <div className="flex items-center gap-3 animate-stagger-1">
            <div className={cn(loginStyles.visualBrandIcon, "login-visual-brand-icon")}>
              <LogoMark size={30} />
            </div>
            <LoginBrandText className="text-2xl xl:text-[1.75rem] font-bold text-white">AITestLink</LoginBrandText>
          </div>

          <div className="flex-1 flex flex-col">
            <div className="flex-1 flex flex-col items-center justify-center text-center animate-stagger-1">
              <p className={loginStyles.visualEyebrow}>AI 软件测试平台</p>
              <h1 className="login-hero-title text-5xl xl:text-6xl font-black text-white leading-tight mb-4">专业智能化测试</h1>
              <div className="flex items-baseline justify-center gap-2">
                <span className="text-2xl xl:text-3xl text-white/55 font-bold">专为</span>
                <span className={cn(loginStyles.roleText, roleVisible ? "login-role-text--visible" : "login-role-text--hidden")}>{roleText}</span>
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
                      <div key={KEY_FLOWS[i].label} className={cn(loginStyles.orbitItem, "login-orbit-item")} style={{ left: orbitPositions[i].left + 1, top: orbitPositions[i].top + 1 }} title={KEY_FLOWS[i].label}>
                        <Icon className="w-5 h-5 text-white" />
                      </div>
                    ))}
                  </div>
                  <div className={cn(loginStyles.orbitCore, "login-orbit-core")}>
                    <Sparkles className="w-8 h-8 text-white" />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center gap-6 xl:gap-8 animate-stagger-3">
              <div className="flex justify-center">
                <div className="grid w-full max-w-[480px] xl:max-w-[560px] grid-cols-3 gap-2 xl:gap-3">
                  {[
                    KEY_FLOWS[1],
                    KEY_FLOWS[4],
                    KEY_FLOWS[6],
                  ].map(({ label, Icon: PillIcon }) => (
                    <div key={label} className={cn(loginStyles.featurePill, "login-feature-pill")}>
                      <PillIcon className="w-4 h-4 xl:w-5 xl:h-5 text-violet-200" />
                      <span className="text-sm xl:text-base text-white/80 font-semibold whitespace-nowrap">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <p className="text-center text-base xl:text-lg font-bold text-white/55 tracking-wide animate-stagger-4">需求驱动 · 智能生成 · 自动化脚本 · 质量闭环</p>
            </div>
          </div>
        </div>
      </div>

      {/* 右侧表单区 */}
      <div className={loginStyles.formSide}>
        <div className={loginStyles.formPanel}>
          {/* 手机端视觉区域 */}
          <div className="md:hidden mb-4 animate-stagger-5">
            <div className="relative -mx-5 -mt-5 px-5 pt-8 pb-0 overflow-hidden">
              <div className="relative z-10 flex flex-col items-center">
                <p className="text-muted-foreground text-[10px] font-bold tracking-[0.25em] uppercase mb-2 mt-4">AI 软件测试平台</p>
                <h1 className="login-hero-title text-3xl font-black text-foreground leading-tight mb-3">专业智能化测试</h1>
                <div className="flex items-baseline justify-center gap-1.5 mb-0">
                  <span className="text-lg text-muted-foreground font-bold">专为</span>
                  <span className={cn("login-mobile-role-text", roleVisible ? "login-role-text--visible" : "login-role-text--hidden")}>{roleText}</span>
                  <span className="text-lg text-muted-foreground font-bold">而生</span>
                </div>
              </div>
            </div>
          </div>

          {/* 手机端特性标签 */}
          <div className="md:hidden grid grid-cols-3 gap-2 mb-4 w-full animate-stagger-5">
            {[KEY_FLOWS[1], KEY_FLOWS[4], KEY_FLOWS[6]].map(({ label, Icon: PillIcon }) => (
              <div key={label} className="h-8 flex items-center justify-center gap-1.5 px-2 rounded-full text-[11px] font-semibold bg-primary/5 border border-primary/10 text-primary/70">
                <PillIcon className="w-3 h-3 shrink-0" />
                <span className="whitespace-nowrap">{label}</span>
              </div>
            ))}
          </div>

          <div key={tabKey} className="animate-[fadeIn_0.3s_ease-out]">
          <h2 className="text-2xl text-foreground mb-1">
            {mainTab === "register" ? <LoginSerifText>注册新账号</LoginSerifText> : <><LoginSerifText>欢迎使用</LoginSerifText> <LoginBrandText>AITestLink</LoginBrandText></>}
          </h2>
          <p className={cn(pageStyles.bodyMuted, "mb-6 leading-relaxed animate-stagger-6")}>
            {mainTab === "register" ? "注册后即可使用 AI 测试平台" : "登录账号，开启您的专业智能化测试"}
          </p>

          {/* 手机号 */}
          <LoginField value={phone} onChange={setPhone} onEnter={handleSubmit} type="tel" maxLength={11} numericOnly placeholder="请输入手机号" autoComplete="tel" animationClass="animate-stagger-7" />

          {/* 密码 */}
          <LoginField value={password} onChange={setPassword} onEnter={handleSubmit} revealable revealed={showPassword} onToggleReveal={() => setShowPassword(!showPassword)} placeholder={mainTab === "register" ? "设置密码（不少于8位，含字母和数字）" : "请输入密码"} autoComplete={mainTab === "register" ? "new-password" : "current-password"} animationClass="animate-stagger-8" />

          {/* 确认密码（仅注册） */}
          {mainTab === "register" && (
            <LoginField value={confirmPassword} onChange={setConfirmPassword} onEnter={handleSubmit} revealable revealed={showConfirmPassword} onToggleReveal={() => setShowConfirmPassword(!showConfirmPassword)} placeholder="请确认密码" autoComplete="new-password" animationClass="animate-stagger-8" />
          )}

          {/* 数字验证码 */}
          <CaptchaField value={captchaCode} onChange={setCaptchaCode} onEnter={handleSubmit} code={captchaDisplay} onRefresh={loadCaptcha} />

          {/* 提交按钮 */}
          <LoginSubmitButton loading={loading} mode={mainTab} onClick={handleSubmit} />

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
