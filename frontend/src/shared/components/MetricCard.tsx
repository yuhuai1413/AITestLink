import type { Metric } from "../types/platform";

interface MetricCardProps {
  metric: Metric;
}

export function MetricCard({ metric }: MetricCardProps) {
  return (
    <article className={`metric-card metric-card--${metric.tone}`}>
      <div>
        <p className="metric-card__label">{metric.label}</p>
        <strong className="metric-card__value">{metric.value}</strong>
      </div>
      <span className="metric-card__trend">{metric.trend}</span>
    </article>
  );
}

