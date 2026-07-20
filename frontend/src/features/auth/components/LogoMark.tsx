import { useId } from "react";

interface LogoMarkProps {
  size?: number;
  className?: string;
}

export function LogoMark({ size = 30, className }: LogoMarkProps) {
  const id = useId().replace(/:/g, "");
  const gradientId = `aitest-logo-gradient-${id}`;

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
        <linearGradient id={gradientId} x1="2" y1="2" x2="34" y2="34" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#312E81" />
          <stop offset="54%" stopColor="#6D28D9" />
          <stop offset="100%" stopColor="#8B5CF6" />
        </linearGradient>
      </defs>

      <circle cx="18" cy="18" r="18" fill={`url(#${gradientId})`} />

      {/* 测试工作台主体 */}
      <path
        d="M9 10.8C9 9.2 10.3 8 11.9 8h12.2C25.7 8 27 9.2 27 10.8v10.1c0 1.6-1.3 2.9-2.9 2.9H11.9A2.9 2.9 0 0 1 9 20.9V10.8Z"
        fill="white"
        fillOpacity="0.94"
      />
      <path
        d="M12.4 13.4h5.5M12.4 16.4h4.1M12.4 19.4h3.3"
        stroke="#5B21B6"
        strokeWidth="1.45"
        strokeLinecap="round"
      />

      {/* 测试通过标识 */}
      <path
        d="m18.8 17.3 2.3 2.3 4.3-4.8"
        stroke="#5B21B6"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* 自动化链路节点 */}
      <path
        d="M12.1 26.8h11.8"
        stroke="white"
        strokeOpacity="0.7"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
      <circle cx="12.1" cy="26.8" r="1.8" fill="white" fillOpacity="0.92" />
      <circle cx="18" cy="26.8" r="1.8" fill="white" fillOpacity="0.72" />
      <circle cx="23.9" cy="26.8" r="1.8" fill="white" fillOpacity="0.92" />

      {/* 质量通过角标 */}
      <circle cx="26.4" cy="10.6" r="4.3" fill="#22C55E" />
      <path
        d="m24.5 10.6 1.25 1.25 2.75-3.05"
        stroke="white"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
