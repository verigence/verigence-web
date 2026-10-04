import type { StructureComponent } from '../../../services/hr/payroll';
import { formatRupees } from './money';

interface Props {
  components: StructureComponent[];
  /** The gross as the server stored it. Shown, never added up here. */
  gross: string | number;
  caption?: string;
}

/** The parts of a salary exactly as the server worked them out. */
export default function ComponentsTable({ components, gross, caption = 'Salary components' }: Props) {
  return (
    <div className="hr-pay-parts" role="table" aria-label={caption}>
      <div className="hr-pay-parts__row hr-pay-parts__row--head" role="row">
        <span role="columnheader">Component</span>
        <span role="columnheader">Per month</span>
      </div>
      {components.map((c) => (
        <div className="hr-pay-parts__row" role="row" key={c.code}>
          <span role="cell">
            {c.label}
            <small>{[c.pf_wage ? 'counts for PF' : null, c.esi_wage ? 'counts for ESI' : null].filter(Boolean).join(' · ') || 'no PF or ESI'}</small>
          </span>
          <span role="cell" className="hr-pay-money">{formatRupees(c.amount)}</span>
        </div>
      ))}
      <div className="hr-pay-parts__row hr-pay-parts__row--total" role="row">
        <span role="cell">Gross per month</span>
        <span role="cell" className="hr-pay-money">{formatRupees(gross)}</span>
      </div>
    </div>
  );
}
