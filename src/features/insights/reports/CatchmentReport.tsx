import { lazy, Suspense, useState } from 'react';

import type { CatchmentInsight, PlaceRow } from '../../../services/audit-core/uc03Insights';
import { count, percent, shortOutlet } from '../insightFormat';
import { DataTable, GroupName, MeterList, Section, Switcher, Tiles, type Column } from '../InsightParts';
import { barOption, SERIES, topBy } from '../charts/chartOptions';
import { barsHeight, Chart } from '../charts/Chart';
import { HeatKey, HeatMatrix } from './PenetrationReport';

// The map brings the chart library with it: loaded only when this report is opened.
const CustomerMap = lazy(() => import('./CustomerMap'));

type OutletRow = CatchmentInsight['outlets'][number];
const VIEWS = [
  { value: 'customers', label: 'Customers' },
  { value: 'products', label: 'Products sold' },
] as const;
type View = (typeof VIEWS)[number]['value'];

/** Customer catchment: where the customers live, and what each place buys. */
export default function CatchmentReport({ data }: { data: CatchmentInsight }) {
  const [view, setView] = useState<View>('customers');
  const basis = data.basis;
  const placed = basis.liveJourneys - basis.withoutPlace;

  const outletColumns: Column<OutletRow>[] = [
    { key: 'label', label: 'Outlet', value: (row) => row.label, render: (row) => <GroupName row={row} /> },
    { key: 'journeys', label: 'Bookings', numeric: true, value: (row) => row.journeys, render: (row) => count(row.journeys) },
    { key: 'located', label: 'With a district', numeric: true, value: (row) => row.located, render: (row) => count(row.located) },
    { key: 'homeDistrict', label: 'Home district', value: (row) => row.homeDistrict,
      render: (row) => (row.homeDistrict ? `${row.homeDistrict} · ${percent(row.homeSharePercent)}` : '—') },
    { key: 'districts', label: 'Districts reached', numeric: true, value: (row) => row.districts, render: (row) => count(row.districts) },
    { key: 'topDistricts', label: 'Where else', value: (row) => row.topDistricts.map((d) => d.district).join(', '),
      render: (row) => (
        <span className="ins-secondary ins-wrap">
          {row.topDistricts.slice(1).map((d) => `${d.district} ${percent(d.percent)}`).join(' · ') || '—'}
        </span>
      ) },
  ];

  const pinColumns: Column<PlaceRow>[] = [
    { key: 'label', label: 'PIN code', value: (row) => row.label },
    { key: 'parent', label: 'District', value: (row) => row.parent },
    { key: 'journeys', label: 'Bookings', numeric: true, value: (row) => row.journeys, render: (row) => count(row.journeys) },
    { key: 'statementDeals', label: 'Deals with a statement', numeric: true, value: (row) => row.statementDeals, render: (row) => count(row.statementDeals) },
    { key: 'outlets', label: 'Bought at', value: (row) => row.outlets.map((o) => o.outlet).join(', '),
      render: (row) => <span className="ins-secondary ins-wrap">{row.outlets.map((o) => `${shortOutlet(o.outlet)} (${o.journeys})`).join(' · ')}</span> },
  ];

  // Customers by district, split by dealership, from the map's rows.
  const byDistrict = new Map<string, { name: string; total: number; by: Map<string, number> }>();
  const dealerTotals = new Map<string, number>();
  for (const cell of data.map.cells) {
    if (!cell.district) continue;
    const dealer = cell.dealer ?? 'Not named';
    const entry = byDistrict.get(cell.district) ?? { name: cell.district, total: 0, by: new Map<string, number>() };
    entry.total += cell.journeys;
    entry.by.set(dealer, (entry.by.get(dealer) ?? 0) + cell.journeys);
    byDistrict.set(cell.district, entry);
    dealerTotals.set(dealer, (dealerTotals.get(dealer) ?? 0) + cell.journeys);
  }
  const topDistricts = topBy([...byDistrict.values()], (row) => row.total, 15);
  const dealerNames = [...dealerTotals.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);

  return (
    <>
      <Tiles label="Totals" items={[
        { label: 'Customers placed', value: count(placed), meter: basis.liveJourneys ? (placed / basis.liveJourneys) * 100 : 0,
          detail: `Of ${count(basis.liveJourneys)} live bookings` },
        { label: 'Districts', value: count(basis.districts), detail: `${count(basis.withDistrict)} bookings with a district` },
        { label: 'PIN codes', value: count(basis.pins), detail: `${count(basis.withPin)} bookings with a PIN code` },
        { label: 'Address not read', value: count(basis.withoutPlace), tone: basis.withoutPlace ? 'warning' : 'default',
          detail: 'No PIN code and no district on file' },
      ]} />

      <Suspense fallback={<section className="ins-card"><p className="ins-empty" aria-busy="true">Loading the map…</p></section>}>
        <CustomerMap data={data.map} products={data.products} thinBelow={basis.thinBelow} />
      </Suspense>

      <Section title="By district"
               description={view === 'customers'
                 ? 'Customers by district, split by dealership.'
                 : 'Share of each district\'s deals that took each product; the count is under it.'}
               actions={<Switcher label="Show" options={VIEWS} value={view} onChange={setView} />}>
        {view === 'customers' ? (
          <Chart label="Customers by district and dealership" height={barsHeight(topDistricts.length, true)} empty="No customer address has been read yet."
                 option={topDistricts.length ? barOption({
                   horizontal: true, stacked: true, categories: topDistricts.map((row) => row.name),
                   series: dealerNames.map((dealer, index) => ({ name: dealer, color: SERIES[index], data: topDistricts.map((row) => row.by.get(dealer) ?? 0) })),
                 }) : null} />
        ) : (
          <>
            <HeatMatrix rows={data.districts.map((district) => ({ ...district, deals: district.statementDeals }))}
                        products={data.products} measure="rate" nameLabel="District" thinBelow={basis.thinBelow}
                        dealsLabel="Deals with a statement" />
            <HeatKey measure="rate" />
          </>
        )}
      </Section>

      <Section title="Each outlet's catchment" description="Home district is where most of an outlet's customers with a district live.">
        <DataTable columns={outletColumns} rows={data.outlets} rowKey={(row) => row.key} sort={{ key: 'journeys', direction: 'desc' }}
                   csvName="outlet-catchment" caption="Outlet catchment" empty="No booking matches these filters." />
      </Section>

      <Section title="By PIN code"
               description={`Most single PIN codes have fewer than ${basis.thinBelow} deals today, so they are listed by bookings; rates are shown by district.`}>
        <DataTable columns={pinColumns} rows={data.pins} rowKey={(row) => row.key} pageSize={25}
                   sort={{ key: 'journeys', direction: 'desc' }} csvName="customers-by-pin" caption="Customers by PIN code"
                   empty="No PIN code has been read yet." />
      </Section>
    </>
  );
}
