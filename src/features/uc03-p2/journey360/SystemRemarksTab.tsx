import type { P2SectionMap, P2SystemRemark } from '../../../services/audit-core/uc03P2';
import { formatDateTime } from '../workspace/p2Format';

const ROLE: Record<string, string> = { PC: 'PC', TL: 'Team Lead', PM: 'Project Manager', REVIEWER: 'Reviewer' };

function meta(remark: P2SystemRemark): string {
  return [
    remark.source,
    remark.by ? ROLE[remark.by.toUpperCase()] ?? remark.by : null,
    remark.at ? formatDateTime(remark.at) : null,
  ].filter(Boolean).join(' · ');
}

/** System remarks (product owner 2026-11-15): what the system noted on the
 * journey instead of raising a task — the scrappage concession, products not
 * taken, a BH or temporary registration, an EW / RSA invoice the dealer does
 * not provide. Read-only: each comes from the Deal or a closed task. */
export default function SystemRemarksTab({ data }: { data: P2SectionMap['remarks'] }) {
  if (!data.remarks.length) {
    return (
      <div className="p2w-empty" role="status">
        No system remarks on this journey. Remarks appear here for a scrappage concession, a product not taken,
        a BH or temporary registration, or an invoice the dealer does not provide.
      </div>
    );
  }
  return (
    <ul className="j360-remarks" aria-label="System remarks">
      {data.remarks.map((remark, index) => (
        <li key={`${remark.code}-${index}`} className={`j360-card j360-remark j360-remark--${remark.code.toLowerCase()}`}>
          <div className="j360-card__head">
            <h3 className="j360-h3">{remark.title}</h3>
            <span className="p2w-muted">{meta(remark)}</span>
          </div>
          <p className="j360-remark__text">{remark.text}</p>
        </li>
      ))}
    </ul>
  );
}
