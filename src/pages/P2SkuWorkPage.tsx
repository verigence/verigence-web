import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import '../styles/uc03-p2.css';
import '../styles/uc03-p2-sku-work.css';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import {
  confirmModelResolutionSku,
  getModelResolutionCandidates,
} from '../services/audit-core/uc03ModelResolution';
import {
  getSkuAttention,
  type SkuAttentionItem,
} from '../services/audit-core/uc03SkuAttention';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

/** Worst first, so the row a person should open is the row at the top. */
const CONTRADICTION_LABEL: Record<string, string> = {
  MODEL: 'Price names a different model',
  VARIANT: 'Price names another variant',
};

function money(value: string | null | undefined) {
  if (!value) return '—';
  const n = Number(value);
  return Number.isNaN(n) ? value : n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function day(value: string | null) {
  if (!value) return 'no date';
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** The picker, opened for one booking. Both a Team Lead and a Reviewer reach
 * it from here, and both write through the same confirm-sku endpoint a PC
 * uses, so there is one way to set a SKU rather than three. */
function SetSkuPanel({ item, tenantId, accessToken, onDone }: {
  item: SkuAttentionItem;
  tenantId: string;
  accessToken?: string;
  onDone: () => void;
}) {
  const [chosen, setChosen] = useState<string | null>(null);
  const options = useQuery({
    queryKey: ['sku-options', tenantId, item.journeyId],
    queryFn: () => getModelResolutionCandidates(tenantId, item.journeyId, accessToken),
    enabled: Boolean(tenantId && accessToken),
    retry: false,
  });
  const save = useMutation({
    mutationFn: (productSkuId: string) =>
      confirmModelResolutionSku(tenantId, item.journeyId, productSkuId, accessToken),
    onSuccess: onDone,
  });

  if (options.isLoading) return <p className="p2w-muted">Reading the options…</p>;
  if (options.isError) {
    return (
      <p className="p2w-muted">
        No shortlist to choose from for this booking. Open Journey 360 to see what its documents say.
      </p>
    );
  }
  const candidates = options.data?.candidates ?? [];
  if (candidates.length === 0) {
    return <p className="p2w-muted">No SKU in the price book in force fits this booking&rsquo;s words.</p>;
  }
  return (
    <div className="p2w-skuwork__picker">
      <p className="p2w-muted">
        Read from the documents: {options.data?.reviewedModelName ?? '—'}
        {options.data?.reviewedVariantName ? ` · ${options.data.reviewedVariantName}` : ''}
        {options.data?.matchStage ? ` (${options.data.matchStage})` : ''}
      </p>
      <table className="p2w-table">
        <thead>
          <tr><th /><th>Model</th><th>Variant</th><th>Colour</th><th style={{ textAlign: 'right' }}>Ex-showroom</th></tr>
        </thead>
        <tbody>
          {candidates.map((c) => (
            <tr key={c.productSkuId}>
              <td>
                <input
                  type="radio"
                  name={`sku-${item.journeyId}`}
                  checked={chosen === c.productSkuId}
                  onChange={() => setChosen(c.productSkuId)}
                  aria-label={`${c.modelName} ${c.variantName ?? ''}`}
                />
              </td>
              <td><strong>{c.modelName}</strong></td>
              <td>{c.variantName ?? <span className="p2w-muted">—</span>}</td>
              <td>{c.colourName ?? <span className="p2w-muted">—</span>}</td>
              <td style={{ textAlign: 'right' }}>{money(c.exShowroomPrice)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="p2w-skuwork__actions">
        <button
          type="button"
          className="p2w-button"
          disabled={!chosen || save.isPending}
          onClick={() => chosen && save.mutate(chosen)}
        >
          {save.isPending ? 'Setting…' : 'Set this SKU'}
        </button>
        {save.isError && <span className="p2w-danger">That could not be saved. Try again.</span>}
      </div>
    </div>
  );
}

export default function P2SkuWorkPage() {
  const tenantId = useProjectContextStore((s) => s.selectedProject?.tenantId);
  const accessToken = useSessionStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  const [reason, setReason] = useState<string>('ALL');
  const [open, setOpen] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['p2-sku-attention', tenantId],
    queryFn: () => getSkuAttention(tenantId!, { limit: 300 }, accessToken),
    enabled: Boolean(tenantId && accessToken),
  });

  const items = useMemo(() => {
    const all = query.data?.items ?? [];
    if (reason === 'ALL') return all;
    if (reason === 'CONTRADICTED') return all.filter((i) => i.contradiction);
    return all.filter((i) => i.reasons.includes(reason));
  }, [query.data, reason]);

  const labels = query.data?.reasonLabels ?? {};
  const counts = query.data?.byReason ?? {};
  const contradicted = query.data?.contradicted ?? {};

  return (
    <div className="p2w">
      <PageHeader
        eyebrow="DealGuard"
        title="SKU work"
        description="Bookings whose vehicle is not settled: several options, no price available, no usable booking date, or a price that contradicts the vehicle set. A Team Lead and a Reviewer can both set the SKU from here."
      />

      <SectionCard title="What is outstanding">
        {query.isLoading && <p className="p2w-muted">Reading…</p>}
        {query.isError && <p className="p2w-danger">That could not be read. Reload the page.</p>}
        {query.data && (
          <div className="p2w-skuwork__tiles">
            <button type="button" className={`p2w-skuwork__tile${reason === 'ALL' ? ' is-active' : ''}`}
                    onClick={() => setReason('ALL')}>
              <span className="p2w-skuwork__count">{query.data.needsAttention}</span>
              <span>Need attention</span>
            </button>
            <button type="button"
                    className={`p2w-skuwork__tile is-worst${reason === 'CONTRADICTED' ? ' is-active' : ''}`}
                    onClick={() => setReason('CONTRADICTED')}>
              <span className="p2w-skuwork__count">
                {(contradicted.MODEL ?? 0) + (contradicted.VARIANT ?? 0)}
              </span>
              <span>Price contradicts the vehicle</span>
              <small>{contradicted.MODEL ?? 0} name a different model</small>
            </button>
            {Object.entries(counts)
              .filter(([, n]) => n > 0)
              .map(([key, n]) => (
                <button key={key} type="button"
                        className={`p2w-skuwork__tile${reason === key ? ' is-active' : ''}`}
                        onClick={() => setReason(key)}>
                  <span className="p2w-skuwork__count">{n}</span>
                  <span>{labels[key] ?? key}</span>
                </button>
              ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title={reason === 'ALL' ? 'Every booking' : labels[reason] ?? 'Selected'}>
        {query.data && items.length === 0 && (
          <p className="p2w-muted">Nothing outstanding here.</p>
        )}
        {items.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table className="p2w-table p2w-skuwork__list">
              <thead>
                <tr>
                  <th>Booking</th><th>Dealership / outlet</th><th>PC</th>
                  <th>Read as</th><th>SKU set</th><th>Priced on</th>
                  <th>Why</th><th>Tasks</th><th />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <>
                    <tr key={item.journeyId}
                        className={item.contradiction?.level === 'MODEL' ? 'is-worst' : undefined}>
                      <td>
                        <Link to={`/p2/journeys/${item.journeyId}`}>{item.journeyReference}</Link>
                        <div className="p2w-muted">{item.customer}</div>
                      </td>
                      <td>{item.dealerName}<div className="p2w-muted">{item.outletName}</div></td>
                      <td>{item.pcName ?? <span className="p2w-muted">—</span>}</td>
                      <td>
                        {item.bookedModel ?? <span className="p2w-muted">nothing read</span>}
                        {item.bookedVariant && <div className="p2w-muted">{item.bookedVariant}</div>}
                      </td>
                      <td>
                        {item.pinnedVehicle ?? <span className="p2w-danger">not set</span>}
                        {item.contradiction && (
                          <div className={item.contradiction.level === 'MODEL' ? 'p2w-danger' : 'p2w-warn'}>
                            {CONTRADICTION_LABEL[item.contradiction.level]}: {item.contradiction.priceNames}
                            {item.figureRead && ` (read ${money(item.figureRead)} on the ${item.figureDocument})`}
                          </div>
                        )}
                      </td>
                      <td>
                        {day(item.pricedOn)}
                        {item.pricingDateFromAPerson && <div className="p2w-muted">set by a person</div>}
                        {!item.hasAPriceBook && <div className="p2w-danger">no price book covers it</div>}
                      </td>
                      <td>{item.reasons.map((r) => <div key={r}>{labels[r] ?? r}</div>)}</td>
                      <td>
                        {item.tasks.map((t) => (
                          <div key={t.taskId}>
                            <span className={`p2w-sev p2w-sev--${t.severity.toLowerCase()}`}>{t.severity}</span>{' '}
                            {t.taskType}
                          </div>
                        ))}
                      </td>
                      <td>
                        <button type="button" className="p2w-button p2w-button--quiet"
                                onClick={() => setOpen(open === item.journeyId ? null : item.journeyId)}>
                          {open === item.journeyId ? 'Close' : 'Set SKU'}
                        </button>
                      </td>
                    </tr>
                    {open === item.journeyId && (
                      <tr key={`${item.journeyId}-picker`}>
                        <td colSpan={9}>
                          <SetSkuPanel
                            item={item}
                            tenantId={tenantId!}
                            accessToken={accessToken}
                            onDone={() => {
                              setOpen(null);
                              void queryClient.invalidateQueries({ queryKey: ['p2-sku-attention', tenantId] });
                            }}
                          />
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
