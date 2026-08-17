import type { DataBacking } from '../domain/models';

export default function DataBackingBadge({ backing }: { backing: DataBacking }) {
  const label = backing === 'CORE' ? 'Audit Core' : backing === 'HYBRID' ? 'Core + Web aggregate' : 'Web demo data';
  return <span className={`data-backing data-backing--${backing.toLowerCase()}`}>{label}</span>;
}
