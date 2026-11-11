import { barOption, donutOption, TONE, topBy } from '../charts/chartOptions';
import { barsHeight, Chart } from '../charts/Chart';
import { useState } from 'react';

import type { PaymentsInsight, PaymentsRow } from '../../../services/audit-core/uc03Insights';
import { count, dayLabel, percent, rupees, rupeesShort, shortOutlet } from '../insightFormat';
import {
  CellBar, DataTable, GROUPING_NAME, GroupName, JourneyLink, MeterList, Section, Switcher, Tiles, type Column,
} from '../InsightParts';

const GROUPS = [
  { value: 'outlets', label: 'Outlet' },
  { value: 'dealers', label: 'Dealership' },
] as const;
type Group = (typeof GROUPS)[number]['value'];
type AroundLimit = PaymentsInsight['cashAroundLimit'][number];
const BAND: Record<AroundLimit['band'], { label: string; tone: string }> = {
  ABOVE: { label: 'Above the limit', tone: ' is-danger' },
  AT: { label: 'Exactly the limit', tone: ' is-warning' },
  NEAR: { label: 'Just under', tone: '' },
};
type CashInAll = PaymentsInsight['cashAboveLimitInAll'][number];

function who<T extends { customer?: string | null; reference: string | null; dealer?: string; outlet?: string; journeyId: string }>(): Column<T>[] {
  return [
    { key: 'customer', label: 'Customer', value: (row) => row.customer ?? row.reference,
      render: (row) => (<><span className="ins-primary">{row.customer ?? '—'}</span><span className="ins-secondary">{row.reference}</span></>) },
    { key: 'outlet', label: 'Dealership · outlet', value: (row) => `${row.dealer} ${row.outlet}`,
      render: (row) => <GroupName row={{ key: row.journeyId, label: row.outlet ?? '—', parent: row.dealer ?? null }} /> },
  ];
}

