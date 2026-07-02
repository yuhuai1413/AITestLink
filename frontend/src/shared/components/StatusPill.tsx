interface StatusPillProps {
  children: string;
  tone?: "blue" | "green" | "amber" | "red" | "slate";
  className?: string;
}

export function StatusPill({ children, tone = "slate", className = "" }: StatusPillProps) {
  return <span className={`status-pill status-pill--${tone} ${className}`}>{children}</span>;
}
