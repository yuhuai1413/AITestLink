interface TooltipPayloadItem {
  name: string;
  value: number;
  color?: string;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}

export function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "#fff",
      border: "1px solid #e2e8f0",
      borderRadius: 8,
      padding: "8px 14px",
      fontSize: 13,
      boxShadow: "0 4px 12px rgba(0,0,0,.08)",
    }}>
      {label && <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>}
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || "#0f172a" }}>
          {p.name}: <strong>{p.value}</strong>
        </div>
      ))}
    </div>
  );
}
