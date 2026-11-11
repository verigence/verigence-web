import { barOption, heatmapOption, scatterOption, SERIES, TONE, topBy } from '../charts/chartOptions';
import { barsHeight, Chart } from '../charts/Chart';
import { useState } from 'react';

import type { PenetrationInsight, PenetrationRow, ProductCell, ProductInfo } from '../../../services/audit-core/uc03Insights';
import { count, gapStep, heatStep, percent, rupees, rupeesShort, signed } from '../insightFormat';
import { DataTable, GROUPING_NAME, GroupName, Section, Switcher, Tiles } from '../InsightParts';

const GROUPS = [
  { value: 'outlets', label: 'Outlet' },
  { value: 'dealers', label: 'Dealership' },
  { value: 'models', label: 'Model' },
  { value: 'districts', label: 'District' },
] as const;
type Group = (typeof GROUPS)[number]['value'];
const MEASURES = [
  { value: 'rate', label: 'Penetration' },
  { value: 'gap', label: 'Against network' },
] as const;
type Measure = (typeof MEASURES)[number]['value'];

function cellTitle(product: ProductInfo, cell: ProductCell, deals: number): string {
  const base = `${product.label}: ${cell.count} of ${deals} deals`;
  return cell.expected === undefined ? base : `${base}; the network's rate for the same models would give ${cell.expected}`;
}

/** A grid of rates: one hue, deeper where more deals took the product. Against the
 *  network it is two hues around a neutral middle: above, below, within a deal. */
