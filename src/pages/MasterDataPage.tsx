import { useState } from 'react';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import StatusPill from '../components/StatusPill';

type Tab = 'PRODUCT' | 'PRICE' | 'DISCOUNT' | 'CONTROLS';

const productRows = [
  { model: 'Aster', variant: 'ZX', colour: 'Deep Blue', fuel: 'Petrol', sku: 'AST-ZX-P-DB', status: 'ACTIVE' },
  { model: 'Aster', variant: 'VX', colour: 'Pearl White', fuel: 'Petrol', sku: 'AST-VX-P-PW', status: 'ACTIVE' },
  { model: 'Nova', variant: 'AX', colour: 'Graphite', fuel: 'Diesel', sku: 'NOV-AX-D-GR', status: 'ACTIVE' },
];
const priceRows = [
  { version: 'PL-AUG-2026-v1', effective: '01–31 Aug 2026', product: 'Aster ZX', exShowroom: '₹18,25,000', registration: '₹1,42,000', status: 'PUBLISHED' },
  { version: 'PL-AUG-2026-v1', effective: '01–31 Aug 2026', product: 'Aster VX', exShowroom: '₹16,90,000', registration: '₹1,31,000', status: 'PUBLISHED' },
  { version: 'PL-SEP-2026-draft', effective: '01–30 Sep 2026', product: 'Aster ZX', exShowroom: '₹18,42,000', registration: '₹1,43,500', status: 'DRAFT' },
];
const discountRows = [
  { scheme: 'August Retail Support', type: 'OEM_SCHEME', eligibility: 'Aster ZX · Individual', value: '₹30,000', effective: '01–31 Aug 2026', status: 'PUBLISHED' },
  { scheme: 'Corporate Programme', type: 'CORPORATE', eligibility: 'Approved corporate list', value: '₹15,000', effective: '01 Aug–30 Sep 2026', status: 'PUBLISHED' },
  { scheme: 'Exchange Bonus', type: 'EXCHANGE', eligibility: 'Eligible trade-in', value: '₹20,000', effective: '01–31 Aug 2026', status: 'PUBLISHED' },
];
const controlRows = [
  { key: 'BOOKING_MIN_AMOUNT', label: 'Minimum booking amount', value: '₹21,000', scope: 'Project', status: 'ACTIVE' },
  { key: 'DELIVERY_ADVANCE_MINUTES', label: 'Delivery file advance intimation', value: '30 minutes', scope: 'Project', status: 'ACTIVE' },
  { key: 'MOBILE_FORMAT', label: 'Customer / SC mobile format', value: '10 numeric digits', scope: 'India', status: 'ACTIVE' },
  { key: 'DOC_DELIVERY_GATE_PASS', label: 'Delivery Gate Pass requirement', value: 'Mandatory', scope: 'Delivery', status: 'ACTIVE' },
  { key: 'TRADEIN_AGEING', label: 'Trade-in ageing threshold', value: 'Decision pending', scope: 'Project', status: 'DRAFT' },
];

export default function MasterDataPage() {
  const [tab, setTab] = useState<Tab>('PRODUCT');
  return (
    <div className="screen-stack">
      <PageHeader eyebrow="Administration" title="Masters & controls" description="Effective-dated configuration that defines product availability, approved pricing, schemes, document requirements and validation thresholds without hard-coding changing OEM/Project rules." backing="WEB_DEMO" />
      <div className="master-tabs"><button className={tab === 'PRODUCT' ? 'active' : ''} onClick={() => setTab('PRODUCT')}>Product catalogue</button><button className={tab === 'PRICE' ? 'active' : ''} onClick={() => setTab('PRICE')}>Price lists</button><button className={tab === 'DISCOUNT' ? 'active' : ''} onClick={() => setTab('DISCOUNT')}>Discount schemes</button><button className={tab === 'CONTROLS' ? 'active' : ''} onClick={() => setTab('CONTROLS')}>Controls & requirements</button></div>
      {tab === 'PRODUCT' && <SectionCard title="OEM product catalogue" description="Model → Variant → Colour combinations with effective availability."><div className="data-table-wrap"><table className="data-table"><thead><tr><th>Model</th><th>Variant</th><th>Colour</th><th>Fuel / powertrain</th><th>SKU</th><th>Status</th></tr></thead><tbody>{productRows.map((row) => <tr key={row.sku}><td><strong>{row.model}</strong></td><td>{row.variant}</td><td>{row.colour}</td><td>{row.fuel}</td><td>{row.sku}</td><td><StatusPill value={row.status} compact /></td></tr>)}</tbody></table></div></SectionCard>}
      {tab === 'PRICE' && <SectionCard title="Versioned price lists" description="Standard amounts stay tied to the effective version used by the audited booking."><div className="data-table-wrap"><table className="data-table"><thead><tr><th>Version</th><th>Effective period</th><th>Product</th><th>Ex-showroom</th><th>Registration</th><th>Lifecycle</th></tr></thead><tbody>{priceRows.map((row, index) => <tr key={`${row.version}-${index}`}><td><strong>{row.version}</strong></td><td>{row.effective}</td><td>{row.product}</td><td>{row.exShowroom}</td><td>{row.registration}</td><td><StatusPill value={row.status} compact /></td></tr>)}</tbody></table></div></SectionCard>}
      {tab === 'DISCOUNT' && <SectionCard title="Discount / scheme versions" description="Monthly/OEM/project schemes and eligibility rules used for Standard vs Actual audit comparison."><div className="data-table-wrap"><table className="data-table"><thead><tr><th>Scheme</th><th>Type</th><th>Eligibility</th><th>Approved value</th><th>Effective period</th><th>Lifecycle</th></tr></thead><tbody>{discountRows.map((row) => <tr key={row.scheme}><td><strong>{row.scheme}</strong></td><td>{row.type.replaceAll('_', ' ')}</td><td>{row.eligibility}</td><td>{row.value}</td><td>{row.effective}</td><td><StatusPill value={row.status} compact /></td></tr>)}</tbody></table></div></SectionCard>}
      {tab === 'CONTROLS' && <SectionCard title="Supporting masters, controls & document requirements" description="Configurable values include customer/deal classifications, payment modes, registration types, RSA/EW/service-package options, evidence requirements and validation tolerances."><div className="control-grid">{controlRows.map((row) => <article className="control-card" key={row.key}><div><span>{row.scope}</span><StatusPill value={row.status} compact /></div><strong>{row.label}</strong><p>{row.value}</p><small>{row.key}</small></article>)}</div></SectionCard>}
      <div className="backend-gap-banner"><strong>Versioning UI baseline is complete</strong><span>The current Audit Core mounted API does not expose public Web endpoints for the full product/price/discount/supporting-master lifecycle. Create/edit/publish persistence will be implemented after Web sign-off; no other module is changed during this phase.</span></div>
    </div>
  );
}
