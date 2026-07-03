import { useId } from "react";

interface LogoMarkProps {
  size?: number;
  className?: string;
}

export function LogoMark({ size = 36, className }: LogoMarkProps) {
  const id = useId().replace(/:/g, "");
  const gradientId = `logo-mark-gradient-${id}`;

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
          <stop offset="0%" stopColor="#312e81" />
          <stop offset="54%" stopColor="#6d28d9" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
      <circle cx="18" cy="18" r="18" fill={`url(#${gradientId})`} />
      <path
        d="M8.2 12.5C8.2 10.4 9.9 8.8 12 8.8H23.9C26 8.8 27.7 10.4 27.7 12.5V19.8C27.7 21.9 26 23.5 23.9 23.5H20.7L17.2 27.2V23.5H12C9.9 23.5 8.2 21.9 8.2 19.8V12.5Z"
        fill="white"
        fillOpacity="0.94"
      />
      <rect x="15.3" y="12" width="5.4" height="7.3" rx="2.7" fill="#5b21b6" />
      <path
        d="M13.2 16.5C13.2 19.2 15.3 21.2 18 21.2C20.7 21.2 22.8 19.2 22.8 16.5"
        stroke="#5b21b6"
        strokeWidth="1.45"
        strokeLinecap="round"
      />
      <path d="M18 21.2V22.9" stroke="#5b21b6" strokeWidth="1.45" strokeLinecap="round" />
      <path d="M16.1 22.9H19.9" stroke="#5b21b6" strokeWidth="1.45" strokeLinecap="round" />
      <circle cx="25.2" cy="10.9" r="4.2" fill="#22c55e" />
      <path d="M23.4 10.9L24.6 12.1L27.2 9.2" stroke="white" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
