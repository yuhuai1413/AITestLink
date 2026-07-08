import { useId } from "react";

interface LogoMarkProps {
  size?: number;
  className?: string;
}

export function LogoMark({ size = 36, className }: LogoMarkProps) {
  const raw = useId();
  const uid = raw.replace(/:/g, "");
  const gid = `lg-grad-${uid}`;
  const glid = `lg-glow-${uid}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#312e81" />
          <stop offset="50%" stopColor="#5b21b6" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>
        <filter id={glid} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#5b21b6" floodOpacity="0.3" />
        </filter>
      </defs>

      {/* 主体：圆角方形 + 渐变 */}
      <rect x="1" y="1" width="34" height="34" rx="8" fill={`url(#${gid})`} filter={`url(#${glid})`} />
      <rect x="1" y="1" width="34" height="34" rx="8" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="0.5" />

      {/* AI 电路网络：三个互联节点 */}
      <line x1="10" y1="14" x2="20" y2="9"  stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" />
      <line x1="20" y1="9"  x2="26" y2="17" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" />
      <line x1="26" y1="17" x2="10" y2="14" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" />
      <circle cx="10" cy="14" r="2.3" fill="white" />
      <circle cx="20" cy="9"  r="2.3" fill="white" />
      <circle cx="26" cy="17" r="2.3" fill="white" />

      {/* 测试验证勾 */}
      <path
        d="M13 21.5  L16.2 24.7  L23 17.2"
        stroke="white"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
