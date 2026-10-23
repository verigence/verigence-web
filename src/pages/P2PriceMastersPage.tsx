import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import '../styles/uc03-p2.css';
import '../styles/uc03-p2-workspace.css';
import '../styles/uc03-p2-masters.css';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import MastersLoadedPanel from '../features/uc03-p2/masters/MastersLoadedPanel';
import { flattenLoaded } from '../features/uc03-p2/masters/mastersLoaded';
import {
  ConsumerTable,
  CorporateTable,
  ExchangeTable,
  GridTable,
  NotApplied,
} from '../features/uc03-p2/masters/OffersTables';
import {
  getP2MastersLoaded,
  getP2Offers,
  getP2PriceMaster,
  openP2MasterDocument,
  type P2PriceMasterModel,
} from '../services/audit-core/uc03P2';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

/** The components shown as columns, in the order a price sheet reads. */
const COLUMNS = [
  'EX_SHOWROOM',
  'TCS',
  'INSURANCE',
  'REGISTRATION_INDIVIDUAL',
  'REGISTRATION_CORPORATE',
  'ACCESSORIES_KIT',
  'EXT_WARRANTY_4TH_YR',
  'EXT_WARRANTY_4TH_5TH_YR',
  'RSA_1YR',
  'FASTAG',
] as const;

const SHORT: Record<string, string> = {
  EX_SHOWROOM: 'Ex-showroom',
  TCS: 'TCS',
  INSURANCE: 'Insurance',
  REGISTRATION_INDIVIDUAL: 'Reg (ind)',
  REGISTRATION_CORPORATE: 'Reg (corp)',
  ACCESSORIES_KIT: 'Accessories',
  EXT_WARRANTY_4TH_YR: 'EW 4th',
  EXT_WARRANTY_4TH_5TH_YR: 'EW 4+5th',
  RSA_1YR: 'RSA',
  FASTAG: 'FASTag',
};

function Nothing({ title, description }: { title: string; description: string }) {
  return (
    <SectionCard>
      <strong>{title}</strong>
      <p className="p2w-muted">{description}</p>
    </SectionCard>
  );
}

