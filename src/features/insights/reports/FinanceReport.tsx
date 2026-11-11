import { barOption, TONE, topBy } from '../charts/chartOptions';
import { barsHeight, Chart } from '../charts/Chart';
import { useState } from 'react';

import type { FinanceInsight, FinanceRow } from '../../../services/audit-core/uc03Insights';
import { count, percent, rupees, rupeesShort, shortOutlet } from '../insightFormat';
import {
  CellBar, DataTable, GROUPING_NAME, GROUPINGS, GroupName, JourneyLink, MeterList, Section, Switcher, Tiles,
  type Column, type Grouping,
} from '../InsightParts';

type Lender = FinanceInsight['lenders'][number];
type Gap = FinanceInsight['sanctionGaps'][number];

/** Finance: who funds the deals, how much, and against what price. */
export default function FinanceReport({ data }: { data: FinanceInsight }) {
  const [group, setGroup] = useState<Grouping>('outlets');
  const summary = data.summary;
  const rows = data[group];
  const mostDeals = Math.max(...data.lenders.map((lender) => lender.deals), 1);

  const lenderColumns: Column<Lender>[] = [
    { key: 'lender', label: 'Financier', value: (row) => row.lender,
      render: (row) => (<><span className="ins-primary">{row.lender}</span>
        <span className="ins-secondary">{Object.entries(row.dealers).map(([dealer, n]) => `${dealer} ${n}`).join(' · ')}</span></>) },
    { key: 'deals', label: 'Deals financed', numeric: true, value: (row) => row.deals,
      render: (row) => <CellBar value={row.deals} max={mostDeals} display={`${count(row.deals)} · ${percent(row.sharePercent)}`} /> },
    { key: 'loanKnown', label: 'Loans read', numeric: true, value: (row) => row.loanKnown, render: (row) => count(row.loanKnown) },
    { key: 'typicalLoan', label: 'Typical loan', numeric: true, value: (row) => row.typicalLoan, render: (row) => rupees(row.typicalLoan) },
    { key: 'typicalLoanToValue', label: 'Loan to ex-showroom', numeric: true, value: (row) => row.typicalLoanToValue,
      render: (row) => percent(row.typicalLoanToValue) },
    { key: 'loanTotal', label: 'Total lent', numeric: true, value: (row) => row.loanTotal, render: (row) => rupeesShort(row.loanTotal) },
  ];

  const columns: Column<FinanceRow>[] = [
    { key: 'label', label: GROUPING_NAME[group], value: (row) => row.label,
      render: (row) => <GroupName row={group === 'models' ? { ...row, parent: null } : row} thinBelow={data.basis.thinBelow} /> },
    { key: 'deals', label: 'Deals', numeric: true, value: (row) => row.deals, render: (row) => count(row.deals) },
    { key: 'percent', label: 'Financed', numeric: true, value: (row) => row.percent,
      render: (row) => <CellBar value={row.percent} max={100} display={`${percent(row.percent)} · ${count(row.financed)}`} /> },
    { key: 'typicalLoan', label: 'Typical loan', numeric: true, value: (row) => row.typicalLoan, render: (row) => rupees(row.typicalLoan) },
    { key: 'typicalLoanToValue', label: 'Loan to ex-showroom', numeric: true, value: (row) => row.typicalLoanToValue,
      render: (row) => percent(row.typicalLoanToValue) },
    { key: 'loanTotal', label: 'Total lent', numeric: true, value: (row) => row.loanTotal, render: (row) => rupeesShort(row.loanTotal) },
  ];

  const gapColumns: Column<Gap>[] = [
    { key: 'customer', label: 'Customer', value: (row) => row.customer ?? row.reference,
      render: (row) => (<><span className="ins-primary">{row.customer ?? '—'}</span><span className="ins-secondary">{row.reference}</span></>) },
    { key: 'outlet', label: 'Dealership · outlet', value: (row) => `${row.dealer} ${row.outlet}`,
      render: (row) => <GroupName row={{ key: row.journeyId, label: row.outlet ?? '—', parent: row.dealer ?? null }} /> },
    { key: 'lender', label: 'Financier', value: (row) => row.lender },
    { key: 'sanctioned', label: 'Sanctioned', numeric: true, value: (row) => row.sanctioned, render: (row) => rupees(row.sanctioned) },
    { key: 'disbursed', label: 'Disbursed', numeric: true, value: (row) => row.disbursed, render: (row) => rupees(row.disbursed) },
    { key: 'short', label: 'Sanctioned less disbursed', numeric: true, value: (row) => row.short,
      render: (row) => <span className={row.short > 0 ? 'ins-danger' : undefined}>{rupees(row.short)}</span> },
    { key: 'open', label: 'Open', value: () => '', render: (row) => <JourneyLink journeyId={row.journeyId} /> },
  ];

  const lenders = topBy(data.lenders, (row) => row.deals, 12);
  const financed = topBy(rows.filter((row) => !row.thin), (row) => row.percent, 14);

  return (
    <>
      <Tiles label="Totals" items={[
        { label: 'Financed', value: percent(summary.percent), meter: summary.percent ?? 0,
          detail: `${count(summary.financed)} of ${count(summary.deals)} deals` },
        { label: 'Total lent', value: rupeesShort(summary.loanTotal), detail: `Loan amount read on ${count(summary.loanKnown)} of ${count(summary.financed)}` },
        { label: 'Typical loan', value: rupeesShort(summary.typicalLoan), detail: 'Middle loan' },
        { label: 'Loan to ex-showroom', value: percent(summary.typicalLoanToValue), detail: `Middle of ${count(summary.loanToValueKnown)} loans` },
        { label: 'Loan above ex-showroom', value: count(summary.loanAboveExShowroom),
          detail: 'Funded on the on-road price' },
        { label: 'Disbursed short of sanction', value: rupeesShort(summary.shortDisbursed.amount),
          tone: summary.shortDisbursed.deals ? 'warning' : 'default',
          detail: `${count(summary.shortDisbursed.deals)} of ${count(summary.sanctionAndDisbursalRead)} deals with both read` },
      ]} />
      <p className="ins-footnote">Of {count(data.basis.statementDeals)} deals with the account statement on file. Across all live bookings, {count(data.basis.financedAllLiveJourneys)} are financed.</p>

      <div className="ins-grid">
        <Section title="Who funds the deals" description="Financed deals by financier.">
          <Chart label="Financed deals by financier" height={barsHeight(lenders.length)} empty="No financed deal matches these filters."
                 option={lenders.length ? barOption({
                   horizontal: true, labels: true, categories: lenders.map((row) => row.lender),
                   series: [{ name: 'Deals', data: lenders.map((row) => row.deals), color: TONE.primary }],
                 }) : null} />
        </Section>
        <Section title={`Finance share, by ${GROUPING_NAME[group].toLowerCase()}`}
                 description="Share of deals with a statement that are financed. The dashed line is the network.">
          <Chart label="Finance share by group against the network" height={barsHeight(financed.length)}
                 option={financed.length ? barOption({
                   horizontal: true, labels: true, max: 100, format: (value) => `${Math.round(value)}%`,
                   categories: financed.map((row) => (group === 'outlets' ? shortOutlet(row.label, row.parent ?? undefined) : row.label)),
                   series: [{ name: 'Financed', data: financed.map((row) => row.percent), color: TONE.primary }],
                   reference: summary.percent == null ? undefined : { value: summary.percent, label: `Network ${Math.round(summary.percent)}%` },
                 }) : null} />
        </Section>
      </div>

      <div className="ins-grid">
        <Section title="Loan against ex-showroom" description={`${count(summary.loanToValueKnown)} loans with the loan and the price both read.`}>
          <Chart label="Loans by share of ex-showroom lent" height={300} empty="No loan can be compared with its price yet."
                 option={summary.loanToValueKnown ? barOption({
                   labels: true, categories: data.loanToValueBands.map((band) => band.band),
                   series: [{ name: 'Loans', data: data.loanToValueBands.map((band) => band.deals), color: TONE.second }],
                 }) : null} />
        </Section>
        <Section title="Loan size" description={`${count(summary.loanKnown)} loans with the amount read.`}>
          <Chart label="Loans by amount" height={300} empty="No loan amount has been read yet."
                 option={summary.loanKnown ? barOption({
                   labels: true, categories: data.loanBands.map((band) => band.band),
                   series: [{ name: 'Loans', data: data.loanBands.map((band) => band.deals), color: TONE.primary }],
                 }) : null} />
        </Section>
      </div>

      <Section title="Financiers" description="Who funded the deals, their share, and how much of the price they lend.">
        <DataTable columns={lenderColumns} rows={data.lenders} rowKey={(row) => row.lender} pageSize={10}
                   sort={{ key: 'deals', direction: 'desc' }} csvName="financiers" caption="Financiers"
                   empty="No financed deal matches these filters." />
      </Section>

      <Section title={`Finance by ${GROUPING_NAME[group].toLowerCase()}`}
               actions={<Switcher label="Group by" options={GROUPINGS} value={group} onChange={setGroup} />}>
        <DataTable columns={columns} rows={rows} rowKey={(row) => row.key} sort={{ key: 'deals', direction: 'desc' }}
                   csvName={`finance-by-${group}`} caption={`Finance by ${GROUPING_NAME[group].toLowerCase()}`}
                   empty="No deal with an account statement matches these filters." rowClass={(row) => (row.thin ? 'is-thin' : undefined)} />
      </Section>

      <Section title="Sanction against disbursal"
               description={`Deals where the sanctioned and the disbursed amount were both read and differ by more than ${rupees(data.basis.gapRupees)}.`}>
        <DataTable columns={gapColumns} rows={data.sanctionGaps} rowKey={(row) => row.journeyId} pageSize={10}
                   sort={{ key: 'short', direction: 'desc' }} csvName="sanction-against-disbursal"
                   caption="Sanction against disbursal" empty="Every sanction read matches its disbursal." />
      </Section>
    </>
  );
}
