import { useState } from 'react';

import type { SalesInsight, SalesRow } from '../../../services/audit-core/uc03Insights';
import { count, days, monthLabel, percent, rupees, rupeesShort } from '../insightFormat';
import {
  CellBar, DataTable, GROUPING_NAME, GroupName, Legend, MeterList, Section, Switcher, Tiles, type Column,
} from '../InsightParts';

const GROUPS = [
  { value: 'outlets', label: 'Outlet' },
  { value: 'dealers', label: 'Dealership' },
  { value: 'models', label: 'Model' },
  { value: 'categories', label: 'Category' },
] as const;
type Group = (typeof GROUPS)[number]['value'];

/** Business overview: what was booked, billed and delivered. */
export default function SalesReport({ data }: { data: SalesInsight }) {
  const [group, setGroup] = useState<Group>('outlets');
  const network = data.network;
  const rows = data[group];
  const mostBookings = Math.max(...rows.map((row) => row.journeys), 1);
  const mostInMonth = Math.max(...data.months.flatMap((month) => [month.booked, month.delivered]), 1);

  const columns: Column<SalesRow>[] = [
    { key: 'label', label: GROUPING_NAME[group], value: (row) => row.label,
      render: (row) => <GroupName row={group === 'models' ? { ...row, parent: null } : row} thinBelow={data.basis.thinBelow} /> },
    { key: 'journeys', label: 'Bookings', numeric: true, value: (row) => row.journeys,
      render: (row) => <CellBar value={row.journeys} max={mostBookings} display={`${count(row.journeys)} · ${percent(row.sharePercent)}`} /> },
    { key: 'deliveryStarted', label: 'Delivery started', numeric: true, value: (row) => row.deliveryStarted, render: (row) => count(row.deliveryStarted) },
    { key: 'delivered', label: 'Delivered', numeric: true, value: (row) => row.delivered, render: (row) => count(row.delivered) },
    { key: 'billedDeals', label: 'Deals billed', numeric: true, value: (row) => row.billedDeals, render: (row) => count(row.billedDeals) },
    { key: 'billedValue', label: 'Billed value', numeric: true, value: (row) => row.billedValue, render: (row) => rupeesShort(row.billedValue) },
    { key: 'typicalExShowroom', label: 'Typical ex-showroom', numeric: true, value: (row) => row.typicalExShowroom, render: (row) => rupees(row.typicalExShowroom) },
    { key: 'typicalDaysToDeliver', label: 'Booking to delivery', numeric: true, value: (row) => row.typicalDaysToDeliver,
      render: (row) => (row.daysMeasuredOn ? days(row.typicalDaysToDeliver) : '—') },
  ];

  return (
    <>
      <Tiles label="Totals" items={[
        { label: 'Live bookings', value: count(network.journeys), detail: 'Not cancelled, not a duplicate' },
        { label: 'Delivery started', value: count(network.deliveryStarted),
          detail: `${percent(network.journeys ? (network.deliveryStarted / network.journeys) * 100 : null)} of bookings`,
          meter: network.journeys ? (network.deliveryStarted / network.journeys) * 100 : null },
        { label: 'Delivered', value: count(network.delivered), detail: 'Delivery date on record' },
        { label: 'Billed value', value: rupeesShort(network.billedValue), detail: `Ex-showroom on ${count(network.billedDeals)} deals billed` },
        { label: 'Typical ex-showroom', value: rupeesShort(network.typicalExShowroom), detail: 'Middle deal billed' },
        { label: 'Booking to delivery', value: network.daysMeasuredOn ? days(network.typicalDaysToDeliver) : '—',
          detail: `Middle of ${count(network.daysMeasuredOn)} delivered` },
      ]} />

      <div className="ins-grid">
        <Section title="Booked and delivered by month"
                 description="Bookings by booking date, deliveries by delivery date.">
          {data.months.length ? (
            <>
              <Legend items={[{ label: 'Booked', tone: 'a' }, { label: 'Delivered', tone: 'd' }]} />
              <ul className="ins-pairs">
                {data.months.map((month) => (
                  <li key={month.month}>
                    <span className="ins-pairs__name">{monthLabel(month.month)}</span>
                    <span className="ins-pairs__bars">
                      <span className="ins-pairs__row">
                        <span className="ins-pairs__bar ins-seg--a" style={{ width: `${(month.booked / mostInMonth) * 100}%` }} aria-hidden="true" />
                        <span className="ins-pairs__figure">{count(month.booked)}<span className="ins-visually-hidden"> booked</span></span>
                      </span>
                      <span className="ins-pairs__row">
                        <span className="ins-pairs__bar ins-seg--d" style={{ width: `${(month.delivered / mostInMonth) * 100}%` }} aria-hidden="true" />
                        <span className="ins-pairs__figure">{count(month.delivered)}<span className="ins-visually-hidden"> delivered</span></span>
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : <p className="ins-empty">No bookings in this period.</p>}
        </Section>

        <Section title="Days from booking to delivery"
                 description={`Delivered bookings with a booking date read: ${count(network.daysMeasuredOn)}.`}>
          <MeterList empty="No delivered booking has both dates yet."
                     rows={data.daysToDeliverBands.map((band) => ({
                       key: band.band, label: band.band, value: band.deals, display: count(band.deals),
                       detail: network.daysMeasuredOn ? percent((band.deals / network.daysMeasuredOn) * 100) : null,
                     }))} />
        </Section>
      </div>

      <Section title={`By ${GROUPING_NAME[group].toLowerCase()}`}
               description="Billed value is the ex-showroom price on the dealer's statement or cost sheet."
               actions={<Switcher label="Group by" options={GROUPS} value={group} onChange={setGroup} />}>
        <DataTable columns={columns} rows={rows} rowKey={(row) => row.key} sort={{ key: 'journeys', direction: 'desc' }}
                   csvName={`sales-by-${group}`} caption={`Sales by ${GROUPING_NAME[group].toLowerCase()}`}
                   empty="No bookings match these filters." rowClass={(row) => (row.thin ? 'is-thin' : undefined)} />
      </Section>

      {(data.basis.modelNotResolved > 0 || data.basis.priceInDoubt > 0 || data.basis.bookingDateRead < data.basis.liveJourneys) ? (
        <p className="ins-footnote">
          {data.basis.bookingDateRead < data.basis.liveJourneys
            ? `${count(data.basis.liveJourneys - data.basis.bookingDateRead)} bookings have no booking date read and are placed by the day they were opened. ` : ''}
          {data.basis.modelNotResolved > 0 ? `${count(data.basis.modelNotResolved)} bookings have no model set yet. ` : ''}
          {data.basis.priceInDoubt > 0 ? `${count(data.basis.priceInDoubt)} deals have an ex-showroom price that looks misread and are left out of billed value.` : ''}
        </p>
      ) : null}
    </>
  );
}
