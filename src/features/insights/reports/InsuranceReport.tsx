import { useState } from 'react';

import type { ChannelRow, InsuranceInsight, OutsideAgent } from '../../../services/audit-core/uc03Insights';
import { count, monthLabel, percent, rupeesShort, shortOutlet } from '../insightFormat';
import {
  DataTable, GROUPING_NAME, GROUPINGS, GroupName, JourneyLink, Legend, MeterList, Section, SegmentBar, Switcher, Tiles,
  type Column, type Grouping,
} from '../InsightParts';

const SPLIT = [
  { label: 'In-house', tone: 'a' as const },
  { label: "Outside the dealer's code", tone: 'b' as const },
  { label: 'No policy on file', tone: 'none' as const },
];

/** Insurance: what the dealer sold in-house, and where the rest went. */
export default function InsuranceReport({ data }: { data: InsuranceInsight }) {
  const [group, setGroup] = useState<Grouping>('outlets');
  const network = data.network;
  const off = data.dealerCodeOffStatement;
  const rows = data[group];

  const columns: Column<ChannelRow>[] = [
    { key: 'label', label: GROUPING_NAME[group], value: (row) => row.label,
      render: (row) => <GroupName row={group === 'models' ? { ...row, parent: null } : row} thinBelow={data.basis.thinBelow} /> },
    { key: 'deals', label: 'Deals', numeric: true, value: (row) => row.deals, render: (row) => count(row.deals) },
    { key: 'split', label: 'Split', value: (row) => row.inhousePercent,
      render: (row) => (
        <SegmentBar label={`${row.label} insurance split`} parts={[
          { key: 'in', label: 'In-house', value: row.inhouse, tone: 'a' },
          { key: 'out', label: 'Outside', value: row.outside, tone: 'b' },
          { key: 'none', label: 'No policy', value: row.noPolicy, tone: 'none' },
        ]} />
      ) },
    { key: 'inhousePercent', label: 'In-house', numeric: true, value: (row) => row.inhousePercent,
      render: (row) => `${percent(row.inhousePercent)} · ${count(row.inhouse)}` },
    { key: 'outside', label: 'Outside', numeric: true, value: (row) => row.outside,
      render: (row) => `${percent(row.outsidePercent)} · ${count(row.outside)}` },
    { key: 'noPolicy', label: 'No policy', numeric: true, value: (row) => row.noPolicy, render: (row) => count(row.noPolicy) },
    { key: 'inhousePremium', label: 'In-house premium', numeric: true, value: (row) => row.inhousePremium, render: (row) => rupeesShort(row.inhousePremium) },
    { key: 'outsidePremium', label: 'Outside premium', numeric: true, value: (row) => row.outsidePremium,
      render: (row) => <span className={row.outsidePremium ? 'ins-warning' : undefined}>{rupeesShort(row.outsidePremium)}</span> },
  ];

  const agentColumns: Column<OutsideAgent>[] = [
    { key: 'agent', label: 'Agent on the policy', value: (row) => row.agent,
      render: (row) => (<><span className="ins-primary">{row.agent}</span><span className="ins-secondary">{row.code ? `Code ${row.code}` : 'No code read'}</span></>) },
    { key: 'policies', label: 'Policies', numeric: true, value: (row) => row.policies, render: (row) => count(row.policies) },
    { key: 'premium', label: 'Premium', numeric: true, value: (row) => row.premium, render: (row) => rupeesShort(row.premium) },
    { key: 'confirmedOutside', label: 'Confirmed outside', numeric: true, value: (row) => row.confirmedOutside,
      render: (row) => `${count(row.confirmedOutside)} of ${count(row.policies)}` },
    { key: 'outlets', label: 'Outlets', value: (row) => row.outlets.map((o) => o.outlet).join(', '),
      render: (row) => (
        <span className="ins-secondary ins-wrap">
          {row.outlets.slice(0, 3).map((o) => `${shortOutlet(o.outlet, row.dealers.find((d) => o.outlet.startsWith(d)))} (${o.policies})`).join(' · ')}
          {row.outlets.length > 3 ? ` · +${row.outlets.length - 3} more` : ''}
        </span>
      ) },
    { key: 'journeys', label: 'Open', value: () => '',
      render: (row) => (
        <span className="ins-links">
          {row.journeys.slice(0, 3).map((journey) => (
            <JourneyLink key={journey.journeyId} journeyId={journey.journeyId}>{journey.reference ?? 'Journey'}</JourneyLink>
          ))}
        </span>
      ) },
  ];

  return (
    <>
      <Tiles label="Totals" items={[
        { label: 'In-house insurance', value: percent(network.inhousePercent), meter: network.inhousePercent ?? 0,
          detail: `${count(network.inhouse)} of ${count(network.deals)} deals · ${rupeesShort(network.inhousePremium)} premium` },
        { label: "Outside the dealer's code", value: count(network.outside), tone: network.outside ? 'warning' : 'default',
          detail: `${percent(network.outsidePercent)} of deals · ${rupeesShort(network.outsidePremium)} premium` },
        { label: 'No policy on file', value: count(network.noPolicy), detail: 'Deals with a statement and no policy read' },
        { label: "Dealer's code, premium not on the statement", value: count(off.policies), tone: off.policies ? 'warning' : 'default',
          detail: off.policies ? `${rupeesShort(off.premium)} premium collected elsewhere` : 'None' },
      ]} />
      <p className="ins-footnote">Of {count(data.basis.statementDeals)} deals with the account statement on file; {count(data.basis.policiesOnFile)} have a policy read.</p>

      <Section title={`In-house against outside, by ${GROUPING_NAME[group].toLowerCase()}`}
               description="In-house: confirmed by the PC, the premium is on the dealer's statement, or the policy carries the dealer's own code."
               actions={<Switcher label="Group by" options={GROUPINGS} value={group} onChange={setGroup} />}>
        <Legend items={SPLIT} />
        <DataTable columns={columns} rows={rows} rowKey={(row) => row.key} sort={{ key: 'deals', direction: 'desc' }}
                   csvName={`insurance-by-${group}`} caption={`Insurance channel by ${GROUPING_NAME[group].toLowerCase()}`}
                   empty="No deal with an account statement matches these filters." rowClass={(row) => (row.thin ? 'is-thin' : undefined)} />
      </Section>

      <Section title="Agents the outside policies went through"
               description="Policies outside the dealer's code, grouped by the agent code printed on the policy. One agent across many deals of an outlet is worth a question.">
        <DataTable columns={agentColumns} rows={data.outsideAgents} rowKey={(row) => row.key} pageSize={10}
                   sort={{ key: 'policies', direction: 'desc' }} csvName="outside-insurance-agents"
                   caption="Agents on outside policies" empty="No policy is outside the dealer's code." />
      </Section>

      {off.policies > 0 ? (
        <Section title="Dealer's code on the policy, premium not on the statement"
                 description="The policy was issued through the dealer, and the account statement charges no insurance premium.">
          <DataTable caption="Policies with the dealer's code and no premium on the statement" empty="None."
                     rowKey={(row) => row.journeyId} rows={off.journeys} pageSize={10}
                     columns={[
                       { key: 'reference', label: 'Journey', value: (row) => row.reference, render: (row) => <JourneyLink journeyId={row.journeyId}>{row.reference ?? 'Journey'}</JourneyLink> },
                       { key: 'outlet', label: 'Dealership · outlet', value: (row) => `${row.dealer} ${row.outlet}`,
                         render: (row) => <GroupName row={{ key: row.journeyId, label: row.outlet ?? '—', parent: row.dealer ?? null }} /> },
                       { key: 'premium', label: 'Premium', numeric: true, value: (row) => row.premium, render: (row) => rupeesShort(row.premium) },
                     ]} />
        </Section>
      ) : null}

      <div className="ins-grid">
        <Section title="Insurers" description={`Share of the ${count(data.basis.policiesOnFile)} policies read.`}>
          <MeterList empty="No policy has been read yet."
                     rows={data.insurers.map((insurer) => ({
                       key: insurer.insurer, label: insurer.insurer, value: insurer.policies,
                       display: `${count(insurer.policies)} · ${percent(insurer.sharePercent)}`,
                       detail: `${rupeesShort(insurer.premium)} · ${count(insurer.inhouse)} in-house, ${count(insurer.outside)} outside`,
                     }))} />
        </Section>
        <Section title="Add-on covers" description={`Of ${count(data.basis.policiesWithCovers)} policies whose cover list was read.`}>
          <MeterList empty="No cover list has been read yet." max={100}
                     rows={data.covers.map((cover) => ({
                       key: cover.cover, label: cover.cover, value: cover.percent ?? 0, display: percent(cover.percent),
                       detail: `${count(cover.policies)} policies`,
                     }))} />
        </Section>
      </div>

      <Section title="Renewals falling due"
               description={`By the month the policy ends, from ${count(data.basis.renewalDatesRead)} policies with an end date read: the renewal calls to plan.`}>
        <DataTable caption="Renewals by month" empty="No policy end date has been read yet." rowKey={(row) => row.month}
                   rows={data.renewals}
                   columns={[
                     { key: 'month', label: 'Month', value: (row) => row.month, render: (row) => monthLabel(row.month) },
                     { key: 'policies', label: 'Policies', numeric: true, value: (row) => row.policies },
                     { key: 'premium', label: 'Premium this year', numeric: true, value: (row) => row.premium, render: (row) => rupeesShort(row.premium) },
                     { key: 'inhouse', label: 'In-house', numeric: true, value: (row) => row.inhouse },
                     { key: 'outside', label: 'Outside, to win back', numeric: true, value: (row) => row.outside },
                   ]} />
      </Section>

      <Section title="How each policy was placed" description="Every deal with a statement, by what decided its channel.">
        <MeterList empty="No deal with an account statement matches these filters."
                   rows={Object.entries(data.channelLabels).map(([key, label]) => ({
                     key, label, value: network.channels[key] ?? 0, display: count(network.channels[key] ?? 0),
                     detail: network.deals ? percent(((network.channels[key] ?? 0) / network.deals) * 100) : null,
                   })).filter((row) => row.value > 0)} />
      </Section>
    </>
  );
}