export function HeatMatrix({ rows, products, measure, nameLabel, thinBelow, dealsLabel = 'Deals' }: {
  rows: (PenetrationRow | { key: string; label: string; parent: string | null; thin?: boolean; deals: number; products: Record<string, ProductCell> | null })[];
  products: ProductInfo[]; measure: Measure; nameLabel: string; thinBelow: number; dealsLabel?: string;
}) {
  if (!rows.length) return <p className="ins-empty">No deal with an account statement matches these filters.</p>;
  return (
    <div className="ins-table-wrap">
      <table className="ins-table ins-heat">
        <caption className="ins-visually-hidden">{measure === 'rate' ? 'Share of deals that took each product' : 'Deals above or below the network rate'}</caption>
        <thead>
          <tr>
            <th scope="col" className="ins-heat__name">{nameLabel}</th>
            <th scope="col" className="is-num ins-heat__deals">{dealsLabel}</th>
            {products.map((product) => <th key={product.key} scope="col" className="is-num" title={product.how}>{product.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className={row.thin ? 'is-thin' : undefined}>
              <th scope="row" className="ins-heat__name"><GroupName row={row} thinBelow={thinBelow} /></th>
              <td className="is-num ins-heat__deals">{count(row.deals)}</td>
              {products.map((product) => {
                const cell = row.products?.[product.key];
                if (!cell || !row.deals) return <td key={product.key} className="is-num ins-heat__cell">—</td>;
                if (measure === 'gap') {
                  if (cell.gap === undefined) return <td key={product.key} className="is-num ins-heat__cell">—</td>;
                  const step = gapStep(cell.gap, cell.expected);
                  return (
                    <td key={product.key} className={`is-num ins-heat__cell ins-gap--${step < 0 ? `n${-step}` : `p${step}`}`}
                        title={cellTitle(product, cell, row.deals)}>
                      <span className="ins-heat__value">{signed(cell.gap, 0)}</span>
                      <span className="ins-heat__sub">{count(cell.count)} of {signed(cell.expected ?? 0, 0).replace('+', '')}</span>
                    </td>
                  );
                }
                return (
                  <td key={product.key} className={`is-num ins-heat__cell ins-heat--${heatStep(cell.percent)}`}
                      title={cellTitle(product, cell, row.deals)}>
                    <span className="ins-heat__value">{percent(cell.percent)}</span>
                    <span className="ins-heat__sub">{count(cell.count)}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function HeatKey({ measure }: { measure: Measure }) {
  return measure === 'rate' ? (
    <p className="ins-heatkey" aria-hidden="true">
      <span>Lower share</span>
      {[1, 2, 3, 4, 5, 6].map((step) => <span key={step} className={`ins-heatkey__box ins-heat--${step}`} />)}
      <span>Higher share</span>
    </p>
  ) : (
    <p className="ins-heatkey" aria-hidden="true">
      <span>Below the network</span>
      {['n3', 'n2', 'n1', 'p0', 'p1', 'p2', 'p3'].map((step) => <span key={step} className={`ins-heatkey__box ins-gap--${step}`} />)}
      <span>Above the network</span>
    </p>
  );
}

/** Product penetration: what is sold with the vehicle, and where. */
export default function PenetrationReport({ data }: { data: PenetrationInsight }) {
  const [group, setGroup] = useState<Group>('outlets');
  const [measure, setMeasure] = useState<Measure>('rate');
  const shownMeasure: Measure = group === 'models' ? 'rate' : measure;
  const rows = data[group];
  const ACCESSORY_MEASURES = [{ value: 'units', label: 'Units' }, { value: 'value', label: 'Net value' }] as const;
  const [accessoryMeasure, setAccessoryMeasure] = useState<(typeof ACCESSORY_MEASURES)[number]['value']>('units');
  // An older server that predates the field answers without it; the section then shows empty.
  const accessories = data.accessoryItems ?? { journeysWithInvoice: 0, lines: 0, units: 0, value: 0, itemsSeen: 0, topModels: [], items: [] };
  const topItems = topBy(accessories.items, (item) => (accessoryMeasure === 'units' ? item.units : item.value), 15);
  // Every dealership that sold one of the items shown, largest first, so colours hold steady.
  const accessoryDealers = (() => {
    const totals = new Map<string, number>();
    topItems.forEach((item) => Object.entries(item.dealers).forEach(([dealer, units]) => totals.set(dealer, (totals.get(dealer) ?? 0) + units)));
    return [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([dealer]) => dealer);
  })();
  const accessoryCells = topItems.flatMap((item, rowIndex) =>
    accessories.topModels.flatMap((model, columnIndex) =>
      (item.models[model] ?? 0) > 0 ? [[columnIndex, rowIndex, item.models[model]] as [number, number, number]] : []));
  const valuePoints = data.products.filter((product) => product.key !== 'scrappage').flatMap((product) => {
    const cell = data.network.products[product.key];
    return cell && cell.percent != null && (cell.typical ?? 0) > 0
      ? [{ name: product.label, group: 'Products', x: cell.percent, y: cell.typical ?? 0, size: cell.amount ?? 0,
          detail: `${count(cell.count)} of ${count(data.network.deals)} deals` }]
      : [];
  });

  return (
    <>
      <Tiles label="Network penetration" items={data.products.map((product) => {
        const cell = data.network.products[product.key];
        return {
          label: product.label, value: percent(cell?.percent), meter: cell?.percent ?? 0,
          detail: `${count(cell?.count)} of ${count(data.network.deals)} deals`,
        };
      })} />
      <p className="ins-footnote">
        Of {count(data.basis.statementDeals)} deals with the account statement on file.
        {data.basis.withoutStatement > 0 ? ` ${count(data.basis.withoutStatement)} live bookings have no statement yet and are not counted.` : ''}
      </p>

      <div className="ins-grid">
        <Section title="Penetration across the network" description="Share of deals with a statement that took each product.">
          <Chart label="Network penetration by product" height={300}
                 option={data.network.deals ? barOption({
                   labels: true, max: 100, format: (value) => `${Math.round(value)}%`, categories: data.products.map((product) => product.label),
                   series: [{ name: 'Penetration', data: data.products.map((product) => data.network.products[product.key]?.percent ?? 0), color: TONE.primary }],
                 }) : null} />
        </Section>
        <Section title="By dealership" description="The same share, dealership against dealership.">
          <Chart label="Penetration by product and dealership" height={300}
                 option={data.dealers.length ? barOption({
                   max: 100, format: (value) => `${Math.round(value)}%`, categories: data.products.map((product) => product.label),
                   series: data.dealers.slice(0, 6).map((dealer, index) => ({
                     name: dealer.label, color: SERIES[index], data: data.products.map((product) => dealer.products[product.key]?.percent ?? 0) })),
                 }) : null} />
        </Section>
      </div>

      <Section title={`By ${GROUPING_NAME[group].toLowerCase()}`}
               description={shownMeasure === 'rate'
                 ? 'Share of deals that took each product; the count is under it.'
                 : 'Deals above or below what the network sells on the same models. Under it: sold, of expected.'}
               actions={(
                 <>
                   {group !== 'models' ? <Switcher label="Measure" options={MEASURES} value={measure} onChange={setMeasure} /> : null}
                   <Switcher label="Group by" options={GROUPS} value={group} onChange={setGroup} />
                 </>
               )}>
        <HeatMatrix rows={group === 'models' ? rows.map((row) => ({ ...row, parent: null })) : rows} products={data.products}
                    measure={shownMeasure} nameLabel={GROUPING_NAME[group]} thinBelow={data.basis.thinBelow} />
        <HeatKey measure={shownMeasure} />
      </Section>

      <Section title="Volume against value"
               description="Right is sold on more deals; high is more rupees on the deal that takes it; the bubble is the rupees in all. High and to the left is worth pushing on more deals.">
        <Chart label="Products by penetration and typical amount" height={360} empty="No product has been charged on a statement yet."
               option={valuePoints.length ? scatterOption({
                 points: valuePoints,
                 xLabel: 'Share of deals', yLabel: 'Typical amount on a deal', sizeLabel: 'Charged in all',
                 formatX: (value) => `${Math.round(value)}%`, formatY: rupeesShort, formatSize: rupeesShort,
               }) : null} />
      </Section>

      <Section title="Accessories sold, item by item"
               description={accessories.lines
                 ? `From the ${count(accessories.journeysWithInvoice)} bookings with an accessory tax invoice on file: ${count(accessories.units)} units, ${rupeesShort(accessories.value)} net, ${count(accessories.itemsSeen)} distinct items.`
                 : 'From the accessory tax invoices on file.'}
               actions={<Switcher label="Measure" options={ACCESSORY_MEASURES} value={accessoryMeasure} onChange={setAccessoryMeasure} />}>
        <div className="ins-grid ins-grid--flush">
          <Chart label="Top accessory items by dealership" height={barsHeight(topItems.length, true)} empty="No accessory tax invoice has been read yet."
                 option={topItems.length ? barOption({
                   horizontal: true, stacked: true, labelWidth: 240,
                   format: accessoryMeasure === 'units' ? undefined : rupeesShort,
                   categories: topItems.map((item) => item.label),
                   series: accessoryDealers.map((dealer, index) => ({
                     name: dealer, color: SERIES[index % SERIES.length],
                     data: topItems.map((item) => (accessoryMeasure === 'units'
                       ? item.dealers[dealer] ?? 0
                       : item.units ? Math.round(((item.dealers[dealer] ?? 0) / item.units) * item.value) : 0)),
                   })),
                 }) : null} />
          <Chart label="Accessory items by model" height={barsHeight(topItems.length, true)} empty="No accessory tax invoice has been read yet."
                 option={accessoryCells.length ? heatmapOption({
                   columns: accessories.topModels, rows: topItems.map((item) => item.label), cells: accessoryCells,
                   valueLabel: 'Units',
                 }) : null} />
        </div>
      </Section>

      <Section title="What each product brings" description="The rupees behind each product on the deals that took it.">
        <DataTable caption="Value by product" empty="No product has been charged on a statement yet." rowKey={(row) => row.key}
                   rows={data.products.filter((product) => product.key !== 'scrappage')}
                   columns={[
                     { key: 'label', label: 'Product', value: (row) => row.label,
                       render: (row) => (<><span className="ins-primary">{row.label}</span><span className="ins-secondary">{row.how}</span></>) },
                     { key: 'count', label: 'Deals', numeric: true, value: (row) => data.network.products[row.key]?.count ?? 0,
                       render: (row) => count(data.network.products[row.key]?.count) },
                     { key: 'percent', label: 'Penetration', numeric: true, value: (row) => data.network.products[row.key]?.percent,
                       render: (row) => percent(data.network.products[row.key]?.percent) },
                     { key: 'typical', label: 'Typical amount', numeric: true, value: (row) => data.network.products[row.key]?.typical,
                       render: (row) => rupees(data.network.products[row.key]?.typical) },
                     { key: 'amount', label: 'Total', numeric: true, value: (row) => data.network.products[row.key]?.amount,
                       render: (row) => rupeesShort(data.network.products[row.key]?.amount) },
                   ]} />
      </Section>
    </>
  );
}