/** Payments: how the money came in, and how much of it in cash. */
export default function PaymentsReport({ data }: { data: PaymentsInsight }) {
  const [group, setGroup] = useState<Group>('outlets');
  const network = data.network;
  const limit = rupeesShort(data.basis.cashLimit);
  const nearFrom = rupeesShort(data.basis.nearLimitFrom);
  const rows = data[group];
  const highestCash = Math.max(...rows.map((row) => row.cashPercent ?? 0), 1);

  const columns: Column<PaymentsRow>[] = [
    { key: 'label', label: GROUPING_NAME[group], value: (row) => row.label, render: (row) => <GroupName row={row} /> },
    { key: 'receipts', label: 'Receipts', numeric: true, value: (row) => row.receipts, render: (row) => count(row.receipts) },
    { key: 'amount', label: 'Received', numeric: true, value: (row) => row.amount, render: (row) => rupeesShort(row.amount) },
    { key: 'cashAmount', label: 'In cash', numeric: true, value: (row) => row.cashAmount, render: (row) => rupeesShort(row.cashAmount) },
    { key: 'cashPercent', label: 'Cash share', numeric: true, value: (row) => row.cashPercent,
      render: (row) => <CellBar value={row.cashPercent} max={highestCash} display={percent(row.cashPercent, 1)} tone="b" /> },
    { key: 'cashAboveLimit', label: `Above ${limit}`, numeric: true, value: (row) => row.cashAboveLimit,
      render: (row) => <span className={row.cashAboveLimit ? 'ins-danger' : undefined}>{count(row.cashAboveLimit)}</span> },
    { key: 'cashAtLimit', label: `Exactly ${limit}`, numeric: true, value: (row) => row.cashAtLimit,
      render: (row) => <span className={row.cashAtLimit ? 'ins-warning' : undefined}>{count(row.cashAtLimit)}</span> },
    { key: 'cashNearLimit', label: 'Just under', numeric: true, value: (row) => row.cashNearLimit, render: (row) => count(row.cashNearLimit) },
    { key: 'modeNotReadPercent', label: 'Mode not read', numeric: true, value: (row) => row.modeNotReadPercent, render: (row) => percent(row.modeNotReadPercent, 1) },
  ];

  const largeColumns: Column<AroundLimit>[] = [
    { key: 'date', label: 'Receipt date', value: (row) => row.date, render: (row) => <span className="ins-nowrap">{dayLabel(row.date)}</span> },
    ...who<AroundLimit>(),
    { key: 'receiptNumber', label: 'Receipt', value: (row) => row.receiptNumber },
    { key: 'band', label: 'Against the limit', value: (row) => BAND[row.band].label,
      render: (row) => <span className={`ins-tag ins-tag--flush${BAND[row.band].tone}`}>{BAND[row.band].label}</span> },
    { key: 'amount', label: 'Cash received', numeric: true, value: (row) => row.amount, render: (row) => rupees(row.amount) },
    { key: 'open', label: 'Open', value: () => '', render: (row) => <JourneyLink journeyId={row.journeyId} /> },
  ];
  // Sits in half the width beside the payment modes: the outlet goes under the customer.
  const inAllColumns: Column<CashInAll>[] = [
    { key: 'customer', label: 'Customer', value: (row) => row.customer ?? row.reference,
      render: (row) => (<><span className="ins-primary">{row.customer ?? '—'}</span>
        <span className="ins-secondary">{[row.reference, shortOutlet(row.outlet, row.dealer)].filter(Boolean).join(' · ')}</span></>) },
    { key: 'cashReceipts', label: 'Cash receipts', numeric: true, value: (row) => row.cashReceipts, render: (row) => count(row.cashReceipts) },
    { key: 'largestReceipt', label: 'Largest receipt', numeric: true, value: (row) => row.largestReceipt, render: (row) => rupees(row.largestReceipt) },
    { key: 'cashTotal', label: 'Cash in all', numeric: true, value: (row) => row.cashTotal, render: (row) => rupees(row.cashTotal) },
    { key: 'open', label: 'Open', value: () => '', render: (row) => <JourneyLink journeyId={row.journeyId} /> },
  ];

  const cashShare = topBy(rows, (row) => row.cashPercent, 14);
  const around = topBy(rows, (row) => row.cashNearLimit + row.cashAtLimit + row.cashAboveLimit, 14);

  return (
    <>
      <Tiles label="Totals" items={[
        { label: 'Received', value: rupeesShort(network.amount),
          detail: `${count(network.receipts)} receipts on ${count(network.journeysWithReceipts)} bookings` },
        { label: 'In cash', value: rupeesShort(network.cashAmount), meter: network.cashPercent ?? 0,
          detail: `${percent(network.cashPercent, 1)} of the money · ${count(network.journeysPayingCash)} bookings` },
        { label: `Cash receipts above ${limit}`, value: count(network.cashAboveLimit), tone: network.cashAboveLimit ? 'danger' : 'default',
          detail: network.cashAboveLimit ? `${rupeesShort(network.cashAboveLimitAmount)} in single receipts` : 'No single receipt above the limit' },
        { label: `Cash receipts of exactly ${limit}`, value: count(network.cashAtLimit), tone: network.cashAtLimit ? 'warning' : 'default',
          detail: network.cashAtLimit ? `${rupeesShort(network.cashAtLimitAmount)} · at the limit, not above it` : 'None' },
        { label: `Just under ${limit}`, value: count(network.cashNearLimit),
          detail: `Cash receipts from ${nearFrom} to under ${limit}` },
        { label: `Bookings above ${limit} cash in all`, value: count(network.journeysCashAboveLimitInAll),
          tone: network.journeysCashAboveLimitInAll ? 'warning' : 'default', detail: 'Cash receipts added up' },
        { label: 'Mode not read', value: rupeesShort(network.modeNotReadAmount),
          detail: `${percent(network.modeNotReadPercent, 1)} of the money · ${count(network.modeNotRead)} receipts` },
        ...(data.basis.refunds ? [{ label: 'Refunds', value: rupeesShort(data.basis.refundAmount), detail: `${count(data.basis.refunds)} refunds` }] : []),
      ]} />

      <div className="ins-grid">
        <Section title="How the money came in" description="Share of the money received, by payment mode.">
          <Chart label="Money received by payment mode" height={280} empty="No receipt has been read yet."
                 option={data.modes.length ? donutOption(
                   data.modes.map((mode) => ({ name: mode.label, value: mode.amount, color: mode.mode === 'CASH' ? TONE.warning : mode.mode === 'OTHERS' ? TONE.quiet : undefined })),
                   { value: rupeesShort(network.amount), label: 'received' }, rupeesShort) : null} />
        </Section>
        <Section title={`Cash share, by ${GROUPING_NAME[group].toLowerCase()}`} description="Cash as a share of the money received. The dashed line is the network.">
          <Chart label="Cash share by group against the network" height={barsHeight(cashShare.length)}
                 option={cashShare.length ? barOption({
                   horizontal: true, labels: true, format: (value) => `${value.toFixed(1)}%`,
                   categories: cashShare.map((row) => (group === 'outlets' ? shortOutlet(row.label, row.parent ?? undefined) : row.label)),
                   series: [{ name: 'Cash share', data: cashShare.map((row) => row.cashPercent), color: TONE.warning }],
                   reference: network.cashPercent == null ? undefined : { value: network.cashPercent, label: `Network ${network.cashPercent.toFixed(1)}%` },
                 }) : null} />
        </Section>
      </div>

      <div className="ins-grid">
        <Section title={`Cash receipts at and near ${limit}, by ${GROUPING_NAME[group].toLowerCase()}`}
                 description={`Single cash receipts from ${nearFrom}: just under the limit, exactly at it, and above it.`}>
          <Chart label="Cash receipts around the limit by group" height={barsHeight(around.length, true)} empty={`No single cash receipt is ${nearFrom} or more.`}
                 option={around.length ? barOption({
                   horizontal: true, stacked: true, categories: around.map((row) => (group === 'outlets' ? shortOutlet(row.label, row.parent ?? undefined) : row.label)),
                   series: [{ name: 'Just under', data: around.map((row) => row.cashNearLimit), color: TONE.quiet },
                     { name: 'Exactly the limit', data: around.map((row) => row.cashAtLimit), color: TONE.warning },
                     { name: 'Above the limit', data: around.map((row) => row.cashAboveLimit), color: TONE.danger }],
                 }) : null} />
        </Section>
        <Section title={`Bookings above ${limit} cash in all`}
                 description="Cash receipts of one booking added up, whether or not any single receipt is above the limit.">
          <DataTable columns={inAllColumns} rows={data.cashAboveLimitInAll} rowKey={(row) => row.journeyId} pageSize={10}
                     sort={{ key: 'cashTotal', direction: 'desc' }} caption="Bookings with cash above the limit in all"
                     empty={`No booking has more than ${limit} in cash.`} />
        </Section>
      </div>

      <Section title={`Cash by ${GROUPING_NAME[group].toLowerCase()}`}
               actions={<Switcher label="Group by" options={GROUPS} value={group} onChange={setGroup} />}>
        <DataTable columns={columns} rows={rows} rowKey={(row) => row.key} sort={{ key: 'amount', direction: 'desc' }}
                   csvName={`payments-by-${group}`} caption={`Payments by ${GROUPING_NAME[group].toLowerCase()}`}
                   empty="No receipt matches these filters." />
      </Section>

      <Section title={`Cash receipts at or near ${limit}`}
               description={`Single cash receipts of ${nearFrom} and more. The audit raises a task above ${limit} only; receipts at the limit or just under it are listed for a look.`}>
        <DataTable columns={largeColumns} rows={data.cashAroundLimit} rowKey={(row) => `${row.journeyId}-${row.receiptNumber}-${row.amount}-${row.date}`}
                   pageSize={10} sort={{ key: 'amount', direction: 'desc' }} csvName="cash-receipts-near-limit"
                   caption="Cash receipts at or near the limit" empty={`No single cash receipt is ${nearFrom} or more.`} />
      </Section>
    </>
  );
}
