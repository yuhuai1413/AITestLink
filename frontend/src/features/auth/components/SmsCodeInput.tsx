import { useState, useCallback, useEffect, useRef, useLayoutEffect } from "react";
import { cn } from "../lib/utils";
import { iosRadius } from "../styles/pageStyles";
import { toast } from "./ToastProvider";

interface SmsCodeInputProps {
  /** 手机号，用于判断是否可发送 */
  phone: string;
  /** 当前验证码值 */
  value: string;
  /** 验证码变化回调 */
  onChange: (code: string) => void;
  /** 发送验证码的回调 */
  onSendCode: () => Promise<void>;
  /** 倒计时秒数（外部控制） */
  countdown: number;
  /** 倒计时变化回调 */
  onCountdownChange: (seconds: number) => void;
  /** 占位符 */
  placeholder?: string;
  /** 是否禁用 */
  disabled?: boolean;
  /** 输入框额外 className */
  inputClassName?: string;
  /** 按钮额外 className */
  buttonClassName?: string;
  /** 容器额外 className */
  className?: string;
  /** 是否显示清除按钮 */
  showClear?: boolean;
  /** 自动聚焦 */
  autoFocus?: boolean;
  /** 样式变体：login=登录页渐变样式, default=普通样式 */
  variant?: "login" | "default";
}

export function SmsCodeInput({
  phone,
  value,
  onChange,
  onSendCode,
  countdown,
  onCountdownChange,
  placeholder = "4位验证码",
  disabled = false,
  inputClassName,
  buttonClassName,
  className,
  showClear = true,
  autoFocus = false,
  variant = "login",
}: SmsCodeInputProps) {
  const [localCountdown, setLocalCountdown] = useState(countdown);

  // 同步外部倒计时
  useEffect(() => {
    setLocalCountdown(countdown);
  }, [countdown]);

  // 倒计时逻辑
  useEffect(() => {
    if (localCountdown <= 0) return;
    const t = setTimeout(() => {
      const next = localCountdown - 1;
      setLocalCountdown(next);
      onCountdownChange(next);
    }, 1000);
    return () => clearTimeout(t);
  }, [localCountdown, onCountdownChange]);

  const handleSend = useCallback(async () => {
    if (localCountdown > 0 || disabled) return;
    if (!phone) {
      toast.error("请输入手机号");
      return;
    }
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      toast.error("请输入正确的手机号");
      return;
    }
    try {
      await onSendCode();
      setLocalCountdown(60);
      onCountdownChange(60);
    } catch {
      // 错误由外层处理
    }
  }, [localCountdown, phone, disabled, onSendCode, onCountdownChange]);

  const isCountdown = localCountdown > 0;
  const canSend = !isCountdown && !disabled;


  // 测量按钮两种状态的宽度，用于平滑过渡
  const normalRef = useRef<HTMLSpanElement>(null);
  const countdownRef = useRef<HTMLSpanElement>(null);
  const [btnWidth, setBtnWidth] = useState<number | undefined>(undefined);

  useLayoutEffect(() => {
    const ref = isCountdown ? countdownRef.current : normalRef.current;
    if (ref) {
      setBtnWidth(ref.offsetWidth);
    }
  }, [isCountdown]);

  return (
    <div className={cn("relative", className)}>
      {/* 隐藏的测量元素 — 仅 default 变体需要 */}
      {variant === "default" && <>
        <span ref={normalRef} className="absolute invisible whitespace-nowrap text-sm font-bold px-4 h-11 pointer-events-none">获取验证码</span>
        <span ref={countdownRef} className="absolute invisible whitespace-nowrap text-sm font-bold px-4 h-11 pointer-events-none">60秒后重新获取</span>
      </>}

      <div className="flex items-center gap-2">
      {/* 验证码输入框 */}
      {variant === "login" ? (
        <div
          className={cn("relative h-[52px] sm:h-[58px] flex items-center flex-1 login-field", inputClassName)}
          style={{ transition: "flex 0.4s cubic-bezier(0.22, 1, 0.36, 1)" }}
        >
          <input
            value={value}
            onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
            placeholder={placeholder}
            autoFocus={autoFocus}
            autoComplete="one-time-code"
            inputMode="numeric" maxLength={4}
            className="w-full h-full px-5 bg-transparent border-0 shadow-none outline-none text-base md:text-sm text-foreground placeholder:text-muted-foreground/50"
          />
          {showClear && value && (
            <button type="button" onClick={() => onChange("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-black/[0.06] hover:bg-black/[0.12] flex items-center justify-center transition-colors shrink-0">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-muted-foreground/60">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      ) : (
        <div className="relative flex-1">
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus={autoFocus}
            value={value}
            onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
            placeholder={placeholder}
            maxLength={4}
            className={cn("w-full h-11 px-4 bg-muted/40 border border-border/30 text-sm text-foreground outline-none focus:border-primary/40 transition-colors", iosRadius.pill)}
          />
          {showClear && value && (
            <button type="button" onClick={() => onChange("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-black/[0.06] hover:bg-black/[0.12] flex items-center justify-center transition-colors shrink-0">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-muted-foreground/60">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      )}

      {/* 发送验证码按钮 */}
      <button
        type="button"
        onClick={handleSend}
        disabled={isCountdown}
        className={cn(
          `shrink-0 ${variant === "login" ? "h-[52px] sm:h-[58px]" : "h-11"} px-4 flex items-center justify-center text-sm font-bold ${iosRadius.pill} whitespace-nowrap`,
          variant === "login" ? (
            isCountdown
              ? "bg-gradient-to-r from-violet-700 via-purple-600 to-violet-700 text-white/70 cursor-default"
              : "bg-gradient-to-r from-violet-700 via-purple-600 to-violet-700 text-white hover:shadow-[0_4px_20px_rgba(91,33,182,0.35)] hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
          ) : (
            isCountdown
              ? "bg-primary text-primary-foreground/70 cursor-default"
              : "bg-primary text-primary-foreground hover:opacity-90 active:scale-[0.98] cursor-pointer"
          ),
          buttonClassName
        )}
        style={variant === "default" ? {
          width: btnWidth ? `${btnWidth}px` : "auto",
          transition: "width 0.35s cubic-bezier(0.22, 1, 0.36, 1), background 0.3s ease, color 0.3s ease, box-shadow 0.3s ease, transform 0.15s ease",
        } : {
          transition: "background 0.3s ease, color 0.3s ease, box-shadow 0.3s ease, transform 0.15s ease",
        }}
        onMouseMove={variant === "login" ? (e) => {
          if (isCountdown) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const x = ((e.clientX - rect.left) / rect.width) * 100;
          const y = ((e.clientY - rect.top) / rect.height) * 100;
          e.currentTarget.style.background = `radial-gradient(circle at ${x}% ${y}%, rgba(167,139,250,0.5) 0%, transparent 50%), linear-gradient(135deg, #4c1d95 0%, #7c3aed 40%, #6d28d9 60%, #5b21b6 100%)`;
        } : undefined}
        onMouseLeave={variant === "login" ? (e) => {
          if (isCountdown) return;
          e.currentTarget.style.background = "";
        } : undefined}
      >
        {isCountdown ? (
          <span className="tabular-nums">{localCountdown}秒后重新获取</span>
        ) : (
          <span>获取验证码</span>
        )}
      </button>
      </div>
    </div>
  );
}
