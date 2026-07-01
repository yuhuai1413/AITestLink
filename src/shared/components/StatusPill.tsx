interface StatusPillProps {
  children: string;
  tone?: "blue" | "green" | "amber" | "red" | "slate";
}

export function StatusPill({ children, tone = "slate" }: StatusPillProps) {
  return <span className={`status-pill status-pill--${tone}`}>{children}</span>;
}

