import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import StatusPill from '../components/StatusPill';

const bars = [68, 82, 54, 91, 73, 87, 64];

export default function AnalyticsPage() {
  return (
    <div className="screen-stack">
      <PageHeader eyebrow="Insights" title="Audit analytics" description="Management view of throughput, exception mix and evidence quality. V1 Web uses a demo aggregate until a dedicated analytics/read-model API is added after Web sign-off." backing="WEB_DEMO" />
      <div className="metric-grid"><article className="metric-card"><span className="metric-card__label">Journeys audited</span><strong className="metric-card__value">1,284</strong><span className="metric-card__detail">Rolling 30 days</span></article><article className="metric-card"><span className="metric-card__label">No-breach</span><strong className="metric-card__value">95.2%</strong><span className="metric-card__detail">Final review outcome</span></article><article className="metric-card"><span className="metric-card__label">Evidence straight-through</span><strong className="metric-card__value">88.6%</strong><span className="metric-card__detail">No manual review needed</span></article><article className="metric-card"><span className="metric-card__label">Median review TAT</span><strong className="metric-card__value">42m</strong><span className="metric-card__detail">PC submit to decision</span></article></div>
      <div className="dashboard-grid">
        <SectionCard title="Daily audit throughput" description="Relative journey completion trend for the last seven days."><div className="bar-chart" aria-label="Daily audit throughput chart">{bars.map((value, index) => <div className="bar-chart__item" key={index}><div className="bar-chart__bar" style={{ height: `${value}%` }} /><span>{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][index]}</span></div>)}</div></SectionCard>
        <SectionCard title="Exception mix" description="Where current findings are concentrated."><div className="analytics-list"><div><span>Discount / commercial</span><strong>34%</strong></div><div><span>Payment sequence</span><strong>24%</strong></div><div><span>Delivery mismatch</span><strong>18%</strong></div><div><span>Documentation</span><strong>16%</strong></div><div><span>Other</span><strong>8%</strong></div></div></SectionCard>
      </div>
      <SectionCard title="Evidence quality signals"><div className="data-table-wrap"><table className="data-table"><thead><tr><th>Document type</th><th>Volume</th><th>Straight-through</th><th>Review required</th><th>Signal</th></tr></thead><tbody><tr><td>Booking docket</td><td>1,240</td><td>93%</td><td>7%</td><td><StatusPill value="HEALTHY" compact /></td></tr><tr><td>Payment receipt</td><td>1,012</td><td>89%</td><td>11%</td><td><StatusPill value="READY" compact /></td></tr><tr><td>Insurance cover note</td><td>928</td><td>81%</td><td>19%</td><td><StatusPill value="REVIEW_REQUIRED" compact /></td></tr><tr><td>Delivery note</td><td>846</td><td>91%</td><td>9%</td><td><StatusPill value="HEALTHY" compact /></td></tr></tbody></table></div></SectionCard>
    </div>
  );
}
