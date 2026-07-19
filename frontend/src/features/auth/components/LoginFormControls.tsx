import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { Eye, EyeOff, Sparkles, X } from "lucide-react";

import { Button } from "./Button";
import { Input } from "./Input";
import { cn } from "../lib/utils";

interface LoginFieldProps {
  value: string;
  onChange: (value: string) => void;
  onEnter: () => void;
  type?: "text" | "password" | "tel";
  placeholder: string;
  autoComplete?: string;
  maxLength?: number;
  numericOnly?: boolean;
  revealable?: boolean;
  revealed?: boolean;
  onToggleReveal?: () => void;
  animationClass?: string;
  inputClassName?: string;
}

export function LoginField({
  value,
  onChange,
  onEnter,
  type = "text",
  placeholder,
  autoComplete,
  maxLength,
  numericOnly = false,
  revealable = false,
  revealed = false,
  onToggleReveal,
  animationClass,
  inputClassName,
}: LoginFieldProps) {
  const actualType = revealable ? (revealed ? "text" : "password") : type;
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") onEnter();
  };

  return (
    <div className={cn("login-form-row", animationClass)}>
      <div className="login-field login-control">
        <Input
          type={actualType}
          maxLength={maxLength}
          value={value}
          onChange={(event) => onChange(numericOnly ? event.target.value.replace(/\D/g, "") : event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className={cn("login-form-input", revealable ? "login-form-input--with-actions" : value ? "login-form-input--with-clear" : "", inputClassName)}
        />
        <div className="login-field-actions">
          {revealable ? (
            <button className="login-icon-button" type="button" onClick={onToggleReveal} title={revealed ? "隐藏密码" : "显示密码"}>
              {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          ) : null}
          {value ? <ClearButton onClick={() => onChange("")} /> : null}
        </div>
      </div>
    </div>
  );
}

interface CaptchaFieldProps {
  value: string;
  onChange: (value: string) => void;
  onEnter: () => void;
  code: string;
  onRefresh: () => void;
}

export function CaptchaField({ value, onChange, onEnter, code, onRefresh }: CaptchaFieldProps) {
  return (
    <div className="login-form-row animate-stagger-9">
      <div className="login-captcha-row">
        <div className="login-field login-control login-captcha-input">
          <Input
            type="text"
            value={value}
            onChange={(event) => onChange(event.target.value.replace(/\D/g, ""))}
            onKeyDown={(event) => { if (event.key === "Enter") onEnter(); }}
            placeholder="请输入验证码"
            maxLength={4}
            autoComplete="off"
            className="login-form-input"
          />
        </div>
        <button className="login-captcha-button" type="button" onClick={onRefresh} title="点击刷新验证码">
          <span>{code}</span>
        </button>
      </div>
    </div>
  );
}

interface LoginSubmitButtonProps {
  loading: boolean;
  mode: "login" | "register";
  onClick: () => void;
}

export function LoginSubmitButton({ loading, mode, onClick }: LoginSubmitButtonProps) {
  const updatePointer = (event: MouseEvent<HTMLButtonElement>) => {
    if (loading) return;
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--login-submit-x", `${((event.clientX - rect.left) / rect.width) * 100}%`);
    event.currentTarget.style.setProperty("--login-submit-y", `${((event.clientY - rect.top) / rect.height) * 100}%`);
  };

  return (
    <div className="animate-stagger-10">
      <Button
        variant="ghost"
        onClick={onClick}
        disabled={loading}
        className={cn("login-submit-button", loading && "login-submit-button--loading")}
        onMouseMove={updatePointer}
        onMouseLeave={(event) => {
          event.currentTarget.style.removeProperty("--login-submit-x");
          event.currentTarget.style.removeProperty("--login-submit-y");
        }}
      >
        <span className="login-submit-button__content">
          <Sparkles size={16} />
          {loading ? "处理中..." : mode === "register" ? "注册" : "登录"}
        </span>
      </Button>
    </div>
  );
}

function ClearButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="login-icon-button" title="清空">
      <X size={13} />
    </button>
  );
}

export function LoginBrandText({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("login-brand-text", className)}>{children}</span>;
}

export function LoginSerifText({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("login-serif-text", className)}>{children}</span>;
}
