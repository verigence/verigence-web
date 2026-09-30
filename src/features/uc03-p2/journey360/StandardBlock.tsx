import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { getP2JourneyStandard, type P2StandardBenefit } from '../../../services/audit-core/uc03P2';
import { money, signedMoney } from './j360Format';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function day(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return `${String(date.getDate()).padStart(2, '0')} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

function Benefit({ item, muted = false }: { item: P2StandardBenefit; muted?: boolean }) {
  const extra = [item.oldVehicleModel && `old vehicle ${item.oldVehicleModel}`, item.schemeType, item.scope === 'VARIANT' ? 'this variant' : null]
    .filter(Boolean).join(' · ');
  return (
    <li className={muted ? 'is-muted' : ''}>
      <span>
        {item.label}
        <small className="p2w-muted"> {item.scheme.name}{item.scheme.version ? ` v${item.scheme.version}` : ''}{extra ? ` · ${extra}` : ''}</small>
      </span>
      <b>{item.amount ? `−${money(item.amount)}` : item.percentage ? `${item.percentage}%` : '—'}</b>
    </li>
  );
}

/**
 * The full standard for this journey's vehicle on its pricing date, from
 * the SKU standard API (decision 2026-09-30): every price component with
 * the date it has held since, the on-road total for the buyer's basis,
 * the consumer, exchange and corporate entitlements, and the dealer grid
 * line. A block no master answers is named, never guessed.
 */
export default function StandardBlock({ tenantId, journeyId, accessToken }: { tenantId: string; journeyId: string; accessToken?: string }) {
  const [open, setOpen] = useState(false);
  const standard = useQuery({
    queryKey: ['p2-standard', tenantId, journeyId],
    queryFn: () => getP2JourneyStandard(tenantId, journeyId, accessToken),
    staleTime: 60_000,
  });
  const s = standard.data;
  if (standard.isError) {
    return <section className="j360-card"><p className="p2w-muted">The standard could not be loaded.</p></section>;
  }
  if (!s) return <section className="j360-card"><div className="p2w-skeleton">Loading the standard…</div></section>;
  if (!s.available) {
    return (
      <section className="j360-card" aria-label="Standard for this vehicle">
        <div className="j360-card__head"><h3 className="j360-h3">Standard for this vehicle</h3></div>
        <p className="p2w-muted">{s.reason}</p>
      </section>
    );
  }
  const price = s.priceList!;
  const summary = s.summary!;
  const unknown = s.unknown ?? [];
  const corporate = s.corporate;
  return (
    <section className="j360-card" aria-label="Standard for this vehicle">
      <div className="j360-card__head">
        <h3 className="j360-h3">Standard for this vehicle</h3>
        <span className="p2w-muted">
          {s.sku?.model} · {s.sku?.variant} · priced on {day(s.on)} · {price.priceList ?? 'price list'}{price.version ? ` v${price.version}` : ''}
          {price.effectiveFrom ? ` (w.e.f. ${day(price.effectiveFrom)})` : ''}
        </span>
      </div>
      <dl className="j360-facts">
        <div><dt>On-road ({s.basis === 'CORPORATE' ? 'corporate' : 'individual'})</dt><dd>{money(summary.onRoad)}</dd></div>
        <div><dt>Consumer scheme</dt><dd>{s.consumerScheme ? `−${money(summary.consumerBenefits)}` : 'No scheme on this date'}</dd></div>
        <div><dt>Exchange / scrappage</dt>
          <dd>{summary.exchangeBenefit ? `−${money(summary.exchangeBenefit)}` : s.exchangeScheme ? 'Not taken (see offers below)' : 'No scheme on this date'}</dd></div>
        <div><dt>Corporate privilege</dt>
          <dd>{corporate?.exact ? `−${money(corporate.exact.amount)} (${corporate.corporate?.privilegeCategory})`
            : corporate?.range ? `${money(corporate.range.min)} to ${money(corporate.range.max)} by category`
              : 'No policy on this date'}</dd></div>
        <div><dt>Standard net</dt><dd><strong>{money(summary.standardNet)}</strong></dd></div>
      </dl>
      <button type="button" className="p2w-link" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {open ? 'Hide the line items' : 'Show every line item'}
      </button>
      {open ? (
        <div className="j360-standard">
          <div className="j360-items">
            <span className="j360-items__title">Price list · each line with the date its price has held since</span>
            <ul>
              {price.components.map((c) => (
                <li key={c.key}><span>{c.label}<small className="p2w-muted"> since {day(c.priceSince)}</small></span><b>{money(c.amount)}</b></li>
              ))}
              <li><span><strong>On-road, individual</strong></span><b>{money(price.onRoad.individual)}</b></li>
              <li><span><strong>On-road, corporate</strong></span><b>{money(price.onRoad.corporate)}</b></li>
            </ul>
          </div>
          {s.consumerScheme ? (
            <div className="j360-items">
              <span className="j360-items__title">Consumer scheme entitlements</span>
              <ul>{s.consumerScheme.benefits.map((b) => <Benefit key={`${b.scheme.code}:${b.key}`} item={b} />)}</ul>
            </div>
          ) : null}
          {s.exchangeScheme ? (
            <div className="j360-items">
              <span className="j360-items__title">Exchange / scrappage / welcome offers{s.exchangeScheme.scenario !== 'NONE' ? ` · ${s.exchangeScheme.scenario.toLowerCase().replace('_', ' ')} taken` : ''}</span>
              <ul>
                {s.exchangeScheme.benefits.map((b) => (
                  <Benefit key={`${b.scheme.code}:${b.key}:${b.oldVehicleModel ?? ''}`} item={b}
                    muted={s.exchangeScheme!.scenario !== 'NONE' && !s.exchangeScheme!.applicable.includes(b)} />
                ))}
              </ul>
            </div>
          ) : null}
          {corporate ? (
            <div className="j360-items">
              <span className="j360-items__title">Corporate privilege by category{corporate.corporate ? ` · ${corporate.corporate.found ? `${corporate.corporate.name} is category ${corporate.corporate.privilegeCategory}` : `${corporate.corporate.lookedUp} not in the register`}` : ''}</span>
              <ul>{Object.entries(corporate.byCategory).map(([category, b]) => (
                <li key={category}><span>Category {category}<small className="p2w-muted"> {b.scheme.name}</small></span><b>−{money(b.amount)}</b></li>
              ))}</ul>
            </div>
          ) : null}
          {s.grid ? (
            <div className="j360-items">
              <span className="j360-items__title">Dealer discount grid · {s.grid.modelAsWritten} · v{s.grid.version} w.e.f. {day(s.grid.effectiveFrom)}</span>
              {s.grid.inScope ? (
                <dl className="j360-facts">
                  <div><dt>Booking protection</dt><dd>{s.grid.bookingProtectionDays === null ? '—' : `${s.grid.bookingProtectionDays} days`}</dd></div>
                  <div><dt>Agreed buffer</dt><dd>{money(s.grid.agreedBuffer)}</dd></div>
                  <div><dt>Insurance OD discount, maximum</dt><dd>{s.grid.insuranceOdPercentMax === null ? '—' : `${Number(s.grid.insuranceOdPercentMax)}%`}</dd></div>
                  <div><dt>Out of territory</dt><dd>{s.grid.outOfTerritory && Number(s.grid.outOfTerritory) ? signedMoney(s.grid.outOfTerritory) : 'Nil'}</dd></div>
                </dl>
              ) : <p className="p2w-muted">Out of scope of the grid.</p>}
            </div>
          ) : null}
          {unknown.length ? (
            <p className="p2w-muted">No master answers on this date for: {unknown.map((u) => ({ consumerScheme: 'consumer scheme', exchangeScheme: 'exchange scheme', corporate: 'corporate policy', grid: 'discount grid' })[u] ?? u).join(', ')}.</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
