import { useMemo, useState } from 'react';
import SectionCard from '../../components/SectionCard';
import type { AnalyticsBusinessReportPayload, NumericValue, PricingIntegrityReport } from '../../services/analytics/businessClient';
import AnalyticsOdishaPinMap from './AnalyticsOdishaPinMap';
import {
  AnalyticsBarChart,
  AnalyticsBubbleChart,
  AnalyticsComboChart,
  AnalyticsDonutChart,
  AnalyticsHeatmap,
  AnalyticsGroupedBarChart,
  AnalyticsParetoChart,
  AnalyticsSunburstChart,
  AnalyticsStackedBarChart,
  AnalyticsTreemap,
} from './AnalyticsCharts';

function numeric(value: NumericValue | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-IN').format(value);
}

function formatMoney(value: NumericValue | undefined): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(numeric(value));
}

function formatOptionalNumber(value: NumericValue | null | undefined): string {
  return value == null || value === '' ? 'Unavailable' : formatNumber(numeric(value));
}

function formatOptionalMoney(value: NumericValue | null | undefined): string {
  return value == null || value === '' ? 'Unavailable' : formatMoney(value);
}

function formatPercent(value: number | null | undefined): string {
  return value == null ? 'Unavailable' : `${Number(value).toFixed(1)}%`;
}

function percent(part: number, whole: number): string {
  return whole ? `${((part / whole) * 100).toFixed(1)}%` : 'Unavailable';
}

function formatDays(value: NumericValue | undefined): string {
  if (value == null || value === '') return 'Unavailable';
  return `${numeric(value).toFixed(1)} days`;
}

function humanize(value: string): string {
  if (!value) return 'Unspecified';
  const acronyms: Record<string, string> = {
    ew: 'EW', rsa: 'RSA', gst: 'GST', rti: 'RTI', idv: 'IDV', rc: 'RC', pan: 'PAN', po: 'PO', upi: 'UPI',
  };
  return value
    .replace(/[:/]/g, ' ')
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((token) => acronyms[token.toLowerCase()] || `${token.charAt(0).toUpperCase()}${token.slice(1).toLowerCase()}`)
    .join(' ');
}

function humanizeRule(value: string): string {
  const [prefix, suffix] = value.split(':', 2);
  if (suffix && prefix.includes('REQUIRED_DOCUMENT_MISSING')) return `Missing: ${humanize(suffix)}`;
  if (suffix && prefix.includes('DISCOUNT_EVIDENCE_MISSING')) return `Missing evidence: ${humanize(suffix)}`;
  return suffix ? `${humanize(prefix)} · ${humanize(suffix)}` : humanize(value);
}