function money(value: string | null | undefined) {
  if (value === null || value === undefined || value === '') return '—';
  const number = Number(value);
  if (Number.isNaN(number)) return value;
  return number.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

/** First day of the current month, as the date the book is read on. */
function thisMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

function ModelBlock({ model, basis }: { model: P2PriceMasterModel; basis: string }) {
  const [open, setOpen] = useState(false);
  return (
    <article className="p2w-card" style={{ marginBottom: '12px' }}>
      <button
        type="button"
        className="p2w-row-button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        style={{ width: '100%', textAlign: 'left' }}
      >
        <strong>{model.model}</strong>
        {model.previousName && (
          <span className="p2w-muted" style={{ marginLeft: 8 }}>
            (previously {model.previousName})
          </span>
        )}
        <span className="p2w-muted" style={{ marginLeft: 8 }}>
          {model.variants.length} {model.variants.length === 1 ? 'variant' : 'variants'}
        </span>
      </button>
      {open && (
        <div style={{ overflowX: 'auto', marginTop: 8 }}>
          <table className="p2w-table">
            <thead>
              <tr>
                <th>Variant</th>
                {COLUMNS.map((key) => <th key={key} style={{ textAlign: 'right' }}>{SHORT[key]}</th>)}
                <th style={{ textAlign: 'right' }}>On-road ({basis === 'CORPORATE' ? 'corp' : 'ind'})</th>
              </tr>
            </thead>
            <tbody>
              {model.variants.map((variant) => {
                const byKey = new Map(variant.components.map((c) => [c.key, c.amount]));
                return (
                  <tr key={variant.productSkuId}>
                    <td>
                      {variant.variant ?? '—'}
                      {variant.trim && <span className="p2w-muted"> · {variant.trim}</span>}
                    </td>
                    {COLUMNS.map((key) => (
                      <td key={key} style={{ textAlign: 'right' }}>{money(byKey.get(key))}</td>
                    ))}
                    <td style={{ textAlign: 'right' }}><strong>{money(variant.onRoad.amount)}</strong></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}

type Tab = 'PRICES' | 'CONSUMER' | 'EXCHANGE' | 'CORPORATE' | 'GRID';

/**
 * The price book standing on a chosen date: every model and variant with
 * the components the OEM priced and the on-road figure.
 *
 * The on-road is the price list's own fully loaded figure — Mahindra prices
 * both extended-warranty tiers, the accessories kit, RSA and FASTag into it
 * — so it is a ceiling, not what a customer pays. Nothing is netted off it
 * here: the offers tabs list every scheme line beside the book, each with
 * its own amount, as the bulletins state them (2026-10-23).
 */
export default function P2PriceMastersPage() {
  const tenantId = useProjectContextStore((s) => s.selectedProject?.tenantId);
  const accessToken = useSessionStore((s) => s.accessToken);
  const [on, setOn] = useState(thisMonth());
  const [basis, setBasis] = useState<'INDIVIDUAL' | 'CORPORATE'>('INDIVIDUAL');
  const [filter, setFilter] = useState('');
  const [tab, setTab] = useState<Tab>('PRICES');
  const [busyDocument, setBusyDocument] = useState<string | null>(null);
  const [documentProblem, setDocumentProblem] = useState('');

  const loaded = useQuery({
    queryKey: ['p2-masters-loaded', tenantId],
    queryFn: () => getP2MastersLoaded(tenantId!, accessToken),
    enabled: Boolean(tenantId && accessToken),
    staleTime: 60_000,
  });
  const loadedRows = useMemo(() => flattenLoaded(loaded.data), [loaded.data]);

  const offers = useQuery({
    queryKey: ['p2-offers', tenantId, on],
    queryFn: () => getP2Offers(tenantId!, on, accessToken),
    enabled: Boolean(tenantId && accessToken && on && tab !== 'PRICES'),
    staleTime: 60_000,
  });

  async function openDocument(uploadId: string, fileName: string) {
    setDocumentProblem('');
    setBusyDocument(uploadId);
    try {
      const link = await openP2MasterDocument(tenantId!, uploadId, accessToken);
      window.open(link.url, '_blank', 'noopener,noreferrer');
    } catch {
      setDocumentProblem(`${fileName} could not be opened.`);
    } finally {
      setBusyDocument(null);
    }
  }

  const query = useQuery({
    queryKey: ['p2-price-master', tenantId, on, basis],
    queryFn: () => getP2PriceMaster(tenantId!, on, basis, accessToken),
    enabled: Boolean(tenantId && accessToken && on),
    staleTime: 60_000,
  });

  const models = useMemo(() => {
    const all = query.data?.models ?? [];
    const needle = filter.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((m) =>
      m.model.toLowerCase().includes(needle)
      || (m.previousName ?? '').toLowerCase().includes(needle)
      || m.variants.some((v) => (v.variant ?? '').toLowerCase().includes(needle)),
    );
  }, [query.data, filter]);

  const renamed = (query.data?.models ?? []).filter((m) => m.previousName).length;
  const variants = (query.data?.models ?? []).reduce((sum, m) => sum + m.variants.length, 0);

  return (
    <div className="screen-stack p2w">
      <PageHeader
        eyebrow="DealGuard"
        title="Price Masters"
        description="The price book and every offer standing on a date, as the OEM published them. The on-road figure is the book's own fully loaded total, not what a customer pays."
      />

      <SectionCard>
        <MastersLoadedPanel
          rows={loadedRows}
          on={on}
          onPick={setOn}
          onOpenDocument={openDocument}
          busyDocument={busyDocument}
          loading={loaded.isLoading}
          failed={loaded.isError}
        />
        {documentProblem && <div className="form-alert form-alert--error">{documentProblem}</div>}
      </SectionCard>

      <SectionCard>
        <div className="p2w-filter-row" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
          <label>
            <span className="j360-label">Standing on</span>
            <input type="date" value={on} onChange={(event) => setOn(event.target.value)} />
          </label>
          <label>
            <span className="j360-label">Registration basis</span>
            <select value={basis} onChange={(event) => setBasis(event.target.value as 'INDIVIDUAL' | 'CORPORATE')}>
              <option value="INDIVIDUAL">Individual</option>
              <option value="CORPORATE">Corporate</option>
            </select>
          </label>
          <label style={{ flex: 1, minWidth: 180 }}>
            <span className="j360-label">Find a model or variant</span>
            <input
              type="search"
              value={filter}
              placeholder="XUV, Thar, MX1…"
              onChange={(event) => setFilter(event.target.value)}
            />
          </label>
        </div>

        {query.data?.priceList && (
          <p className="p2w-muted" style={{ marginTop: 10 }}>
            {query.data.priceList.priceList ?? 'Price list'} v{query.data.priceList.version}
            {query.data.priceList.effectiveFrom ? `, effective ${query.data.priceList.effectiveFrom}` : ''}
            {' · '}{query.data.models.length} models, {variants} variants
            {query.data.previous?.effectiveFrom ? ` · previous book ${query.data.previous.effectiveFrom}` : ''}
          </p>
        )}

        {renamed > 0 && (
          <p className="p2w-muted">
            {renamed} {renamed === 1 ? 'model is' : 'models are'} priced under a new name this
            month. A respelt model can appear twice — the new spelling the OEM sent, and the old
            one carried forward because a partial book keeps every SKU it does not mention.
          </p>
        )}
      </SectionCard>

      <div className="p2w-jtabs__bar" role="tablist" aria-label="Masters">
        {([
          ['PRICES', 'Prices', query.data ? variants : null],
          ['CONSUMER', 'Consumer offers', offers.data ? offers.data.consumer.length : null],
          ['EXCHANGE', 'Exchange & scrappage', offers.data ? offers.data.exchange.length : null],
          ['CORPORATE', 'Corporate', offers.data ? offers.data.corporate.length : null],
          ['GRID', 'Dealer discount grid', offers.data ? (offers.data.grid?.lines.length ?? 0) : null],
        ] as Array<[Tab, string, number | null]>).map(([key, label, count]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={tab === key ? 'is-active' : ''}
            onClick={() => setTab(key)}
          >
            {label}{count !== null && <b>{count}</b>}
          </button>
        ))}
      </div>

      {tab !== 'PRICES' && (
        <SectionCard>
          {offers.isLoading && <p>Reading the offers in force…</p>}
          {offers.isError && <div className="form-alert form-alert--error">The offers could not be read.</div>}
          {offers.data && tab === 'CONSUMER' && <ConsumerTable data={offers.data} filter={filter.trim().toLowerCase()} />}
          {offers.data && tab === 'EXCHANGE' && <ExchangeTable data={offers.data} filter={filter.trim().toLowerCase()} />}
          {offers.data && tab === 'CORPORATE' && <CorporateTable data={offers.data} filter={filter.trim().toLowerCase()} />}
          {offers.data && tab === 'GRID' && <GridTable data={offers.data} filter={filter.trim().toLowerCase()} />}
          {offers.data && tab !== 'GRID' && <NotApplied data={offers.data} />}
        </SectionCard>
      )}

      {tab === 'PRICES' && query.isLoading && <SectionCard><p>Reading the price book…</p></SectionCard>}
      {tab === 'PRICES' && query.isError && (
        <SectionCard>
          <div className="form-alert form-alert--error">The price book could not be read.</div>
        </SectionCard>
      )}
      {tab === 'PRICES' && query.data && !query.data.priceList && (
        <Nothing
          title="No price list on that date"
          description="No price book is effective on the date chosen. Load the month's OEM price list from Masters, then come back."
        />
      )}
      {tab === 'PRICES' && query.data?.priceList && models.length === 0 && (
        <Nothing title="Nothing matches" description="No model or variant matches that search." />
      )}

      {tab === 'PRICES' && models.map((model) => <ModelBlock key={model.modelId} model={model} basis={basis} />)}
    </div>
  );
}
