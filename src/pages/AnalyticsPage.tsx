import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import StatusPill from '../components/StatusPill';

const bars = [68, 82, 54, 91, 73, 87, 64];
const evidenceSignals = [
  { documentType: 'Booking Docket', volume: '1,240', straightThrough: '93%', reviewRequired: '7%', signal: 'HEALTHY' },
  { documentType: 'Payment Receipt', volume: '1,012', straightThrough: '89%', reviewRequired: '11%', signal: 'READY' },
  { documentType: 'Insurance Cover Note', volume: '928', straightThrough: '81%', reviewRequired: '19%', signal: 'REVIEW_REQUIRED' },
  { documentType: 'Delivery Note', volume: '846', straightThrough: '91%', reviewRequired: '9%', signal: 'HEALTHY' },
];

export default function AnalyticsPage() {
  return (
    <div className="screen-stack">
      <PageHeader eyebrow="Insights" title="Audit Analytics" description="Review audit volume, outcomes, evidence quality and the areas where findings are concentrated." />
      <div className="metric-grid">
        <article className="metric-card"><span className="metric-card__label">Journeys Audited</span><strong className="metric-card__value">1,284</strong><span className="metric-card__detail">Rolling 30 days</span></article>
        <article className="metric-card"><span className="metric-card__label">No Breach</span><strong className="metric-card__value">95.2%</strong><span className="metric-card__detail">Final review outcome</span></article>
        <article className="metric-card"><span className="metric-card__label">Evidence Cleared</span><strong className="metric-card__value">88.6%</strong><span className="metric-card__detail">No additional review needed</span></article>
        <article className="metric-card"><span className="metric-card__label">Median Review Time</span><strong className="metric-card__value">42m</strong><span className="metric-card__detail">Submission to decision</span></article>
      </div>
      <div className="dashboard-grid">
        <SectionCard title="Daily Audit Throughput" description="Relative journey completion trend for the last seven days."><div className="bar-chart" aria-label="Daily audit throughput chart">{bars.map((value, index) => <div className="bar-chart__item" key={index}><div className="bar-chart__bar" style={{ height: `${value}%` }} /><span>{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][index]}</span></div>)}</div></SectionCard>
        <SectionCard title="Exception Mix" description="Where current findings are concentrated."><div className="analytics-list"><div><span>Discount / Commercial</span><strong>34%</strong></div><div><span>Payment Sequence</span><strong>24%</strong></div><div><span>Delivery Mismatch</span><strong>18%</strong></div><div><span>Documentation</span><strong>16%</strong></div><div><span>Other</span><strong>8%</strong></div></div></SectionCard>
      </div>
      <SectionCard title="Evidence Quality">
        <div className="adaptive-list__desktop">
          <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Document Type</th><th>Volume</th><th>Cleared</th><th>Review Required</th><th>Signal</th></tr></thead><tbody>{evidenceSignals.map((item) => <tr key={item.documentType}><td>{item.documentType}</td><td>{item.volume}</td><td>{item.straightThrough}</td><td>{item.reviewRequired}</td><td><StatusPill value={item.signal} compact /></td></tr>)}</tbody></table></div>
        </div>
        <div className="adaptive-list adaptive-list__mobile">
          {evidenceSignals.map((item) => (
            <article className="adaptive-list-card" key={item.documentType}>
              <div className="adaptive-list-card__head"><div><strong>{item.documentType}</strong><span>{item.volume} documents</span></div><StatusPill value={item.signal} compact /></div>
              <div className="adaptive-list-card__details"><span>Cleared <strong>{item.straightThrough}</strong></span><span>Review Required <strong>{item.reviewRequired}</strong></span></div>
            </article>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
