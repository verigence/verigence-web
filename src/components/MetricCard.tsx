import type { DashboardMetric } from '../domain/models';

export default function MetricCard({ metric }: { metric: DashboardMetric }) {
  return (
    <article className="metric-card">
      <span className="metric-card__label">{metric.label}</span>
      <strong className="metric-card__value">{metric.value}</strong>
      <span className="metric-card__detail">{metric.detail}</span>
      {metric.trend && <span className="metric-card__trend">{metric.trend}</span>}
    </article>
  );
}