function Metric({ label, value, detail, attention = false }: { label: string; value: string; detail: string; attention?: boolean }) {
  return (
    <article className={`analytics-insight-card${attention ? ' analytics-insight-card--attention' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

function DetailTable({ title = 'View underlying detail', headers, rows, defaultOpen = false }: {
  title?: string;
  headers: string[];
  rows: Array<Array<string | number>>;
  defaultOpen?: boolean;
}) {
  const [query, setQuery] = useState('');
  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return rows;
    return rows.filter((row) => row.some((cell) => String(cell).toLocaleLowerCase().includes(normalizedQuery)));
  }, [query, rows]);

  return (
    <details className="analytics-detail" open={defaultOpen}>
      <summary>{title}</summary>
      <div className="analytics-detail__body">
        {rows.length > 10 && (
          <div className="analytics-detail__search">
            <label>
              Search this table
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search dealer, model, code, item, or value"
              />
            </label>
            <span>Showing {formatNumber(filteredRows.length)} of {formatNumber(rows.length)} rows</span>
          </div>
        )}
        {filteredRows.length ? <div className="analytics-record-grid">
          {filteredRows.map((row, rowIndex) => <article className="analytics-record-card" key={rowIndex}>
            <h4>{String(row[0] ?? headers[0] ?? 'Record')}</h4>
            <dl>{headers.slice(1).map((header, index) => <div key={`${rowIndex}-${header}`}><dt>{header}</dt><dd>{String(row[index + 1] ?? 'Unavailable')}</dd></div>)}</dl>
          </article>)}
        </div> : <p className="analytics-table-empty">{rows.length ? 'No records match this search.' : 'No records are available for this report in the selected project snapshot. Confirm the project scope shown above.'}</p>}
      </div>
    </details>
  );
}

type AnalyticsVasData = Extract<AnalyticsBusinessReportPayload, { kind: 'addons' }>['data'];
type AnalyticsInsuranceSourceRows = Extract<AnalyticsBusinessReportPayload, { kind: 'insurance' }>['data']['by_source_outlet'];
type AnalyticsInsuranceOutletRows = Extract<AnalyticsBusinessReportPayload, { kind: 'insurance' }>['data']['by_outlet'];

function AnalyticsIntermediaryChart({ rows, outlets }: { rows: AnalyticsInsuranceSourceRows; outlets: AnalyticsInsuranceOutletRows }) {
  const [selectedDealer, setSelectedDealer] = useState('All dealerships');
  const [selectedOutlet, setSelectedOutlet] = useState('All outlets');
  const outletKey = (dealerId: string | null, outletId: string | null, dealerName: string, outletName: string) =>
    `${dealerId || dealerName}::${outletId || outletName}`;
  const dealers = useMemo(
    () => Array.from(new Set(outlets.map((row) => row.dealer_name))).sort((a, b) => a.localeCompare(b)),
    [outlets],
  );
  const outletOptions = useMemo(() => outlets
    .filter((row) => selectedDealer === 'All dealerships' || row.dealer_name === selectedDealer)
    .map((row) => ({
      key: outletKey(row.dealer_id, row.outlet_id, row.dealer_name, row.outlet_name),
      label: selectedDealer === 'All dealerships' ? `${row.dealer_name} / ${row.outlet_name}` : row.outlet_name,
    }))
    .sort((a, b) => a.label.localeCompare(b.label)),
  [outlets, selectedDealer]);
  const inScope = (row: { dealer_id: string | null; dealer_name: string; outlet_id: string | null; outlet_name: string }) =>
    (selectedDealer === 'All dealerships' || row.dealer_name === selectedDealer)
    && (selectedOutlet === 'All outlets'
      || outletKey(row.dealer_id, row.outlet_id, row.dealer_name, row.outlet_name) === selectedOutlet);
  const scopedOutlets = outlets.filter(inScope);
  const scopedRows = rows.filter(inScope);
  const totals = scopedRows.reduce((result, row) => {
    result.policies += row.policy_count;
    if (row.intermediary_code && row.intermediary_code !== '(blank)') {
      result.code += row.policy_count;
      result.codes.add(row.intermediary_code);
    }
    if (row.intermediary_name && row.intermediary_name !== '(blank)') result.name += row.policy_count;
    return result;
  }, { policies: 0, code: 0, name: 0, codes: new Set<string>() });
  const routeTotals = scopedOutlets.reduce((result, row) => ({
    inhouse: result.inhouse + row.dealer_arranged_journeys,
    outside: result.outside + row.customer_arranged_journeys,
    unclear: result.unclear + row.source_ambiguous_journeys + row.source_unknown_journeys,
    policies: result.policies + row.insurance_journeys,
  }), { inhouse: 0, outside: 0, unclear: 0, policies: 0 });
  const classifiedRouteCount = routeTotals.inhouse + routeTotals.outside;
  const routeGroups = new Map<string, { label: string; inhouse: number; outside: number }>();
  scopedOutlets.forEach((row) => {
    const label = selectedDealer === 'All dealerships' ? row.dealer_name : row.outlet_name;
    const current = routeGroups.get(label) || { label, inhouse: 0, outside: 0 };
    current.inhouse += row.dealer_arranged_journeys;
    current.outside += row.customer_arranged_journeys;
    routeGroups.set(label, current);
  });
  const routeChartRows = Array.from(routeGroups.values())
    .map((row) => {
      const denominator = row.inhouse + row.outside;
      return {
        label: row.label.length > 28 ? `${row.label.slice(0, 25)}…` : row.label,
        inhouse: denominator ? (row.inhouse / denominator) * 100 : 0,
        outside: denominator ? (row.outside / denominator) * 100 : 0,
      };
    })
    .filter((row) => row.inhouse + row.outside > 0)
    .sort((a, b) => (b.inhouse + b.outside) - (a.inhouse + a.outside) || a.label.localeCompare(b.label))
    .slice(0, 12);
  const routeSeries = [
    { key: 'inhouse', name: 'In-house / dealer arranged', color: '#078ba0' },
    { key: 'outside', name: 'Outside / customer arranged', color: '#e07a22' },
  ];

  const agencyGroups = new Map<string, { label: string; counts: Map<string, number>; total: number }>();
  scopedRows.forEach((row) => {
    const code = row.intermediary_code && row.intermediary_code !== '(blank)' ? row.intermediary_code : 'Code unavailable';
    const name = row.intermediary_name && row.intermediary_name !== '(blank)' ? row.intermediary_name : 'Name unavailable';
    const label = `${code} · ${name}`;
    const groupKey = `${code}\\u0000${name}`;
    const split = selectedDealer === 'All dealerships' ? row.dealer_name : row.outlet_name;
    const group = agencyGroups.get(groupKey) || { label, counts: new Map<string, number>(), total: 0 };
    group.counts.set(split, (group.counts.get(split) || 0) + row.policy_count);
    group.total += row.policy_count;
    agencyGroups.set(groupKey, group);
  });
  const topAgencyGroups = Array.from(agencyGroups.values())
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label))
    .slice(0, 12);
  const agencyLabels = topAgencyGroups.map((group) => group.label);
  const agencySplits = Array.from(new Set(scopedRows.map((row) =>
    selectedDealer === 'All dealerships' ? row.dealer_name : row.outlet_name))).sort((a, b) => a.localeCompare(b));
  const agencyCells: Array<[number, number, number]> = [];
  topAgencyGroups.forEach((group, y) => agencySplits.forEach((split, x) => {
    const value = group.counts.get(split) || 0;
    if (value > 0) agencyCells.push([x, y, value]);
  }));
  const classifiedCoverage = routeTotals.policies
    ? `${((classifiedRouteCount / routeTotals.policies) * 100).toFixed(1)}%`
    : 'Unavailable';

  return (
    <SectionCard
      title="Insurance channel and agency-code analysis"
      description="Route percentages use only policies explicitly classified as dealer-arranged or customer/outside. Mixed and unspecified records remain separate. Agency codes use captured intermediary codes; MISP codes are not substituted."
    >
      <div className="analytics-pin-map__controls analytics-accessory-filters">
        <label>
          Dealership
          <select value={selectedDealer} onChange={(event) => { setSelectedDealer(event.target.value); setSelectedOutlet('All outlets'); }}>
            <option>All dealerships</option>
            {dealers.map((dealer) => <option key={dealer}>{dealer}</option>)}
          </select>
        </label>
        <label>
          Outlet
          <select value={selectedOutlet} onChange={(event) => setSelectedOutlet(event.target.value)}>
            <option>All outlets</option>
            {outletOptions.map((outlet) => <option key={outlet.key} value={outlet.key}>{outlet.label}</option>)}
          </select>
        </label>
        <p>{formatNumber(routeTotals.policies)} policy records in scope · {formatNumber(totals.codes.size)} captured agency codes · {formatNumber(totals.code)} records include a code · {formatNumber(totals.name)} include an agency name.</p>
      </div>
      <div className="analytics-insurance-banner">
        <Metric label="In-house / dealer arranged" value={`${formatNumber(routeTotals.inhouse)} · ${percent(routeTotals.inhouse, classifiedRouteCount)}`} detail="Count and share among explicitly classified route records" />
        <Metric label="Outside / customer arranged" value={`${formatNumber(routeTotals.outside)} · ${percent(routeTotals.outside, classifiedRouteCount)}`} detail="Count and share among explicitly classified route records" />
        <Metric label="Mixed or unspecified" value={formatNumber(routeTotals.unclear)} detail={`${classifiedCoverage} of policy records have a classifiable route; others are excluded from route percentages`} attention={routeTotals.unclear > 0} />
        <Metric label="Agency-code capture" value={percent(totals.code, totals.policies)} detail={`${formatNumber(totals.codes.size)} distinct captured intermediary codes in this scope`} attention={totals.code < totals.policies} />
      </div>
      <div className="analytics-split analytics-split--overview">
        <SectionCard title="In-house vs outside by dealership / outlet" description="Each bar is 100% of explicitly classified policies. Select a dealership to compare its outlets.">
          <AnalyticsStackedBarChart rows={routeChartRows} series={routeSeries} valueLabel="Share of classified policies" valueKind="percent" emptyText="No explicit in-house or outside route is available for this selection." />
        </SectionCard>
        <SectionCard title="Agency code and name by dealership / outlet" description="Heatmap compares the 12 most frequent captured agency code/name groups. Select a dealership or outlet to inspect the split. Blank codes remain labeled unavailable.">
          <AnalyticsHeatmap xLabels={agencySplits} yLabels={agencyLabels} cells={agencyCells} valueLabel="Policy records" emptyText="No captured intermediary code/name records are available for this selection." />
        </SectionCard>
      </div>
    </SectionCard>
  );
}

function AnalyticsAddonsReport({ data }: { data: AnalyticsVasData }) {
  const [selectedDealer, setSelectedDealer] = useState('All dealerships');
  const [selectedOutlet, setSelectedOutlet] = useState('All outlets');
  const [vasMetric, setVasMetric] = useState<'proposals' | 'invoice' | 'awaiting'>('proposals');
  const [accessoryMeasure, setAccessoryMeasure] = useState<'units' | 'net'>('units');
  const accessoryItems = data.accessory_items;
  const accessoryLineCoverage = data.accessory_line_coverage;
  const warrantyRsa = data.warranty_rsa;
  const reconciliation = data.booking_invoice_reconciliation;
  const locationRows = useMemo(() => {
    const locations = new Map<string, { dealer: string; outlet: string }>();
    [
      ...accessoryItems.map((row) => ({ dealer: row.dealer_name, outlet: row.outlet_name })),
      ...warrantyRsa.by_product.map((row) => ({ dealer: row.dealer_name, outlet: row.outlet_name })),
      ...reconciliation.by_dealer_model_variant.map((row) => ({ dealer: row.dealer_name, outlet: row.outlet_name })),
    ].forEach((row) => locations.set(`${row.dealer}::${row.outlet}`, row));
    return Array.from(locations.values());
  }, [accessoryItems, warrantyRsa.by_product, reconciliation.by_dealer_model_variant]);
  const dealers = useMemo(
    () => Array.from(new Set(locationRows.map((row) => row.dealer))).sort((a, b) => a.localeCompare(b)),
    [locationRows],
  );
  const outlets = useMemo(
    () => Array.from(new Set(locationRows
      .filter((row) => selectedDealer === 'All dealerships' || row.dealer === selectedDealer)
      .map((row) => selectedDealer === 'All dealerships' ? `${row.dealer} / ${row.outlet}` : row.outlet))).sort((a, b) => a.localeCompare(b)),
    [locationRows, selectedDealer],
  );
  const scopedAccessoryItems = useMemo(
    () => accessoryItems
      .filter((row) => selectedDealer === 'All dealerships' || row.dealer_name === selectedDealer)
      .filter((row) => selectedOutlet === 'All outlets' || (selectedDealer === 'All dealerships' ? `${row.dealer_name} / ${row.outlet_name}` : row.outlet_name) === selectedOutlet)
      .sort((a, b) => numeric(b.invoiced_quantity) - numeric(a.invoiced_quantity)
        || numeric(b.net_amount) - numeric(a.net_amount)
        || a.model_name.localeCompare(b.model_name)
        || a.item_description.localeCompare(b.item_description)),
    [accessoryItems, selectedDealer, selectedOutlet],
  );
  const dealerOutletInScope = (dealerName: string, outletName: string) =>
    (selectedDealer === 'All dealerships' || dealerName === selectedDealer)
    && (selectedOutlet === 'All outlets' || (selectedDealer === 'All dealerships' ? `${dealerName} / ${outletName}` : outletName) === selectedOutlet);
  const accessoryItemGroups = new Map<string, { label: string; quantity: number; netAmount: number; splits: Map<string, number>; netSplits: Map<string, number> }>();
  const accessoryModelItemGroups = new Map<string, { model: string; item: string; quantity: number }>();
  scopedAccessoryItems.forEach((row) => {
    const item = `${row.item_description}${row.item_code ? ` · ${row.item_code}` : ''}`;
    const itemKey = `${row.item_code || row.item_description}`;
    const split = selectedDealer === 'All dealerships'
      ? row.dealer_name
      : selectedOutlet === 'All outlets' ? row.outlet_name : selectedOutlet;
    const current = accessoryItemGroups.get(itemKey) || { label: item, quantity: 0, netAmount: 0, splits: new Map<string, number>(), netSplits: new Map<string, number>() };
    const quantity = numeric(row.invoiced_quantity);
    current.quantity += quantity;
    current.netAmount += numeric(row.net_amount);
    current.splits.set(split, (current.splits.get(split) || 0) + quantity);
    current.netSplits.set(split, (current.netSplits.get(split) || 0) + numeric(row.net_amount));
    accessoryItemGroups.set(itemKey, current);
    const modelKey = row.model_name || 'Unresolved model';
    const modelItemKey = `${modelKey}\\u0000${itemKey}`;
    const modelItem = accessoryModelItemGroups.get(modelItemKey) || { model: modelKey, item, quantity: 0 };
    modelItem.quantity += quantity;
    accessoryModelItemGroups.set(modelItemKey, modelItem);
  });
  const accessorySplitNames = selectedDealer === 'All dealerships'
    ? dealers
    : selectedOutlet === 'All outlets' ? outlets : [selectedOutlet];
  const accessorySplitColors = ['#1769aa', '#e07a22', '#238b64', '#8053a6', '#b34a62', '#598a9b', '#9b7d2b', '#526477'];
  const accessorySplitSeries = accessorySplitNames.map((name, index) => ({
    key: `split_${index}`,
    name,
    color: accessorySplitColors[index % accessorySplitColors.length],
  })).filter((series) => Array.from(accessoryItemGroups.values()).some((item) => (accessoryMeasure === 'units' ? item.splits : item.netSplits).get(series.name)));
  const topAccessoryItems = Array.from(accessoryItemGroups.values())
    .sort((a, b) => (accessoryMeasure === 'units' ? b.quantity - a.quantity : b.netAmount - a.netAmount) || a.label.localeCompare(b.label))
    .slice(0, 10);
  const accessoryChartRows = topAccessoryItems.map((item) => {
    const row: Record<string, string | number> & { label: string } = { label: item.label.length > 34 ? `${item.label.slice(0, 31)}…` : item.label };
    accessorySplitSeries.forEach((series) => {
      row[series.key] = (accessoryMeasure === 'units' ? item.splits : item.netSplits).get(series.name) || 0;
    });
    return row;
  });
  const accessoryItemLabels = topAccessoryItems.slice(0, 8).map((item) => item.label);
  const topAccessoryModels = Array.from(new Set(Array.from(accessoryModelItemGroups.values()).map((row) => row.model)))
    .map((model) => ({ model, quantity: Array.from(accessoryModelItemGroups.values()).filter((row) => row.model === model).reduce((sum, row) => sum + row.quantity, 0) }))
    .sort((a, b) => b.quantity - a.quantity || a.model.localeCompare(b.model)).slice(0, 8);
  const modelItemCells = new Map<string, number>();
  accessoryModelItemGroups.forEach((row) => {
    const x = accessoryItemLabels.indexOf(row.item);
    const y = topAccessoryModels.findIndex((model) => model.model === row.model);
    if (x >= 0 && y >= 0) {
      const key = `${x}:${y}`;
      modelItemCells.set(key, (modelItemCells.get(key) || 0) + row.quantity);
    }
  });
  const accessoryHeatmapCells = Array.from(modelItemCells.entries()).map(([key, quantity]) => {
    const [x, y] = key.split(':').map(Number);
    return [x, y, quantity] as [number, number, number];
  });
  const accessoryUnitTotal = Array.from(accessoryItemGroups.values()).reduce((sum, item) => sum + item.quantity, 0);
  const accessoryNetTotal = Array.from(accessoryItemGroups.values()).reduce((sum, item) => sum + item.netAmount, 0);
  const vasAttachGroups = new Map<string, { label: string; dealer: string; outlet: string; category: string; proposals: number; invoice: number; awaiting: number }>();
  reconciliation.by_dealer_model_variant
    .filter((row) => ['EW', 'RSA', 'FASTAG', 'ACCESSORIES'].includes(row.category))
    .filter((row) => dealerOutletInScope(row.dealer_name, row.outlet_name))
    .forEach((row) => {
      const label = `${row.dealer_name} / ${row.outlet_name} · ${humanize(row.category)}`;
      const current = vasAttachGroups.get(label) || { label, dealer: row.dealer_name, outlet: row.outlet_name, category: row.category, proposals: 0, invoice: 0, awaiting: 0 };
      current.proposals += row.booked_proposal_journeys;
      current.invoice += row.delivery_invoice_purchase_journeys;
      current.awaiting += row.invoice_awaiting_journeys;
      vasAttachGroups.set(label, current);
    });
  const vasStateRows = Array.from(vasAttachGroups.values()).sort((a, b) => a.category.localeCompare(b.category) || a.label.localeCompare(b.label));
  const vasCategories = ['EW', 'RSA', 'FASTAG', 'ACCESSORIES'];
  const vasOutlets = Array.from(new Set(vasStateRows.map((row) => `${row.dealer} / ${row.outlet}`))).sort();
  const vasMetricLabels = { proposals: 'Booking proposals', invoice: 'Confirmed invoice purchases', awaiting: 'Invoice awaiting' };
  const vasHeatmapCells: Array<[number, number, number]> = [];
  vasStateRows.forEach((row) => {
    const x = vasCategories.indexOf(row.category);
    const y = vasOutlets.indexOf(`${row.dealer} / ${row.outlet}`);
    const value = row[vasMetric];
    if (x >= 0 && y >= 0 && value > 0) vasHeatmapCells.push([x, y, value]);
  });
  const ewTermGroups = new Map<string, { label: string; fourYear: number; fiveYear: number; unknown: number }>();
  warrantyRsa.by_product
    .filter((row) => row.product_type === 'EW' && dealerOutletInScope(row.dealer_name, row.outlet_name))
    .forEach((row) => {
      const key = `${row.dealer_name}\\u0000${row.outlet_name}\\u0000${row.model_name}\\u0000${row.variant_name}`;
      const label = `${row.dealer_name} · ${row.outlet_name} · ${row.model_name} / ${row.variant_name}`;
      const current = ewTermGroups.get(key) || { label, fourYear: 0, fiveYear: 0, unknown: 0 };
      current.fourYear += row.four_year_journeys;
      current.fiveYear += row.five_year_journeys;
      current.unknown += row.term_not_recorded_journeys;
      ewTermGroups.set(key, current);
    });
  const ewTermRows = Array.from(ewTermGroups.values())
    .sort((a, b) => (b.fourYear + b.fiveYear + b.unknown) - (a.fourYear + a.fiveYear + a.unknown) || a.label.localeCompare(b.label))
    .slice(0, 15);
  const ewTermTotals = ewTermRows.reduce((total, row) => ({
    fourYear: total.fourYear + row.fourYear,
    fiveYear: total.fiveYear + row.fiveYear,
    unknown: total.unknown + row.unknown,
  }), { fourYear: 0, fiveYear: 0, unknown: 0 });
  const ewDetailRows = reconciliation.by_dealer_model_variant
    .filter((row) => row.category === 'EW' && dealerOutletInScope(row.dealer_name, row.outlet_name));
  const ewStateTotals = ewDetailRows.reduce((total, row) => ({
    proposals: total.proposals + row.booked_proposal_journeys,
    invoice: total.invoice + row.delivery_invoice_purchase_journeys,
    awaiting: total.awaiting + row.invoice_awaiting_journeys,
  }), { proposals: 0, invoice: 0, awaiting: 0 });
  const ewAttachGroups = new Map<string, { label: string; proposals: number; invoice: number }>();
  ewDetailRows.forEach((row) => {
    const key = `${row.dealer_name}\\u0000${row.outlet_name}`;
    const label = `${row.dealer_name} · ${row.outlet_name}`;
    const current = ewAttachGroups.get(key) || { label, proposals: 0, invoice: 0 };
    current.proposals += row.booked_proposal_journeys;
    current.invoice += row.delivery_invoice_purchase_journeys;
    ewAttachGroups.set(key, current);
  });
  const ewAttachRows = Array.from(ewAttachGroups.values())
    .filter((row) => row.proposals > 0)
    .map((row) => ({ label: row.label.length > 30 ? `${row.label.slice(0, 27)}…` : row.label, proposals: row.proposals, invoice: row.invoice, rate: (row.invoice / row.proposals) * 100 }))
    .sort((a, b) => b.rate - a.rate || b.proposals - a.proposals)
    .slice(0, 12);
  const ewHeatmapCells: Array<[number, number, number]> = [];
  ewTermRows.forEach((row, index) => {
    ([[0, row.fourYear], [1, row.fiveYear], [2, row.unknown]] as const).forEach(([termIndex, count]) => {
      if (count > 0) ewHeatmapCells.push([termIndex, index, count]);
    });
  });

  return (
    <>
      <SectionCard
        title="Booking proposals and invoice evidence"
        description="Three business states only: captured booking proposals, VAS purchases evidenced on a confirmed tax invoice, and proposals awaiting a delivery record. These are separate measures, not a funnel total."
      >
        <p className="analytics-footnote">Invoice purchases count only when the VAS is evidenced on a confirmed tax invoice. “Invoice awaiting” is limited to a booking proposal with no delivery record uploaded. If a delivery record exists but no confirmed VAS invoice line is found, it is not relabeled as awaiting or as a purchase. Counts are distinct journeys.</p>
        <DetailTable
          title="Explore VAS evidence by category"
          headers={['VAS', 'Booking proposal', 'Invoice', 'Invoice awaiting']}
          rows={reconciliation.by_category.map((row) => [
            humanize(row.category),
            formatNumber(row.booked_proposal_journeys),
            formatNumber(row.delivery_invoice_purchase_journeys),
            formatNumber(row.invoice_awaiting_journeys),
          ])}
        />
        <DetailTable
          title="VAS attach by dealership and outlet"
          headers={['Dealer / outlet / VAS', 'Booking proposal', 'Invoice', 'Invoice awaiting']}
          rows={Array.from(reconciliation.by_dealer_model_variant.reduce((groups, row) => {
            const key = `${row.dealer_name}\u0000${row.outlet_name}\u0000${row.category}`;
            const current = groups.get(key) || { label: `${row.dealer_name} / ${row.outlet_name} · ${humanize(row.category)}`, proposals: 0, bought: 0, awaiting: 0 };
            current.proposals += row.booked_proposal_journeys;
            current.bought += row.delivery_invoice_purchase_journeys;
            current.awaiting += row.invoice_awaiting_journeys;
            groups.set(key, current);
            return groups;
          }, new Map<string, { label: string; proposals: number; bought: number; awaiting: number }>()).values())
            .sort((a, b) => a.label.localeCompare(b.label))
            .map((row) => [row.label, formatNumber(row.proposals), formatNumber(row.bought), formatNumber(row.awaiting)])}
        />
        <DetailTable
        title="Explore vehicle and outlet evidence details"
          headers={['Dealer / outlet / vehicle / VAS', 'Booking proposal', 'Invoice', 'Invoice awaiting']}
          rows={reconciliation.by_dealer_model_variant.map((row) => [
            `${row.dealer_name} / ${row.outlet_name} · ${row.model_name} ${row.variant_name} · ${humanize(row.category)}`,
            formatNumber(row.booked_proposal_journeys),
            formatNumber(row.delivery_invoice_purchase_journeys),
            formatNumber(row.invoice_awaiting_journeys),
          ])}
        />
      </SectionCard>

      <div className="analytics-split analytics-split--overview">
        <SectionCard title="Accessory sales at a glance" description="Confirmed accessory-purpose tax-invoice evidence in this project snapshot; values below follow the selected dealership and outlet.">
          <div className="analytics-accessory-summary">
            <Metric label="Invoiced accessory units" value={formatNumber(accessoryUnitTotal)} detail={`${formatNumber(topAccessoryItems.length)} leading item groups shown in the chart`} />
            <Metric label="Distinct invoice item groups" value={formatNumber(accessoryItemGroups.size)} detail={`${formatNumber(accessoryLineCoverage.confirmed_tax_invoices)} confirmed invoices · ${formatNumber(accessoryLineCoverage.confirmed_tax_invoice_lines)} confirmed lines`} />
            <Metric label="Captured net invoice value" value={formatMoney(accessoryNetTotal)} detail="Summed from confirmed accessory invoice lines with captured net amounts" />
            <Metric label="Invoice lines with quantity" value={`${formatNumber(accessoryLineCoverage.confirmed_lines_with_quantity)} / ${formatNumber(accessoryLineCoverage.confirmed_tax_invoice_lines)}`} detail={`${formatNumber(accessoryLineCoverage.confirmed_lines_with_item_label)} lines also carry an item label`} attention={accessoryLineCoverage.confirmed_lines_with_quantity < accessoryLineCoverage.confirmed_tax_invoice_lines} />
          </div>
        </SectionCard>
      </div>

      <div className="analytics-pin-map__controls analytics-accessory-filters">
        <label>
          Dealership
          <select value={selectedDealer} onChange={(event) => {
            setSelectedDealer(event.target.value);
            setSelectedOutlet('All outlets');
          }}>
            <option>All dealerships</option>
            {dealers.map((dealer) => <option key={dealer}>{dealer}</option>)}
          </select>
        </label>
        <label>
          Outlet
          <select value={selectedOutlet} onChange={(event) => setSelectedOutlet(event.target.value)}>
            <option>All outlets</option>
            {outlets.map((outlet) => <option key={outlet}>{outlet}</option>)}
          </select>
        </label>
        <label>Accessory chart measure<select value={accessoryMeasure} onChange={(event) => setAccessoryMeasure(event.target.value as 'units' | 'net')}><option value="units">Invoiced units</option><option value="net">Captured net invoice value</option></select></label>
        <p>{formatNumber(scopedAccessoryItems.length)} captured outlet/model/item groups in scope. Charts compare confirmed invoice units or captured net value by dealer and show model-to-accessory choices.</p>
      </div>

      <div className="analytics-split analytics-split--overview">
        <SectionCard title={accessoryMeasure === 'units' ? 'Top accessories by invoiced units' : 'Top accessories by captured net value'} description={accessoryMeasure === 'units' ? 'Confirmed invoice quantities, split by dealership or outlet. Use the model heatmap beside it to see which vehicles take each item.' : 'Captured net amounts from confirmed accessory-purpose tax invoices, split by dealership or outlet. This is invoice value, not dealership margin.'}>
          <AnalyticsStackedBarChart rows={accessoryChartRows} series={accessorySplitSeries} valueLabel={accessoryMeasure === 'units' ? 'Invoiced units' : 'Captured net value'} valueKind={accessoryMeasure === 'units' ? 'count' : 'currency'} emptyText={accessoryMeasure === 'units' ? 'No confirmed accessory invoice quantities are available for this selection.' : 'No captured net invoice amounts are available for this selection.'} />
        </SectionCard>
        <SectionCard title="Accessory choice by vehicle model" description="The heatmap shows confirmed invoiced units for the leading accessory items across the leading models in the selected dealership/outlet scope.">
          <AnalyticsHeatmap
            xLabels={accessoryItemLabels}
            xLabelRotate={38}
            yLabels={topAccessoryModels.map((row) => row.model)}
            cells={accessoryHeatmapCells}
            valueLabel="Invoiced units"
            emptyText="No model-to-accessory invoice evidence is available for this selection."
          />
        </SectionCard>
      </div>

      <SectionCard title="Extended warranty · attach and term insight" description="The headline counts follow the three agreed states. The heatmap shows 4-year, 5-year and unrecorded-term evidence by dealership, outlet, model and variant.">
        <div className="analytics-insurance-banner">
          <Metric label="EW booking proposals" value={formatNumber(ewStateTotals.proposals)} detail="Captured EW proposal records linked to bookings in the selected scope" />
          <Metric label="EW confirmed invoice purchases" value={formatNumber(ewStateTotals.invoice)} detail="EW only when a confirmed tax-invoice line matches" />
          <Metric label="EW invoice awaiting" value={formatNumber(ewStateTotals.awaiting)} detail="Booking proposal exists and no delivery record is uploaded" />
          <Metric label="EW invoice attach rate" value={ewStateTotals.proposals ? percent(ewStateTotals.invoice, ewStateTotals.proposals) : 'Unavailable'} detail={`${formatNumber(ewStateTotals.invoice)} confirmed invoice purchases from ${formatNumber(ewStateTotals.proposals)} booking proposals`} />
          <Metric label="4-year term captured" value={formatNumber(ewTermTotals.fourYear)} detail="EW journeys with explicit 4-year term evidence" />
          <Metric label="5-year term captured" value={formatNumber(ewTermTotals.fiveYear)} detail="EW journeys with explicit 5-year term evidence" />
          <Metric label="Term not recorded" value={formatNumber(ewTermTotals.unknown)} detail="EW evidence exists without a 4-year or 5-year term" attention={ewTermTotals.unknown > 0} />
        </div>
        <AnalyticsHeatmap
          xLabels={['4-year', '5-year', 'Term not recorded']}
          yLabels={ewTermRows.map((row) => row.label)}
          cells={ewHeatmapCells}
          valueLabel="EW term evidence"
          emptyText="No EW term evidence is available for the selected dealership/outlet."
        />
      </SectionCard>

      <SectionCard title="EW invoice attachment by dealership / outlet" description="Confirmed EW invoice purchases divided by booking proposals. A missing invoice on a completed delivery is not treated as invoice awaiting.">
        <AnalyticsBarChart rows={ewAttachRows.map((row) => ({ label: row.label, value: row.rate }))} valueLabel="Confirmed invoice purchases / booking proposals" valueKind="percent" emptyText="No EW booking proposals are available for this scope." />
      </SectionCard>

      <SectionCard title="VAS sold / proposed · dealer and outlet heatmap" description="Compare the selected journey count across EW, RSA, FASTAG, and accessories for each dealership/outlet. Use the measure selector to switch among captured booking proposals, confirmed tax-invoice purchases, and invoice awaiting.">
        <label className="analytics-chart-measure">Measure<select value={vasMetric} onChange={(event) => setVasMetric(event.target.value as typeof vasMetric)}><option value="proposals">Booking proposals</option><option value="invoice">Confirmed invoice purchases</option><option value="awaiting">Invoice awaiting</option></select></label>
        <AnalyticsHeatmap
          xLabels={['EW', 'RSA', 'FASTAG', 'Accessories']}
          yLabels={vasOutlets}
          cells={vasHeatmapCells}
          valueLabel={vasMetricLabels[vasMetric]}
          emptyText="No VAS counts are available for the selected dealership/outlet and measure."
        />
        {!vasStateRows.length ? <p className="analytics-chart-empty">No VAS counts are available for this selection.</p> : null}
      </SectionCard>

      {accessoryItems.length > 0 ? (
        <DetailTable
          title="Accessories sold by dealership, outlet, model, variant and item"
          headers={['Dealer', 'Outlet', 'Model', 'Variant', 'Category', 'Accessory item', 'Item code', 'Invoice source', 'Invoices', 'Invoice lines', 'Qty invoiced', 'Net sales', 'Discount captured']}
          rows={scopedAccessoryItems.map((row) => [
            row.dealer_name,
            row.outlet_name,
            row.model_name,
            row.variant_name,
            humanize(row.line_category),
            row.item_description,
            row.item_code || 'Unavailable',
            row.invoice_sources || 'Unspecified',
            formatNumber(row.invoice_count),
            formatNumber(row.invoice_lines),
            formatOptionalNumber(row.invoiced_quantity),
            formatOptionalMoney(row.net_amount),
            formatOptionalMoney(row.line_discount_amount),
          ])}
        />
      ) : (
        <SectionCard title="Accessory invoice items" description="No confirmed accessory tax-invoice lines were captured for this project in the current snapshot." />
      )}

      <DetailTable
        title="Extended warranty term by dealership, outlet, model and variant"
        headers={['Dealer', 'Outlet', 'Model', 'Variant', 'Warranty journeys', '4-year', '5-year', 'Term not recorded', 'Booking add-on source', 'Tax-invoice description source']}
        rows={warrantyRsa.by_product.filter((row) => row.product_type === 'EW').map((row) => [
          row.dealer_name,
          row.outlet_name,
          row.model_name,
          row.variant_name,
          formatNumber(row.journey_count),
          formatNumber(row.four_year_journeys),
          formatNumber(row.five_year_journeys),
          formatNumber(row.term_not_recorded_journeys),
          formatNumber(row.addon_source_journeys),
          formatNumber(row.invoice_source_journeys),
        ])}
      />
      {warrantyRsa.ew_journey_count === 0 && (
        <p className="analytics-footnote">No EW-coded add-on or warranty-described confirmed invoice evidence was found in this snapshot. This does not establish that no warranty was sold outside the captured sources.</p>
      )}

      <DetailTable
        title="Accessory pricing audit: comparable standard versus actual charges"
        headers={['Dealer', 'Outlet', 'Model', 'Variant', 'Evidence Rows', 'Comparable Rows', 'Comparable Standard', 'Comparable Actual', 'Actual − Standard']}
        rows={data.accessory_cost_by_product.map((row) => [
          row.dealer_name,
          row.outlet_name,
          row.model_name,
          row.variant_name,
          formatNumber(row.evidence_rows),
          formatNumber(row.comparable_rows),
          formatOptionalMoney(row.comparable_standard_amount),
          formatOptionalMoney(row.comparable_actual_amount),
          formatOptionalMoney(row.comparable_actual_minus_standard),
        ])}
      />
      <p className="analytics-footnote">{data.definition}</p>
    </>
  );
}

type SalesProductData = Extract<AnalyticsBusinessReportPayload, { kind: 'sales-product' }>['data'];

function AnalyticsSalesProductReport({ data }: { data: SalesProductData }) {
  const [measure, setMeasure] = useState<'booked_units' | 'delivered_units'>('booked_units');
  const [locationLevel, setLocationLevel] = useState<'dealership' | 'outlet'>('dealership');
  const [selectedDealer, setSelectedDealer] = useState('All dealerships');
  const [productLevel, setProductLevel] = useState<'model' | 'variant'>('model');
  const dealerRows = data.by_dealer_model_variant;
  const dealerOptions = useMemo(
    () => Array.from(new Set(dealerRows.map((row) => row.dealer_name))).sort((a, b) => a.localeCompare(b)),
    [dealerRows],
  );
  const retailDeliveryCount = dealerRows.reduce((sum, row) => sum + row.delivered_units, 0);
  const effectiveMeasure = measure === 'delivered_units' && retailDeliveryCount > 0 ? measure : 'booked_units';
  const scopedRows = dealerRows.filter((row) => selectedDealer === 'All dealerships' || row.dealer_name === selectedDealer);
  const locations = new Map<string, Map<string, number>>();
  scopedRows.forEach((row) => {
    const location = locationLevel === 'dealership'
      ? row.dealer_name
      : `${row.dealer_name} · ${row.outlet_name}`;
    const product = productLevel === 'model'
      ? row.model_name
      : `${row.model_name} · ${row.variant_name}`;
    const count = row[effectiveMeasure];
    const products = locations.get(location) || new Map<string, number>();
    products.set(product, (products.get(product) || 0) + count);
    locations.set(location, products);
  });
  const productTotals = new Map<string, number>();
  locations.forEach((products) => products.forEach((count, product) => {
    productTotals.set(product, (productTotals.get(product) || 0) + count);
  }));
  const rankedProducts = Array.from(productTotals.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const leadingProducts = rankedProducts.slice(0, 8).map(([product]) => product);
  const leadingSet = new Set(leadingProducts);
  const otherTotal = rankedProducts.slice(8).reduce((sum, [, count]) => sum + count, 0);
  const productLabels = otherTotal > 0 ? [...leadingProducts, 'Other models'] : leadingProducts;
  const rankedLocations = Array.from(locations.entries())
    .map(([label, products]) => ({
      label,
      products,
      total: Array.from(products.values()).reduce((sum, count) => sum + count, 0),
    }))
    .filter((row) => row.total > 0)
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
  const chartRows = rankedLocations.map(({ label, products }) => ({ label, products }));
  const cells: Array<[number, number, number]> = [];
  chartRows.forEach((row, y) => {
    productLabels.forEach((product, x) => {
      const value = product === 'Other models'
        ? Array.from(row.products.entries()).reduce((sum, [name, count]) => sum + (leadingSet.has(name) ? 0 : count), 0)
        : row.products.get(product) || 0;
      cells.push([x, y, value]);
    });
  });
  const unitTotal = rankedLocations.reduce((sum, row) => sum + row.total, 0);
  const productLeader = rankedProducts[0];
  const locationLeader = rankedLocations[0];
  const unresolvedUnits = scopedRows
    .filter((row) => row.model_name === 'Unresolved' || (productLevel === 'variant' && row.variant_name === 'Unresolved'))
    .reduce((sum, row) => sum + row[effectiveMeasure], 0);
  const measureLabel = effectiveMeasure === 'delivered_units' ? 'Retail deliveries' : 'Bookings';
  const locationCount = rankedLocations.length;

  return (
    <>
      <div className="analytics-pin-map__controls analytics-accessory-filters">
        <label>
          Measure
          <select value={effectiveMeasure} onChange={(event) => setMeasure(event.target.value as 'booked_units' | 'delivered_units')}>
            <option value="booked_units">Bookings</option>
            <option value="delivered_units" disabled={retailDeliveryCount === 0}>Deliveries (Retail)</option>
          </select>
        </label>
        <label>
          Show by
          <select value={locationLevel} onChange={(event) => setLocationLevel(event.target.value as 'dealership' | 'outlet')}>
            <option value="dealership">Dealership</option>
            <option value="outlet">Outlet</option>
          </select>
        </label>
        <label>
          Dealership
          <select value={selectedDealer} onChange={(event) => setSelectedDealer(event.target.value)}>
            <option>All dealerships</option>
            {dealerOptions.map((dealer) => <option key={dealer}>{dealer}</option>)}
          </select>
        </label>
        <label>
          Product detail
          <select value={productLevel} onChange={(event) => setProductLevel(event.target.value as 'model' | 'variant')}>
            <option value="model">Model</option>
            <option value="variant">Model and variant</option>
          </select>
        </label>
      </div>

      <div className="analytics-insurance-banner">
        <Metric label={measureLabel} value={formatNumber(unitTotal)} detail={selectedDealer === 'All dealerships' ? 'Across the selected project and visible location grouping' : `At ${selectedDealer}`} />
        <Metric label={locationLevel === 'dealership' ? 'Dealerships with volume' : 'Outlets with volume'} value={formatNumber(locationCount)} detail={locationLevel === 'dealership' ? 'Dealerships with captured units in this view' : 'Outlets with captured units; labels include dealership to distinguish locations'} />
        <Metric label={`Top ${productLevel === 'model' ? 'model' : 'model / variant'}`} value={productLeader?.[0] || 'No data'} detail={productLeader ? `${formatNumber(productLeader[1])} ${measureLabel.toLowerCase()}` : 'No captured vehicle units for this selection'} />
        <Metric label="Top location" value={locationLeader?.label || 'No data'} detail={locationLeader ? `${formatNumber(locationLeader.total)} ${measureLabel.toLowerCase()}` : 'No captured vehicle units for this selection'} />
      </div>

      <SectionCard
        title={`${measureLabel} by ${locationLevel} and ${productLevel === 'model' ? 'model' : 'model / variant'}`}
        description={`Each cell shows ${measureLabel.toLowerCase()} for that model at that dealership or outlet. The 8 highest-volume products are shown individually; the remainder is grouped as Other models. ${effectiveMeasure === 'booked_units' && retailDeliveryCount === 0 ? 'No actual retail delivery timestamps are captured, so bookings are shown.' : ''}`}
      >
        <AnalyticsHeatmap
          xLabels={productLabels}
          yLabels={rankedLocations.map((row) => row.label)}
          cells={cells}
          valueLabel={measureLabel}
          emptyText="No model-level booking or retail delivery counts are available for this dealership/outlet selection."
        />
        {unresolvedUnits > 0 && <p className="analytics-footnote">{formatNumber(unresolvedUnits)} selected {measureLabel.toLowerCase()} have an unresolved {productLevel === 'model' ? 'model' : 'model or variant'} label. Check model catalogue mapping before comparing these volumes.</p>}
      </SectionCard>
    </>
  );
}

export default function AnalyticsBusinessReportViews({ payload }: { payload: AnalyticsBusinessReportPayload }) {
  switch (payload.kind) {
    case 'sales-product': {
      return <AnalyticsSalesProductReport data={payload.data} />;
    }

    case 'finance': {
      const { summary, by_lender_outlet: lenderOutletRows, by_outlet: outlets, definition } = payload.data;
      const lenderTotals = new Map<string, number>();
      lenderOutletRows.filter((row) => row.confidence.toUpperCase() === 'HIGH').forEach((row) => {
        lenderTotals.set(row.lender_name, (lenderTotals.get(row.lender_name) || 0) + numeric(row.loan_amount));
      });
      const topLenders = Array.from(lenderTotals.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4);
      const lenderSeries = [
        ...topLenders.map(([name], index) => ({
          key: `lender_${index}`,
          name: humanize(name),
          color: ['#07366b', '#078ba0', '#d78b2b', '#6f83c7'][index],
        })),
        { key: 'other', name: 'Other lenders', color: '#9aa9b7' },
      ];
      const portfolio = new Map<string, Record<string, string | number> & { label: string; total: number }>();
      lenderOutletRows.filter((row) => row.confidence.toUpperCase() === 'HIGH').forEach((row) => {
        const label = `${row.dealer_name} · ${row.outlet_name}`;
        const target: Record<string, string | number> & { label: string; total: number } = portfolio.get(label) || { label, total: 0 };
        target.total += numeric(row.loan_amount);
        const lenderIndex = topLenders.findIndex(([name]) => name === row.lender_name);
        const seriesKey = lenderIndex >= 0 ? `lender_${lenderIndex}` : 'other';
        target[seriesKey] = numeric(target[seriesKey]) + numeric(row.loan_amount);
        portfolio.set(label, target);
      });
      const portfolioRows = Array.from(portfolio.values()).sort((a, b) => b.total - a.total).slice(0, 10);
      const attachRows = outlets
        .map((row) => ({ label: `${row.dealer_name} · ${row.outlet_name}`, value: numeric(row.finance_record_attach_pct) }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 12);

      return (
        <>
          <div className="analytics-insurance-banner">
            <Metric label="Finance record rate" value={formatPercent(summary.finance_record_attach_pct == null ? null : numeric(summary.finance_record_attach_pct))} detail={`${formatNumber(summary.financed_journeys)} of ${formatNumber(summary.booked_journeys)} booked journeys have a finance record; not an approval rate`} />
            <Metric label="High-confidence loan amount" value={formatMoney(summary.high_confidence_loan_amount)} detail={`${formatNumber(summary.high_confidence_loan_records)} records with a high-confidence amount`} />
            <Metric label="Medium-confidence amount" value={formatMoney(summary.medium_confidence_loan_amount)} detail="Shown separately; not attributed to a lender in the chart" />
            <Metric label="Loan amount coverage" value={formatPercent(summary.loan_amount_capture_pct)} detail={`${formatNumber(summary.high_confidence_loan_records + summary.medium_confidence_loan_records)} amount records of ${formatNumber(summary.finance_record_count)} finance records`} />
          </div>

          <div className="analytics-split analytics-split--wide-left">
            <SectionCard title="High-confidence loan amount by outlet and lender" description="Each bar is an outlet; color separates lender-attributed loan amounts. Only high-confidence lender matches are included. The largest four lenders are shown separately; remaining lenders are grouped.">
              <AnalyticsStackedBarChart rows={portfolioRows} series={lenderSeries} valueLabel="High-confidence loan amount" valueKind="currency" emptyText="No high-confidence lender-attributed loan amounts are available in this snapshot." />
            </SectionCard>
            <SectionCard title="Finance record attach by outlet" description="Share of booked journeys with a finance record. This is not an approval, sanction, or disbursement rate.">
              <AnalyticsBarChart rows={attachRows} valueLabel="Journeys with finance record" valueKind="percent" emptyText="No outlet-level finance record rate is available." />
            </SectionCard>
          </div>
          <p className="analytics-footnote">{definition}</p>
        </>
      );
    }

    case 'insurance': {
      const {
        summary,
        by_insurer: insurers,
        by_insurer_outlet: insurersByOutlet,
        by_source_outlet: sourceByOutlet,
        by_route: routes,
        by_outlet: outlets,
        add_ons: addOns,
        definition,
      } = payload.data;
      const routeLabel = (route: string) => ({
        DEALER_ARRANGED: 'Dealer arranged',
        CUSTOMER_ARRANGED: 'Customer arranged / outside',
        MIXED_OR_UNCLEAR: 'Mixed or unclear',
        UNSPECIFIED: 'Unspecified',
      }[route] || humanize(route));
      const sourceRows = routes.map((row) => ({ label: routeLabel(row.route), value: row.policy_count }));
      const insurerRows = insurers.map((row) => ({ label: humanize(row.insurer_name), value: numeric(row.premium_amount) }));
      return (
        <>
          <div className="analytics-insurance-banner">
            <Metric label="Insurance record rate" value={formatPercent(summary.insurance_record_rate_pct)} detail={`${formatNumber(summary.insurance_journeys)} of ${formatNumber(summary.booked_journeys)} booked journeys have a policy record`} />
            <Metric label="Dealer arranged" value={formatNumber(summary.dealer_arranged_journeys)} detail={`${percent(summary.dealer_arranged_journeys, summary.insurance_journeys)} of policy records, based on explicit dealer labels`} />
            <Metric label="Customer arranged / outside" value={formatNumber(summary.customer_arranged_journeys)} detail={`${percent(summary.customer_arranged_journeys, summary.insurance_journeys)} of policy records, based on explicit customer or own labels`} />
            <Metric label="Route unclear or missing" value={formatNumber(summary.source_ambiguous_journeys + summary.source_unknown_journeys)} detail={`${formatNumber(summary.source_ambiguous_journeys)} mixed · ${formatNumber(summary.source_unknown_journeys)} unspecified; excluded from dealer/outside totals`} attention={summary.source_ambiguous_journeys + summary.source_unknown_journeys > 0} />
            <Metric label="Route evidence coverage" value={formatPercent(summary.route_information_coverage_pct)} detail={`${formatNumber(summary.route_information_populated)} of ${formatNumber(summary.insurance_journeys)} policy records carry route or self-insurance evidence`} />
            <Metric label="Captured premium" value={formatMoney(summary.premium_amount)} detail={`${formatNumber(summary.premium_populated)} of ${formatNumber(summary.insurance_journeys)} policy records have a premium value (${percent(summary.premium_populated, summary.insurance_journeys)})`} />
            <Metric label="Premium variance vs standard" value={formatOptionalMoney(summary.premium_variance_amount)} detail={`${formatNumber(summary.premium_comparable)} policies have both actual and standard premium; positive values are above the captured standard`} attention={numeric(summary.premium_variance_amount) > 0} />
          </div>

          <div className="analytics-split analytics-split--insurance">
            <SectionCard title="Insurance route mix" description="Dealer-arranged, customer/outside, and unclear routes are separated using explicit captured source evidence.">
              <AnalyticsDonutChart rows={sourceRows} valueLabel="Policy records" />
            </SectionCard>
            <SectionCard title="Premium portfolio by insurer" description="Area represents captured policy premium by insurer. This premium is not assumed to be dealership revenue.">
              <AnalyticsTreemap rows={insurerRows} valueLabel="Captured premium" valueKind="currency" />
            </SectionCard>
          </div>

          <AnalyticsIntermediaryChart rows={sourceByOutlet} outlets={outlets} />

          <DetailTable
            title="Insurance route and premium coverage by dealership / outlet"
            headers={['Dealer', 'Outlet', 'Booked Journeys', 'Policy Records', 'Dealer Arranged', 'Customer / Outside', 'Mixed', 'Unspecified', 'Premium Values', 'Captured Premium', 'Comparable Policies', 'Standard Premium', 'Actual − Standard']}
            rows={outlets.map((row) => [
              row.dealer_name,
              row.outlet_name,
              formatNumber(row.booked_journeys),
              formatNumber(row.insurance_journeys),
              formatNumber(row.dealer_arranged_journeys),
              formatNumber(row.customer_arranged_journeys),
              formatNumber(row.source_ambiguous_journeys),
              formatNumber(row.source_unknown_journeys),
              formatNumber(row.premium_populated),
              formatMoney(row.premium_amount),
              formatNumber(row.premium_comparable),
              formatOptionalMoney(row.standard_premium_amount),
              formatOptionalMoney(row.premium_variance_amount),
            ])}
          />

          <DetailTable
            title="Insurance components captured from policy evidence"
            headers={['Dealer', 'Outlet', 'Insurance Component', 'Policies', 'Share of Outlet Policies', 'Source Terms']}
            rows={addOns.map((row) => [
              row.dealer_name,
              row.outlet_name,
              row.add_on_name,
              formatNumber(row.policy_count),
              formatPercent(row.policy_attach_pct),
              row.raw_terms.join(' · '),
            ])}
          />

          <DetailTable
            title="Raw insurance source codes and route evidence by outlet"
            headers={['Dealer', 'Outlet', 'Route assessment', 'insurance_by', 'insurance_source', 'Self-insurance flag', 'MISP code', 'Agent / intermediary code', 'Agent / intermediary name', 'Insurer', 'Policy records', 'Premium captured']}
            rows={sourceByOutlet.map((row) => [
              row.dealer_name,
              row.outlet_name,
              routeLabel(row.source_assessment),
              row.insurance_by,
              row.insurance_source,
              row.self_insurance_flag,
              row.misp_code,
              row.intermediary_code,
              row.intermediary_name,
              row.insurer_name,
              formatNumber(row.policy_count),
              formatMoney(row.premium_amount),
            ])}
          />
          <p className="analytics-footnote">The raw table retains the captured Audit Core source values outlet by outlet. A MISP code, intermediary, or insurer name alone does not establish that the policy was dealer-arranged or customer-arranged; only explicit route evidence contributes to those classifications.</p>

          <DetailTable
            title="Insurer and captured premium by dealership / outlet"
            headers={['Dealer', 'Outlet', 'Insurer', 'Policies', 'Premium Values', 'Average Premium', 'Captured Premium']}
            rows={insurersByOutlet.map((row) => [
              row.dealer_name,
              row.outlet_name,
              humanize(row.insurer_name),
              formatNumber(row.policy_count),
              formatNumber(row.premium_populated),
              formatOptionalMoney(row.avg_premium),
              formatMoney(row.premium_amount),
            ])}
          />
          <p className="analytics-footnote">{definition}</p>
        </>
      );
    }

    case 'addons':
      return <AnalyticsAddonsReport data={payload.data} />;

    case 'payments': {
      const { summary, by_channel: channels, by_outlet: outletChannels, definition } = payload.data;
      const channelTotals = new Map<string, number>();
      channels.forEach((row) => channelTotals.set(row.channel, numeric(row.recorded_receipt_amount)));
      const topChannels = Array.from(channelTotals.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
      const paymentSeries = [
        ...topChannels.map(([name], index) => ({
          key: `channel_${index}`,
          name: humanize(name),
          color: ['#07366b', '#078ba0', '#d78b2b', '#6f83c7', '#b45472'][index],
        })),
        { key: 'other', name: 'Other / unmapped', color: '#9aa9b7' },
      ];
      const outletGroups = new Map<string, Record<string, string | number> & { label: string; total: number }>();
      const outletStatus = new Map<string, { label: string; entries: number; coded: number }>();
      outletChannels.forEach((row) => {
        const label = `${row.dealer_name} · ${row.outlet_name}`;
        const target: Record<string, string | number> & { label: string; total: number } = outletGroups.get(label) || { label, total: 0 };
        const amount = numeric(row.recorded_receipt_amount);
        target.total += amount;
        const index = topChannels.findIndex(([name]) => name === row.channel);
        const seriesKey = index >= 0 ? `channel_${index}` : 'other';
        target[seriesKey] = numeric(target[seriesKey]) + amount;
        outletGroups.set(label, target);
        const status = outletStatus.get(label) || { label, entries: 0, coded: 0 };
        status.entries += row.payment_entry_count;
        status.coded += row.status_coded_entries;
        outletStatus.set(label, status);
      });
      const outletRows = Array.from(outletGroups.values()).sort((a, b) => b.total - a.total).slice(0, 10);
      const statusRows = Array.from(outletStatus.values()).map((row) => ({
        label: row.label,
        value: row.entries ? (row.coded / row.entries) * 100 : 0,
      })).sort((a, b) => a.value - b.value).slice(0, 12);

      return (
        <>
          <div className="analytics-insurance-banner">
            <Metric label="Recorded receipt amount" value={formatMoney(summary.recorded_receipt_amount)} detail={`${formatNumber(summary.payment_entry_count)} payment entries`} />
            <Metric label="Journeys with receipt entries" value={formatNumber(summary.journeys_with_payment_entries)} detail="Distinct booked journeys with at least one payment record" />
            <Metric label="Status coverage" value={formatPercent(summary.status_coverage_pct)} detail={`${formatNumber(summary.status_coded_entries)} of ${formatNumber(summary.payment_entry_count)} entries have a status code`} attention={summary.status_coverage_pct === 0} />
            <Metric label="Channels captured" value={formatNumber(summary.channel_count)} detail={`${formatNumber(summary.unmapped_entries)} entries remain in Other / Unmapped`} />
          </div>
          <SectionCard title="Recorded receipt amount by outlet and channel" description="Shows the channel mix at each dealership outlet. Amounts are recorded receipts, not settled collections. The five largest channels are shown separately; the rest are grouped.">
            <AnalyticsStackedBarChart rows={outletRows} series={paymentSeries} valueLabel="Recorded receipt amount" valueKind="currency" emptyText="No outlet-level payment channel amounts are available." />
          </SectionCard>
          <SectionCard title="Payment status coverage by outlet" description="Share of payment entries with a captured status. Lower coverage limits confidence in any collection interpretation.">
            <AnalyticsBarChart rows={statusRows} valueLabel="Entries with status" valueKind="percent" emptyText="No outlet-level payment status data is available." />
          </SectionCard>
          <p className="analytics-footnote">{definition}</p>
        </>
      );
    }

    case 'geography': {
      const { coverage, quality, rows, privacy } = payload.data;
      const dealerCount = new Set(rows.map((row) => row.dealer_name)).size;
      return (
        <>
          <div className="analytics-insurance-banner">
            <Metric label="Pincode coverage" value={formatPercent(coverage.coverage_pct)} detail={`${formatNumber(coverage.available)} of ${formatNumber(coverage.total)} booked journeys have an explicit PIN field`} />
            <Metric label="Reviewed PIN records" value={formatNumber(quality.reviewed_journeys)} detail={`${formatPercent(quality.reviewed_pct_of_pincode_records)} of PIN-bearing journeys have a review timestamp`} />
            <Metric label="Provisional PIN records" value={formatNumber(quality.provisional_journeys)} detail="Document-extracted values not yet reviewed in Audit Core" attention={quality.provisional_journeys > 0} />
            <Metric label="Dealerships represented" value={formatNumber(dealerCount)} detail="Dealerships with at least one booking attached to a captured customer PIN" />
          </div>

          <SectionCard title="Customer Spread by PIN Code" description="Compare bookings and retail deliveries across dealerships, switch between PIN and district views, and identify shared customer areas.">
            <AnalyticsOdishaPinMap data={payload.data} />
          </SectionCard>

          <p className="analytics-footnote">{quality.source_note} {privacy}</p>
        </>
      );
    }

    case 'discounts': {
      const { summary: discountSummary, by_dealer_model_variant: discountsByProduct } = payload.data;
      const pricing: PricingIntegrityReport = payload.data.pricing_integrity;
      const summary = pricing.summary;
      const keyRows = pricing.by_discount_key
        .filter((row) => numeric(row.known_excess_discount_amount) > 0)
        .map((row) => ({ label: humanize(row.discount_key), value: numeric(row.known_excess_discount_amount) }));
      const outletOverage = pricing.by_outlet
        .filter((row) => numeric(row.known_excess_discount_amount) > 0)
        .map((row) => ({ label: `${row.dealer_name} · ${row.outlet_name}`, value: numeric(row.known_excess_discount_amount) }));
      const productOverage = discountsByProduct
        .filter((row) => numeric(row.known_excess_discount_amount) > 0)
        .map((row) => ({
          label: `${row.dealer_name} · ${row.outlet_name} · ${row.model_name} / ${row.variant_name}`,
          value: numeric(row.known_excess_discount_amount),
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 12);
      return (
        <>
          <div className="analytics-insurance-banner">
            <Metric label="Recorded discounts" value={formatMoney(discountSummary.total_actual_discount)} detail={`${formatNumber(discountSummary.journeys_with_actual_discount)} booked journeys with a captured actual discount`} />
            <Metric label="Any positive over-offer" value={formatMoney(discountSummary.strict_excess_discount_amount)} detail={`${formatNumber(discountSummary.strict_excess_discount_journeys)} journeys · ${formatNumber(discountSummary.strict_excess_application_count)} applications above offer before tolerance`} attention={numeric(discountSummary.strict_excess_discount_amount) > 0} />
            <Metric label="Active pricing cases" value={formatNumber(summary.journeys_with_pricing_exceptions)} detail="Distinct journeys with an open or acknowledged pricing finding" attention={summary.journeys_with_pricing_exceptions > 0} />
            <Metric label="Known overage after tolerance" value={formatMoney(summary.known_excess_discount_amount)} detail={`${formatNumber(summary.known_excess_discount_journeys)} journeys · ${formatNumber(summary.known_excess_application_count)} applications`} attention={numeric(summary.known_excess_discount_amount) > 0} />
            <Metric label="Unknown entitlements" value={formatNumber(summary.unknown_entitlement_application_count)} detail="Excluded from known overage because entitlement could not be attributed" attention={summary.unknown_entitlement_application_count > 0} />
            <Metric label="Comparable price line coverage" value={formatPercent(summary.comparable_price_line_coverage_pct)} detail={`${formatNumber(summary.comparable_price_line_count)} of ${formatNumber(summary.standard_price_line_count)} standard-price lines have an actual amount`} />
          </div>
          <div className="analytics-split analytics-split--wide-left">
            <SectionCard title="Known overage concentration by outlet" description="Ranks outlets by known excess discount after Audit Core line tolerance. This is an actionable concentration view, not a claim that every price difference is loss.">
              <AnalyticsParetoChart rows={outletOverage} valueLabel="Known excess after tolerance" emptyText="No known overage is recorded for an outlet in this snapshot." />
            </SectionCard>
            <SectionCard title="Known overage by model and variant" description="Highest dealer/outlet and vehicle combinations with known excess after tolerance.">
              <AnalyticsBarChart rows={productOverage} valueLabel="Known excess after tolerance" valueKind="currency" emptyText="No model or variant has known overage in this snapshot." />
            </SectionCard>
          </div>
          <SectionCard title="Known excess by discount category" description="Per-application overage above captured entitlement. Unknown entitlements are excluded, and unused entitlement in another category does not offset an exception.">
            <AnalyticsBarChart rows={keyRows} valueLabel="Known excess discount" valueKind="currency" emptyText="No known excess by discount category is recorded." />
          </SectionCard>
          <DetailTable
            title="Review active Audit Core pricing findings"
            headers={['Journey Reference', 'Dealer', 'Outlet', 'Model / Variant', 'Finding', 'Audit Core detail', 'Severity', 'Status']}
            rows={pricing.exceptions.map((row) => [row.journey_reference || row.journey_id, row.dealer_name, row.outlet_name, `${humanize(row.model_name)} / ${humanize(row.variant_name)}`, row.title || humanize(row.rule_key), row.description, humanize(row.severity), humanize(row.finding_status)])}
          />
          <p className="analytics-footnote">
            {pricing.definitions.exception_status} Strict positive over-offer is shown before tolerance; known overage reflects Audit Core's configured line tolerance. Unknown entitlements stay separate. Invoice and booking line counts describe evidence coverage, not complete-deal invoice coverage.
          </p>
        </>
      );
    }

    case 'turnaround': {
      const { summary, by_outlet: byOutlet, by_model: byModel, definition } = payload.data;
      const outletRows = byOutlet.map((row) => ({
        label: `${row.dealer_name} · ${row.outlet_name}`,
        average: numeric(row.avg_days),
        median: numeric(row.median_days),
      })).sort((a, b) => b.median - a.median);
      const modelRows = byModel.map((row) => ({
        label: humanize(row.model_name),
        average: numeric(row.avg_days),
        median: numeric(row.median_days),
      })).sort((a, b) => b.median - a.median);
      const tatSeries = [
        { key: 'average', name: 'Mean days', color: '#078ba0' },
        { key: 'median', name: 'Median days', color: '#07366b' },
      ];
      const available = summary.booking_delivery_pairs > 0;
      return (
        <>
          {!available ? (
            <SectionCard title="Booking-to-delivery TAT is not yet available" description={definition}>
              <div className="analytics-empty-copy">
                There are currently {formatNumber(summary.booking_delivery_pairs)} journeys with both a booking date and populated actual delivery timestamp. Analytics does not display a zero-day TAT or fabricate a delivery trend. As actual delivery dates populate, the TAT measures will appear automatically.
              </div>
            </SectionCard>
          ) : (
            <div className="analytics-insurance-banner">
              <Metric label="Average booking → delivery" value={formatDays(summary.avg_booking_to_delivery_days)} detail={`${formatNumber(summary.booking_delivery_pairs)} completed booking-delivery pairs`} />
              <Metric label="Median" value={formatDays(summary.median_booking_to_delivery_days)} detail="Half of completed journeys are at or below this time" />
              <Metric label="P75" value={formatDays(summary.p75_booking_to_delivery_days)} detail="75% of completed journeys are at or below this time" />
              <Metric label="P90" value={formatDays(summary.p90_booking_to_delivery_days)} detail="Tail delivery performance" />
            </div>
          )}

          <div className="analytics-insurance-banner">
            <Metric label="Booking → allocation" value={summary.booking_allocation_pairs ? formatDays(summary.avg_booking_to_allocation_days) : 'Unavailable'} detail={`${formatNumber(summary.booking_allocation_pairs)} journeys have both dates`} />
            <Metric label="On-time delivery" value={formatPercent(summary.on_time_delivery_pct)} detail={`${formatNumber(summary.on_time_deliveries)} of ${formatNumber(summary.planned_actual_pairs)} planned-vs-actual pairs`} />
          </div>

          {available ? (
            <div className="analytics-split analytics-split--wide-left">
              <SectionCard title="Delivery time by outlet" description="Mean and median days from booking to actual delivery. A large gap between them can signal a small number of long-running deliveries.">
                <AnalyticsGroupedBarChart rows={outletRows} series={tatSeries} valueLabel="Booking-to-delivery time" valueKind="days" />
              </SectionCard>
              <SectionCard title="Delivery time by model" description="Compare typical delivery time and the mean for each model.">
                <AnalyticsGroupedBarChart rows={modelRows} series={tatSeries} valueLabel="Booking-to-delivery time" valueKind="days" />
              </SectionCard>
            </div>
          ) : null}
        </>
      );
    }

    case 'findings': {
      const { by_outlet: byOutlet, by_model: byModel, top_rules: topRules, commercial_value_note: commercialNote } = payload.data;
      const journeys = byOutlet.reduce((sum, row) => sum + row.journeys, 0);
      const affected = byOutlet.reduce((sum, row) => sum + row.journeys_with_findings, 0);
      const findings = byOutlet.reduce((sum, row) => sum + row.finding_count, 0);
      const high = byOutlet.reduce((sum, row) => sum + row.high_finding_count, 0);
      const open = byOutlet.reduce((sum, row) => sum + row.open_finding_count, 0);
      const discountValue = byOutlet.reduce((sum, row) => sum + numeric(row.discount_value_on_affected_journeys), 0);
      const paymentValue = byOutlet.reduce((sum, row) => sum + numeric(row.payment_value_on_affected_journeys), 0);
      const outletRows = byOutlet.map((row) => ({
        label: `${row.dealer_name} · ${row.outlet_name}`,
        x: row.journeys,
        y: Number(row.journeys_with_findings_pct || 0),
        size: Math.max(row.finding_count, 1),
      }));
      const modelRows = byModel.map((row) => ({ label: humanize(row.model_name), value: Number(row.journeys_with_findings_pct || 0) }));
      const ruleRows = topRules.map((row) => ({ label: humanizeRule(row.rule_key), value: row.finding_count }));
      return (
        <>
          <div className="analytics-insurance-banner">
            <Metric label="Journeys with compliance findings" value={journeys ? `${((affected / journeys) * 100).toFixed(1)}%` : 'Unavailable'} detail={`${formatNumber(affected)} of ${formatNumber(journeys)} journeys · ${formatNumber(findings)} findings`} attention={affected > 0} />
            <Metric label="High severity" value={formatNumber(high)} detail={`${formatNumber(open)} open findings across outlets`} attention={high > 0} />
            <Metric label="Discount value on affected journeys" value={formatMoney(discountValue)} detail="Associated commercial value, not automatically proven leakage" />
            <Metric label="Payment value on affected journeys" value={formatMoney(paymentValue)} detail="Associated commercial value, not automatically proven loss" />
          </div>

          <SectionCard title="Outlet Compliance Pressure" description="Outlet journey volume versus share of journeys carrying findings. Bubble size reflects total finding count.">
            <AnalyticsBubbleChart rows={outletRows} xLabel="Journeys" yLabel="Journeys with findings" yKind="percent" />
          </SectionCard>

          <div className="analytics-split analytics-split--wide-left">
            <SectionCard title="Finding Concentration by Rule" description="Rules driving the largest volume of compliance findings.">
              <AnalyticsParetoChart rows={ruleRows} valueLabel="Findings" />
            </SectionCard>
            <SectionCard title="Compliance Rate by Model" description="Share of journeys with findings for each captured vehicle model.">
              <AnalyticsBarChart rows={modelRows} valueLabel="Journeys with findings" valueKind="percent" />
            </SectionCard>
          </div>

          <SectionCard title="Commercial Exposure Context" description={commercialNote}>
            <p className="analytics-empty-copy">The values above identify where commercial amounts and compliance failures coexist. A value is only labelled leakage/loss when a rule-specific calculation establishes that causal amount.</p>
          </SectionCard>

          <DetailTable
            headers={['Rule', 'Severity', 'Status', 'Findings', 'Journeys']}
            rows={topRules.map((row) => [humanizeRule(row.rule_key), humanize(row.severity), humanize(row.finding_status), formatNumber(row.finding_count), formatNumber(row.journey_count)])}
          />
        </>
      );
    }
  }
}
