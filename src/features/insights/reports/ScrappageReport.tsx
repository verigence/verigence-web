import { useState } from 'react';

import type { ScrappageInsight, ScrappageRegisterRow, ScrappageShareRow } from '../../../services/audit-core/uc03Insights';
import { count, dayLabel, percent, rupees, rupeesShort } from '../insightFormat';
import {
  CellBar, DataTable, GROUPING_NAME, GROUPINGS, GroupName, JourneyLink, MeterList, Section, Switcher, Tiles,
  type Column, type Grouping,
} from '../InsightParts';

const KIND: Record<string, string> = { TRANSFERRED: 'Transferred', ORIGINAL: 'Original' };

/** Scrappage: the certificates used, where they came from and what they saved. */
export default function ScrappageReport({ data }: { data: ScrappageInsight }) {
  const [group, setGroup] = useState<Grouping>('models');
  const summary = data.summary;
  const rows = data[group];

  const columns: Column<ScrappageShareRow>[] = [
    { key: 'label', label: GROUPING_NAME[group], value: (row) => row.label,
      render: (row) => <GroupName row={group === 'models' ? { ...row, parent: null } : row} thinBelow={data.basis.thinBelow} /> },
    { key: 'deals', label: 'Deals', numeric: true, value: (row) => row.deals, render: (row) => count(row.deals) },
    { key: 'certificates', label: 'With a certificate', numeric: true, value: (row) => row.certificates, render: (row) => count(row.certificates) },
    { key: 'percent', label: 'Share of deals', numeric: true, value: (row) => row.percent,
      render: (row) => <CellBar value={row.percent} max={100} display={percent(row.percent)} /> },
    { key: 'bonusGiven', label: 'Scrappage bonus given', numeric: true, value: (row) => row.bonusGiven, render: (row) => count(row.bonusGiven) },
  ];

  const registerColumns: Column<ScrappageRegisterRow>[] = [
    { key: 'bookingDate', label: 'Booking', value: (row) => row.bookingDate, render: (row) => <span className="ins-nowrap">{dayLabel(row.bookingDate)}</span> },
    { key: 'customer', label: 'Customer', value: (row) => row.customer ?? row.reference,
      render: (row) => (<><span className="ins-primary">{row.customer ?? '—'}</span><span className="ins-secondary">{row.reference}</span></>) },
    { key: 'outlet', label: 'Dealership · outlet', value: (row) => `${row.dealer} ${row.outlet}`,
      render: (row) => <GroupName row={{ key: row.journeyId, label: row.outlet ?? '—', parent: row.dealer ?? null }} /> },
    { key: 'model', label: 'Vehicle', value: (row) => row.model },
    { key: 'certificateNumber', label: 'Certificate', value: (row) => row.certificateNumber,
      render: (row) => (<><span className="ins-primary">{row.certificateNumber ?? 'Number not read'}</span>
        <span className="ins-secondary">{row.kind ? KIND[row.kind] ?? row.kind : 'Kind not read'}{row.certificates > 1 ? ` · ${row.certificates} certificates` : ''}</span></>) },
    { key: 'state', label: 'Old vehicle', value: (row) => row.state ?? row.oldRegistration,
      render: (row) => (<><span className="ins-primary">{row.oldRegistration ?? '—'}</span><span className="ins-secondary">{row.state ?? 'State not read'}</span></>) },
    { key: 'roadTaxPercent', label: 'Road tax paid', numeric: true, value: (row) => row.roadTaxPercent,
      render: (row) => (<><span className="ins-primary">{rupees(row.roadTaxPaid)}</span>
        <span className="ins-secondary">{row.roadTaxPercent == null ? '' : `${percent(row.roadTaxPercent, 1)} of ex-showroom`}</span></>) },
    { key: 'chargedAbovePaid', label: 'Charged less paid at RTO', numeric: true, value: (row) => row.chargedAbovePaid,
      render: (row) => (
        <span className={(row.chargedAbovePaid ?? 0) > data.basis.gapRupees ? 'ins-warning' : undefined}>{rupees(row.chargedAbovePaid)}</span>
      ) },
    { key: 'bonusGiven', label: 'Bonus given', numeric: true, value: (row) => row.bonusGiven, render: (row) => (row.bonusGiven ? rupees(row.bonusGiven) : '—') },
    { key: 'open', label: 'Open', value: () => '', render: (row) => <JourneyLink journeyId={row.journeyId} /> },
  ];

  return (
    <>
      <Tiles label="Totals" items={[
        { label: 'Deals with a certificate', value: count(summary.statementDealsWithCertificate),
          detail: `${percent(summary.percentOfStatementDeals)} of ${count(data.basis.statementDeals)} deals with a statement`,
          meter: summary.percentOfStatementDeals ?? 0 },
        { label: 'Transferred certificates', value: count(summary.transferred),
          detail: `${count(summary.original)} original · ${count(summary.certificates)} in all` },
        { label: 'Old vehicles from another state',
          value: summary.oldVehiclesOutsideState == null ? '—' : count(summary.oldVehiclesOutsideState),
          detail: `Of ${count(summary.oldVehiclesStateRead)} with the registration read` },
        { label: 'Scrappage bonus given', value: count(summary.bonusGiven),
          detail: `${count(summary.certificateWithoutBonus)} certificates with no bonus on the deal` },
        { label: 'Road tax saved (estimate)', value: rupeesShort(summary.estimatedRoadTaxSaved),
          detail: `On ${count(summary.roadTaxSavedOnDeals)} deals with the challan read` },
        { label: 'Certificates on two bookings', value: count(summary.certificatesUsedTwice),
          tone: summary.certificatesUsedTwice ? 'danger' : 'default', detail: 'One certificate, more than one booking' },
      ]} />

      <div className="ins-grid">
        <Section title="Where the old vehicles were registered" description="By the state code of the scrapped vehicle's registration.">
          <MeterList empty="No certificate has been read yet."
                     rows={data.states.map((state) => ({
                       key: state.state, label: state.state, value: state.certificates, display: count(state.certificates),
                       detail: summary.certificates ? percent((state.certificates / summary.certificates) * 100) : null,
                     }))} />
        </Section>
        <Section title="Road tax with and without a certificate"
                 description="Road tax on the RTO challan as a share of ex-showroom, on the models that carry certificates, inside one price band.">
          <DataTable caption="Road tax with and without a certificate" empty="No challan has been read yet." rowKey={(row) => row.band}
                     rows={data.roadTaxEffect.filter((band) => band.withCertificate + band.withoutCertificate > 0)}
                     columns={[
                       { key: 'band', label: 'Ex-showroom', value: (row) => row.band },
                       { key: 'taxPercentWithout', label: 'Without', numeric: true, value: (row) => row.taxPercentWithout,
                         render: (row) => (<><span className="ins-primary">{percent(row.taxPercentWithout, 1)}</span><span className="ins-secondary">{count(row.withoutCertificate)} deals</span></>) },
                       { key: 'taxPercentWith', label: 'With', numeric: true, value: (row) => row.taxPercentWith,
                         render: (row) => (<><span className="ins-primary">{percent(row.taxPercentWith, 1)}</span><span className="ins-secondary">{count(row.withCertificate)} deals</span></>) },
                       { key: 'savingPerDeal', label: 'Saved per deal', numeric: true, value: (row) => row.savingPerDeal, render: (row) => rupees(row.savingPerDeal) },
                       { key: 'saving', label: 'Saved in all', numeric: true, value: (row) => row.saving, render: (row) => rupeesShort(row.saving) },
                     ]} />
        </Section>
      </div>

      <Section title={`Certificates by ${GROUPING_NAME[group].toLowerCase()}`}
               actions={<Switcher label="Group by" options={GROUPINGS} value={group} onChange={setGroup} />}>
        <DataTable columns={columns} rows={rows} rowKey={(row) => row.key} sort={{ key: 'certificates', direction: 'desc' }}
                   csvName={`scrappage-by-${group}`} caption={`Scrappage certificates by ${GROUPING_NAME[group].toLowerCase()}`}
                   empty="No deal with an account statement matches these filters." rowClass={(row) => (row.thin ? 'is-thin' : undefined)} />
      </Section>

      {data.usedTwice.length ? (
        <Section title="Certificates on more than one booking" description="The same certificate number read on different bookings.">
          <ul className="ins-remarks">
            {data.usedTwice.map((entry) => (
              <li key={entry.certificateNumber ?? entry.journeys[0]?.journeyId}>
                <span className="ins-tag is-danger">{entry.certificateNumber ?? 'Number not read'}</span>
                <span className="ins-links">
                  {entry.journeys.map((journey) => (
                    <JourneyLink key={journey.journeyId} journeyId={journey.journeyId}>
                      {journey.customer ?? journey.reference ?? 'Journey'}
                    </JourneyLink>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Certificate register"
               description={`Every booking with a scrappage certificate. Charged less paid compares the statement's registration charge with the RTO challan; above ${rupees(data.basis.gapRupees)} is worth a look.`}>
        <DataTable columns={registerColumns} rows={data.register} rowKey={(row) => row.journeyId} pageSize={25}
                   sort={{ key: 'bookingDate', direction: 'desc' }} csvName="scrappage-register" caption="Scrappage certificate register"
                   empty="No booking carries a scrappage certificate." />
      </Section>
    </>
  );
}
