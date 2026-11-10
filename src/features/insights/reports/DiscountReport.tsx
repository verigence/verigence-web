import { useState } from 'react';
import { Link } from 'react-router-dom';

import type { DiscountInsight, DiscountOutlier, DiscountRow } from '../../../services/audit-core/uc03Insights';
import { count, dayLabel, percent, rupees, rupeesShort, signed } from '../insightFormat';
import {
  CellBar, DataTable, GROUPING_NAME, GROUPINGS, GroupName, JourneyLink, MeterList, Section, Switcher, Tiles,
  type Column, type Grouping,
} from '../InsightParts';

const RULE_NAME: Record<string, string> = {
  EXCESS_DISCOUNT: 'Discount beyond the entitlement',
  KIT_GIVEN_AS_CASH: 'Accessories kit given as cash',
};
const DECISION_NAME: Record<string, string> = { CONFIRMED_BREACH: 'Confirmed breach', FALSE_POSITIVE: 'False positive' };

/** Discount control: what was given, the Deal's verdict on it, and who gives more than the rest. */
export default function DiscountReport({ data }: { data: DiscountInsight }) {
  const [group, setGroup] = useState<Grouping>('outlets');
  const network = data.network;
  const verdicts = network.verdicts;
  const rows = data[group];
  const highestRate = Math.max(...rows.map((row) => row.givenPercent ?? 0), 1);
  const likeForLike = group !== 'models';

  const columns: Column<DiscountRow>[] = [
    { key: 'label', label: GROUPING_NAME[group], value: (row) => row.label,
      render: (row) => <GroupName row={group === 'models' ? { ...row, parent: null } : row} thinBelow={data.basis.thinBelow} /> },
    { key: 'deals', label: 'Deals billed', numeric: true, value: (row) => row.deals, render: (row) => count(row.deals) },
    { key: 'given', label: 'Discount given', numeric: true, value: (row) => row.given, render: (row) => rupeesShort(row.given) },
    { key: 'givenPercent', label: '% of ex-showroom', numeric: true, value: (row) => row.givenPercent,
      render: (row) => <CellBar value={row.givenPercent} max={highestRate} display={percent(row.givenPercent, 2)} /> },
    { key: 'perDeal', label: 'Per deal', numeric: true, value: (row) => row.perDeal, render: (row) => rupees(row.perDeal) },
    ...(likeForLike ? [
      { key: 'index', label: 'Against network', numeric: true, value: (row: DiscountRow) => row.index,
        render: (row: DiscountRow) => (
          <span className={`ins-index${(row.index ?? 1) >= 1.25 ? ' is-high' : (row.index ?? 1) <= 0.75 ? ' is-low' : ''}`}>
            {row.index == null ? '—' : `${row.index.toFixed(2)}×`}
            <small>{row.aboveExpected == null ? '' : `${signed(row.aboveExpected / 100000, 2)} lakh`}</small>
          </span>
        ) } satisfies Column<DiscountRow>,
    ] : []),
    { key: 'over', label: 'Over entitlement', numeric: true, value: (row) => row.verdicts.OVER_ENTITLEMENT.amount,
      render: (row) => <span className={row.verdicts.OVER_ENTITLEMENT.amount ? 'ins-danger' : undefined}>{rupeesShort(row.verdicts.OVER_ENTITLEMENT.amount)}</span> },
    { key: 'kit', label: 'Kit as cash', numeric: true, value: (row) => row.verdicts.KIT_AS_CASH.amount, render: (row) => rupeesShort(row.verdicts.KIT_AS_CASH.amount) },
    { key: 'unknown', label: 'Entitlement unknown', numeric: true, value: (row) => row.verdicts.ENTITLEMENT_UNKNOWN.amount,
      render: (row) => rupeesShort(row.verdicts.ENTITLEMENT_UNKNOWN.amount) },
  ];

  const outlierColumns: Column<DiscountOutlier>[] = [
    { key: 'bookingDate', label: 'Booking', value: (row) => row.bookingDate, render: (row) => <span className="ins-nowrap">{dayLabel(row.bookingDate)}</span> },
    { key: 'customer', label: 'Customer', value: (row) => row.customer ?? row.reference,
      render: (row) => (<><span className="ins-primary">{row.customer ?? '—'}</span><span className="ins-secondary">{row.reference}</span></>) },
    { key: 'outlet', label: 'Dealership · outlet', value: (row) => `${row.dealer} ${row.outlet}`,
      render: (row) => <GroupName row={{ key: row.journeyId, label: row.outlet ?? '—', parent: row.dealer ?? null }} /> },
    { key: 'model', label: 'Vehicle', value: (row) => row.model,
      render: (row) => (<><span className="ins-primary">{row.model}</span>{row.variant ? <span className="ins-secondary">{row.variant}</span> : null}</>) },
    { key: 'exShowroom', label: 'Ex-showroom', numeric: true, value: (row) => row.exShowroom, render: (row) => rupees(row.exShowroom) },
    { key: 'given', label: 'Discount given', numeric: true, value: (row) => row.given,
      render: (row) => (<><span className="ins-primary">{rupees(row.given)}</span>
        <span className="ins-secondary">{row.lines.map((line) => `${line.label} ${rupeesShort(line.amount)}`).join(' · ')}</span></>) },
    { key: 'percent', label: '% of ex-showroom', numeric: true, value: (row) => row.percent,
      render: (row) => (row.percent == null ? <span className="ins-secondary">Price in doubt</span> : percent(row.percent, 1)) },
    { key: 'open', label: 'Open', value: () => '', render: (row) => <JourneyLink journeyId={row.journeyId} /> },
  ];

  const decisions = data.decisions;
  const open = decisions.rules.reduce((sum, rule) => sum + rule.open, 0);
  const rechecked = decisions.rules.reduce((sum, rule) => sum + rule.closedOnRecheck, 0);

  return (
    <>
      <Tiles label="Totals" items={[
        { label: 'Discount given', value: rupeesShort(network.given),
          detail: `${percent(network.givenPercent, 2)} of ex-showroom · ${count(network.discountedDeals)} of ${count(network.deals)} deals` },
        { label: 'Over entitlement', value: rupeesShort(verdicts.OVER_ENTITLEMENT.amount), tone: verdicts.OVER_ENTITLEMENT.amount ? 'danger' : 'default',
          detail: `${count(verdicts.OVER_ENTITLEMENT.lines)} discounts on ${count(verdicts.OVER_ENTITLEMENT.journeys)} deals` },
        { label: 'Kit given as cash', value: rupeesShort(verdicts.KIT_AS_CASH.amount), tone: verdicts.KIT_AS_CASH.amount ? 'warning' : 'default',
          detail: `${count(verdicts.KIT_AS_CASH.journeys)} deals` },
        { label: 'Entitlement unknown', value: rupeesShort(verdicts.ENTITLEMENT_UNKNOWN.amount),
          detail: `Given on ${count(verdicts.ENTITLEMENT_UNKNOWN.lines)} discounts with nothing to compare with` },
        { label: 'Under entitlement', value: rupeesShort(verdicts.UNDER_ENTITLEMENT.amount),
          detail: `Not passed on, ${count(verdicts.UNDER_ENTITLEMENT.lines)} discounts` },
      ]} />
      <p className="ins-footnote">
        The verdicts are the Deal's own, line by line. <Link className="ins-link" to="/p2/discount-variance">Open the Excess discount list →</Link>
        {data.basis.notYetCalculated > 0 ? ` ${count(data.basis.notYetCalculated)} bookings are still being calculated.` : ''}
      </p>

      <div className="ins-grid">
        <Section title="By discount type" description="What was given under each head, on deals billed.">
          <MeterList empty="No discount has been given on a billed deal."
                     rows={data.byDiscount.map((line) => ({
                       key: line.key, label: line.label, value: line.given ?? 0,
                       display: rupeesShort(line.given),
                       detail: [
                         `${count(line.deals)} deals`,
                         line.over ? `over ${rupeesShort(line.over)}` : '',
                         line.kitAsCash ? `kit as cash ${rupeesShort(line.kitAsCash)}` : '',
                         line.unknown ? `unknown ${rupeesShort(line.unknown)}` : '',
                       ].filter(Boolean).join(' · '),
                     }))} />
        </Section>
        <Section title="Why the entitlement is unknown"
                 description="Discount given that cannot be judged yet, by what is missing. Clearing the reason turns it into a verdict.">
          <MeterList empty="Every discount given has an entitlement to compare with."
                     rows={data.unknownByReason.map((reason) => ({
                       key: `${reason.reason}-${reason.key}`, label: reason.label, sub: reason.reason, value: reason.amount,
                       display: rupeesShort(reason.amount), detail: `${count(reason.lines)} discounts`,
                     }))} />
        </Section>
      </div>

      <Section title={`Who gives more: by ${GROUPING_NAME[group].toLowerCase()}`}
               description={likeForLike
                 ? 'Against network compares what was given with what the same models get across the network: 1.00× is the network, above it gives more.'
                 : 'Discount as a share of the ex-showroom billed, model by model.'}
               actions={<Switcher label="Group by" options={GROUPINGS} value={group} onChange={setGroup} />}>
        <DataTable columns={columns} rows={rows} rowKey={(row) => row.key} sort={{ key: 'given', direction: 'desc' }}
                   csvName={`discount-by-${group}`} caption={`Discount by ${GROUPING_NAME[group].toLowerCase()}`}
                   empty="No billed deal matches these filters." rowClass={(row) => (row.thin ? 'is-thin' : undefined)} />
      </Section>

      <Section title="Largest discounts"
               description={`Deals with discount above ${data.basis.outlierPercent}% of ex-showroom, or ${rupeesShort(data.basis.outlierAmount)} and more. ${
                 data.concentration.aboveMark
                   ? `${count(data.concentration.aboveMark)} of ${count(data.concentration.discountedDeals)} discounted deals are above ${data.basis.outlierPercent}% and take ${percent(data.concentration.aboveMarkSharePercent)} of all discount.`
                   : ''}`}>
        <DataTable columns={outlierColumns} rows={data.outliers} rowKey={(row) => row.journeyId} pageSize={10}
                   sort={{ key: 'given', direction: 'desc' }} csvName="largest-discounts" caption="Largest discounts"
                   empty="No deal is above these marks." />
      </Section>

      <Section title="Decisions on discount tasks"
               description="A task closed on re-check went away when the deal was read again. Only a confirmed breach or a false positive is a person's decision.">
        <Tiles label="Decisions" items={[
          { label: 'Tasks raised', value: count(decisions.raised) },
          { label: 'Open', value: count(open), tone: open ? 'warning' : 'default' },
          { label: 'Closed on re-check', value: count(rechecked) },
          { label: 'Decided by a person', value: count(decisions.decidedByAPerson),
            detail: decisions.raised ? `${percent((decisions.decidedByAPerson / decisions.raised) * 100, 1)} of tasks raised` : undefined },
        ]} />
        <DataTable caption="Decisions by task type" empty="No discount task has been raised." rowKey={(row) => row.rule}
                   rows={decisions.rules}
                   columns={[
                     { key: 'rule', label: 'Task', value: (row) => RULE_NAME[row.rule] ?? row.rule },
                     { key: 'raised', label: 'Raised', numeric: true, value: (row) => row.raised },
                     { key: 'open', label: 'Open', numeric: true, value: (row) => row.open },
                     { key: 'closedOnRecheck', label: 'Closed on re-check', numeric: true, value: (row) => row.closedOnRecheck },
                     { key: 'confirmedBreach', label: 'Confirmed breach', numeric: true, value: (row) => row.confirmedBreach },
                     { key: 'falsePositive', label: 'False positive', numeric: true, value: (row) => row.falsePositive },
                   ]} />
        {decisions.remarks.length ? (
          <>
            <h3 className="ins-subhead">What the reviewers wrote</h3>
            <ul className="ins-remarks">
            {decisions.remarks.map((remark) => (
              <li key={`${remark.journeyId}-${remark.rule}-${remark.remark}`}>
                <span className="ins-tag">{DECISION_NAME[remark.decision] ?? remark.decision}</span>
                <span>{remark.remark}</span>
                <JourneyLink journeyId={remark.journeyId} />
              </li>
            ))}
            </ul>
          </>
        ) : null}
      </Section>
    </>
  );
}
