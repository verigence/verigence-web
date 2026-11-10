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
type LargeCash = PaymentsInsight['cashAboveLimit'][number];
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
  const rows = data[group];
  const highestCash = Math.max(...rows.map((row) => row.cashPercent ?? 0), 1);

  const columns: Column<PaymentsRow>[] = [
    { key: 'label', label: GROUPING_NAME[group], value: (row) => row.label, render: (row) => <GroupName row={row} /> },
    { key: 'receipts', label: 'Receipts', numeric: true, value: (row) => row.receipts, render: (row) => count(row.receipts) },
    { key: 'amount', label: 'Received', numeric: true, value: (row) => row.amount, render: (row) => rupeesShort(row.amount) },
    { key: 'cashAmount', label: 'In cash', numeric: true, value: (row) => row.cashAmount, render: (row) => rupeesShort(row.cashAmount) },
    { key: 'cashPercent', label: 'Cash share', numeric: true, value: (row) => row.cashPercent,
      render: (row) => <CellBar value={row.cashPercent} max={highestCash} display={percent(row.cashPercent, 1)} tone="b" /> },
    { key: 'journeysPayingCash', label: 'Bookings paying cash', numeric: true, value: (row) => row.journeysPayingCash, render: (row) => count(row.journeysPayingCash) },
    { key: 'cashAboveLimit', label: `Cash receipts above ${limit}`, numeric: true, value: (row) => row.cashAboveLimit,
      render: (row) => <span className={row.cashAboveLimit ? 'ins-danger' : undefined}>{count(row.cashAboveLimit)}</span> },
    { key: 'modeNotReadPercent', label: 'Mode not read', numeric: true, value: (row) => row.modeNotReadPercent, render: (row) => percent(row.modeNotReadPercent, 1) },
  ];

  const largeColumns: Column<LargeCash>[] = [
    { key: 'date', label: 'Receipt date', value: (row) => row.date, render: (row) => <span className="ins-nowrap">{dayLabel(row.date)}</span> },
    ...who<LargeCash>(),
    { key: 'receiptNumber', label: 'Receipt', value: (row) => row.receiptNumber },
    { key: 'amount', label: 'Cash received', numeric: true, value: (row) => row.amount, render: (row) => <span className="ins-danger">{rupees(row.amount)}</span> },
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

  return (
    <>
      <Tiles label="Totals" items={[
        { label: 'Received', value: rupeesShort(network.amount),
          detail: `${count(network.receipts)} receipts on ${count(network.journeysWithReceipts)} bookings` },
        { label: 'In cash', value: rupeesShort(network.cashAmount), meter: network.cashPercent ?? 0,
          detail: `${percent(network.cashPercent, 1)} of the money · ${count(network.journeysPayingCash)} bookings` },
        { label: `Cash receipts above ${limit}`, value: count(network.cashAboveLimit), tone: network.cashAboveLimit ? 'danger' : 'default',
          detail: network.cashAboveLimit ? `${rupeesShort(network.cashAboveLimitAmount)} in single receipts` : 'None' },
        { label: `Bookings above ${limit} cash in all`, value: count(network.journeysCashAboveLimitInAll),
          tone: network.journeysCashAboveLimitInAll ? 'warning' : 'default', detail: 'Cash receipts added up' },
        { label: 'Mode not read', value: rupeesShort(network.modeNotReadAmount),
          detail: `${percent(network.modeNotReadPercent, 1)} of the money · ${count(network.modeNotRead)} receipts` },
        { label: 'Refunds', value: rupeesShort(data.basis.refundAmount), detail: `${count(data.basis.refunds)} refunds` },
      ]} />

      <div className="ins-grid">
        <Section title="By payment mode" description="Share of the money received.">
          <MeterList empty="No receipt has been read yet."
                     rows={data.modes.map((mode) => ({
                       key: mode.mode, label: mode.label, value: mode.amount,
                       display: `${rupeesShort(mode.amount)} · ${percent(mode.sharePercent, 1)}`,
                       detail: `${count(mode.receipts)} receipts · typical ${rupeesShort(mode.typical)}`,
                     }))} />
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

      <Section title={`Cash receipts above ${limit}`} description="Single cash receipts above the limit the audit checks.">
        <DataTable columns={largeColumns} rows={data.cashAboveLimit} rowKey={(row) => `${row.journeyId}-${row.receiptNumber}-${row.amount}-${row.date}`}
                   pageSize={10} sort={{ key: 'amount', direction: 'desc' }} csvName="cash-receipts-above-limit"
                   caption="Cash receipts above the limit" empty="No single cash receipt is above the limit." />
      </Section>
    </>
  );
}
