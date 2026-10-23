import type { P2Offers } from '../../../services/audit-core/uc03P2';
import { shortDate } from './mastersLoaded';

function money(value: string | null | undefined) {
  if (value === null || value === undefined || value === '') return '—';
  const number = Number(value);
  if (Number.isNaN(number)) return value;
  return number.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function matches(needle: string, ...texts: Array<string | null | undefined>) {
  if (!needle) return true;
  return texts.some((t) => (t ?? '').toLowerCase().includes(needle));
}

function Empty({ text }: { text: string }) {
  return <p className="p2w-muted" style={{ margin: '12px 0' }}>{text}</p>;
}

const SECTION_LABEL: Record<string, string> = {
  EXCHANGE_PERSONAL: 'Exchange (personal)',
  EXCHANGE_COMMERCIAL: 'Exchange (commercial)',
  SCRAPPAGE_DEALER: 'Scrappage (dealer)',
  SCRAPPAGE_COD: 'Scrappage (certificate of deposit)',
  WELCOME_BONUS: 'Loyalty / welcome',
};

export function ConsumerTable({ data, filter }: { data: P2Offers; filter: string }) {
  const rows = data.consumer.filter((r) => matches(filter, r.model, r.variant, r.scheme.name));
  if (!data.consumer.length) return <Empty text="No consumer scheme is in force on this date." />;
  if (!rows.length) return <Empty text="No model or variant matches that search." />;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="p2w-table">
        <thead>
          <tr><th>Model</th><th>Variant</th><th>Offer</th><th style={{ textAlign: 'right' }}>Amount</th><th style={{ textAlign: 'right' }}>Total</th><th>Bulletin</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.modelId}-${r.variant ?? '*'}-${r.scheme.code}`}>
              <td><strong>{r.model}</strong></td>
              <td>{r.variant ?? <span className="p2w-muted">All variants</span>}</td>
              <td>{r.benefits.map((b) => <div key={b.key}>{b.label}</div>)}</td>
              <td style={{ textAlign: 'right' }}>
                {r.benefits.map((b) => <div key={b.key}>{b.percentage ? `${Number(b.percentage)}%` : money(b.amount)}</div>)}
              </td>
              <td style={{ textAlign: 'right' }}><strong>{money(r.total)}</strong></td>
              <td className="p2w-muted">{r.scheme.name}<br />{shortDate(r.scheme.validFrom)} – {shortDate(r.scheme.validTo)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ExchangeTable({ data, filter }: { data: P2Offers; filter: string }) {
  const rows = data.exchange.filter((r) => matches(filter, r.model, r.variant, r.oldVehicleModel, r.scheme.name));
  if (!data.exchange.length) return <Empty text="No exchange, scrappage or welcome scheme is in force on this date." />;
  if (!rows.length) return <Empty text="No model or variant matches that search." />;
  return (
    <>
      <p className="p2w-muted">Lines within one scenario are alternatives (one old vehicle, one bonus) — the most a scenario is worth is its best line, never a sum.</p>
      <div style={{ overflowX: 'auto' }}>
        <table className="p2w-table">
          <thead>
            <tr><th>Model</th><th>Variant</th><th>Scenario</th><th>Old vehicle / type</th><th style={{ textAlign: 'right' }}>Amount</th><th>Split</th><th>Bulletin</th></tr>
          </thead>
          <tbody>
            {rows.map((r, index) => (
              <tr key={`${r.modelId}-${r.variant ?? '*'}-${r.scheme.code}-${r.key}-${index}`}>
                <td><strong>{r.model}</strong></td>
                <td>{r.variant ?? <span className="p2w-muted">All variants</span>}</td>
                <td>{(r.section && SECTION_LABEL[r.section]) || r.label}</td>
                <td>{[r.oldVehicleModel, r.schemeType].filter(Boolean).join(' · ') || '—'}</td>
                <td style={{ textAlign: 'right' }}><strong>{money(r.amount)}</strong></td>
                <td className="p2w-muted">
                  {r.contributions
                    ? Object.entries(r.contributions).map(([k, v]) => (
                      <div key={k}>{k === 'mAndMContribution' ? 'OEM' : k === 'dealerContribution' ? 'Dealer' : 'Credit note'} {money(v)}</div>
                    ))
                    : '—'}
                </td>
                <td className="p2w-muted">{r.scheme.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function CorporateTable({ data, filter }: { data: P2Offers; filter: string }) {
  const rows = data.corporate.filter((r) => matches(filter, r.model));
  const categories = data.corporateCategories;
  if (!data.corporate.length) return <Empty text="No corporate privilege policy is in force on this date." />;
  if (!rows.length) return <Empty text="No model matches that search." />;
  return (
    <>
      <p className="p2w-muted">The privilege per category of the corporate's listing. A deal's exact figure depends on the corporate named on it.</p>
      <div style={{ overflowX: 'auto' }}>
        <table className="p2w-table">
          <thead>
            <tr><th>Model</th>{categories.map((c) => <th key={c} style={{ textAlign: 'right' }}>Category {c}</th>)}<th>Policy</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.modelId}>
                <td><strong>{r.model}</strong></td>
                {categories.map((c) => <td key={c} style={{ textAlign: 'right' }}>{money(r.byCategory[c])}</td>)}
                <td className="p2w-muted">{shortDate(r.scheme.validFrom)} – {shortDate(r.scheme.validTo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function GridTable({ data, filter }: { data: P2Offers; filter: string }) {
  const grid = data.grid;
  if (!grid) return <Empty text="No dealer discount grid is in force on this date." />;
  const rows = grid.lines.filter((l) => matches(filter, l.modelAsWritten, l.model, l.variantGroup));
  return (
    <>
      <p className="p2w-muted">
        Grid v{grid.version}, in force from {shortDate(grid.effectiveFrom)}
        {grid.effectiveTo ? ` to ${shortDate(grid.effectiveTo)}` : ' until the next grid'}. Universal across outlets.
        Insurance OD % is shown as the maximum.
      </p>
      {rows.length === 0 ? <Empty text="No grid line matches that search." /> : (
        <div style={{ overflowX: 'auto' }}>
          <table className="p2w-table">
            <thead>
              <tr>
                <th>Model (as written)</th><th>Matched model</th><th>In scope</th>
                <th style={{ textAlign: 'right' }}>Booking protection</th><th style={{ textAlign: 'right' }}>Agreed buffer</th>
                <th style={{ textAlign: 'right' }}>Insurance OD % (max)</th><th style={{ textAlign: 'right' }}>Out of territory</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l, index) => (
                <tr key={`${l.modelAsWritten}-${index}`}>
                  <td><strong>{l.modelAsWritten}</strong>{l.variantGroup && <div className="p2w-muted">{l.variantGroup}</div>}</td>
                  <td>{l.model ?? <span className="p2w-muted">Not matched to a priced model</span>}</td>
                  <td>{l.inScope ? 'Yes' : 'No'}</td>
                  <td style={{ textAlign: 'right' }}>{l.bookingProtectionDays === null ? '—' : `${l.bookingProtectionDays} days`}</td>
                  <td style={{ textAlign: 'right' }}>{money(l.agreedBuffer)}</td>
                  <td style={{ textAlign: 'right' }}>{l.insuranceOdPercentMax === null ? '—' : `${Number(l.insuranceOdPercentMax)}%`}</td>
                  <td style={{ textAlign: 'right' }}>{money(l.outOfTerritory)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {grid.parameters.length > 0 && (
        <details className="p2w-disclosure" style={{ marginTop: 10 }}>
          <summary>Policy parameters ({grid.parameters.length})</summary>
          <ul>
            {grid.parameters.map((p, i) => (
              <li key={i}>{Object.entries(p).map(([k, v]) => `${k}: ${String(v)}`).join(' · ')}</li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

/** Bulletin lines written for variants the price book does not carry. The
 * deal does not offer them on any variant; listed so they are not invisible. */
export function NotApplied({ data }: { data: P2Offers }) {
  if (!data.notApplied.length) return null;
  return (
    <details className="p2w-disclosure p2w-box p2w-box--warning" style={{ marginTop: 12 }}>
      <summary>
        {data.notApplied.length} bulletin {data.notApplied.length === 1 ? 'line names' : 'lines name'} variants the price book does not carry — not offered on any variant
      </summary>
      <ul>
        {data.notApplied.map((n, i) => (
          <li key={i}>
            <strong>{n.model}</strong> · {n.scheme.name}: {n.variantTexts.join(', ') || 'variant not stated'}
            {' — '}{n.lines.map((l) => `${l.label} ${money(l.amount)}`).join(', ')}
          </li>
        ))}
      </ul>
    </details>
  );
}
