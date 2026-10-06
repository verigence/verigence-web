import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import {
  EMPTY_PRICE_SHEET_FILTERS,
  fetchPriceSheet,
  formatRupees,
  type PriceMasterStandard,
  type PriceMasterVehicle,
  type PriceSheetFilters,
} from '../services/audit-core/priceMasters';
import { PriceMasterRedirect, ProjectPicker, usePriceMasterProject } from './priceMasterProject';
import '../styles/oem-masters.css';
import '../styles/price-masters.css';

function today(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

function Line({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="price-masters__line">
      <dt>{label}</dt>
      <dd>
        {value}
        {note ? <small>{note}</small> : null}
      </dd>
    </div>
  );
}

const EW_ROWS: { key: 'NONE' | '4TH' | '4TH_5TH'; label: string }[] = [
  { key: 'NONE', label: 'No extended warranty' },
  { key: '4TH', label: 'EW 4th year' },
  { key: '4TH_5TH', label: 'EW 4th + 5th year' },
];

function StandardDetail({ standard }: { standard: PriceMasterStandard }) {
  const hypoNote =
    standard.hypothecationSource === 'VERSION_DEFAULT' ? 'Not on this vehicle’s sheet; the price list’s usual charge' : undefined;
  return (
    <div className="price-masters__detail">
      <dl className="price-masters__lines">
        <Line label="Ex-showroom" value={formatRupees(standard.exShowroom)} />
        <Line label="TCS" value={formatRupees(standard.tcs)} />
        <Line label="Insurance (in house)" value={formatRupees(standard.insurance.inHouse)} />
        <Line label="EW 4th year" value={formatRupees(standard.ewFourthYear)} />
        <Line label="EW 4th + 5th year" value={formatRupees(standard.ewFourthAndFifthYear)} />
        <Line label="Accessories kit" value={formatRupees(standard.accessoriesKit)} />
        <Line label="Essential accessories" value={formatRupees(standard.essentialAccessories)} />
        <Line label="RSA" value={formatRupees(standard.rsa)} />
        <Line label="FASTag" value={formatRupees(standard.fastag)} />
        <Line label="Registration (without hypothecation)" value={formatRupees(standard.registrationWithoutHypo)} />
        <Line label="On-road (without hypothecation)" value={formatRupees(standard.onRoadWithoutHypo)} />
        <Line label="Registration (with hypothecation)" value={formatRupees(standard.registrationWithHypo)} />
        <Line label="On-road (with hypothecation)" value={formatRupees(standard.onRoadWithHypo)} />
        <Line label="Hypothecation charge" value={formatRupees(standard.hypothecationCharge)} note={hypoNote} />
        <Line label="WEF date" value={standard.wefDate ?? '—'} />
        <Line label="Minimum booking amount" value={formatRupees(standard.minimumBookingAmount)} />
      </dl>
      <p className="price-masters__fine">
        On-road above has no extended warranty in it. At most one warranty option is added to the on-road price:
      </p>
      <div className="oem-masters__table-wrap">
        <table className="oem-masters__table">
          <thead>
            <tr>
              <th>Warranty option</th>
              <th>On-road (without hypothecation)</th>
              <th>On-road (with hypothecation)</th>
            </tr>
          </thead>
          <tbody>
            {EW_ROWS.map(({ key, label }) => (
              <tr key={key}>
                <td>{label}</td>
                <td>{formatRupees(standard.onRoadByEw[key]?.withoutHypo)}</td>
                <td>{formatRupees(standard.onRoadByEw[key]?.withHypo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {standard.insurance.options.length > 1 && (
        <>
          <p className="price-masters__fine">
            This vehicle has more than one insurance price; the booking form decides which applies:
          </p>
          <div className="oem-masters__table-wrap">
            <table className="oem-masters__table">
              <thead>
                <tr>
                  <th>Insurance</th>
                  <th>Amount</th>
                  <th>On-road (without hypothecation)</th>
                  <th>On-road (with hypothecation)</th>
                </tr>
              </thead>
              <tbody>
                {standard.insurance.options.map((option) => (
                  <tr key={option.skuCode}>
                    <td>{option.type === 'COMMERCIAL' ? 'Commercial' : option.type === 'PRIVATE' ? 'Private' : 'Standard'}</td>
                    <td>{formatRupees(option.amount)}</td>
                    <td>{formatRupees(option.onRoadWithoutHypo)}</td>
                    <td>{formatRupees(option.onRoadWithHypo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {standard.extraCharges.length > 0 && (
        <>
          <p className="price-masters__fine">Extra charges that can apply:</p>
          <dl className="price-masters__lines">
            {standard.extraCharges.map((charge) => (
              <Line key={charge.key} label={charge.label} value={formatRupees(charge.amount)} />
            ))}
          </dl>
        </>
      )}
    </div>
  );
}

function VehicleRow({ vehicle, open, onToggle }: { vehicle: PriceMasterVehicle; open: boolean; onToggle: () => void }) {
  const { sku, standard } = vehicle;
  return (
    <>
      <tr className="price-masters__row" onClick={onToggle}>
        <td>
          <button type="button" className="price-masters__toggle" aria-expanded={open} onClick={onToggle}>
            {open ? 'Hide' : 'Open'}
          </button>
        </td>
        <td>{sku.model}</td>
        <td>{sku.variant}</td>
        <td>{sku.trim ?? '—'}</td>
        <td>{[sku.fuel, sku.transmission].filter(Boolean).join(' · ') || '—'}</td>
        <td>{sku.seater ?? '—'}</td>
        <td className="price-masters__num">{formatRupees(standard.exShowroom)}</td>
        <td className="price-masters__num">{formatRupees(standard.onRoadWithoutHypo)}</td>
        <td>{standard.wefDate ?? '—'}</td>
      </tr>
      {open && (
        <tr>
          <td colSpan={9}>
            <StandardDetail standard={standard} />
          </td>
        </tr>
      )}
    </>
  );
}

const FILTER_FIELDS: { key: keyof PriceSheetFilters; label: string; placeholder: string }[] = [
  { key: 'model', label: 'Model', placeholder: 'e.g. Thar' },
  { key: 'trim', label: 'Trim', placeholder: 'e.g. AXT' },
  { key: 'variant', label: 'Variant', placeholder: 'e.g. D MT 2WD' },
  { key: 'fuel', label: 'Fuel', placeholder: 'Petrol, Diesel…' },
  { key: 'seater', label: 'Seating', placeholder: 'e.g. 7' },
];

export default function PriceMastersPage() {
  const project = usePriceMasterProject('browse');
  const [on, setOn] = useState(today);
  const [draft, setDraft] = useState<PriceSheetFilters>(EMPTY_PRICE_SHEET_FILTERS);
  const [applied, setApplied] = useState<PriceSheetFilters>(EMPTY_PRICE_SHEET_FILTERS);
  const [appliedOn, setAppliedOn] = useState(on);
  const [openSku, setOpenSku] = useState<string | null>(null);

  const sheet = useQuery({
    queryKey: ['price-sheet', project.tenantId, appliedOn, applied],
    enabled: Boolean(project.accessToken && project.tenantId && project.allowed),
    queryFn: () => fetchPriceSheet(project.tenantId, appliedOn, applied, project.accessToken),
  });

  if (!project.allowed) return <PriceMasterRedirect />;

  return (
    <section className="oem-masters-page" aria-labelledby="price-masters-title">
      <div className="oem-masters-page__heading">
        <div>
          <span className="oem-masters-page__eyebrow">Master data</span>
          <h1 id="price-masters-title">Price masters</h1>
          <p>
            Search the price list that applies on a date, by model, trim, variant, fuel or seating. Every vehicle
            is shown in the same standard format, whichever OEM it is.
          </p>
        </div>
      </div>

      {project.needsPicker && (
        <ProjectPicker
          projects={project.projects}
          value={project.tenantId}
          loading={project.projectsLoading}
          onChange={project.pick}
        />
      )}

      {project.tenantId && (
        <>
          <form
            className="price-masters__filters"
            onSubmit={(event) => {
              event.preventDefault();
              setApplied(draft);
              setAppliedOn(on);
              setOpenSku(null);
            }}
          >
            <label>
              Price on date
              <input type="date" value={on} onChange={(event) => setOn(event.target.value)} required />
            </label>
            {FILTER_FIELDS.map(({ key, label, placeholder }) => (
              <label key={key}>
                {label}
                <input
                  type="text"
                  value={draft[key]}
                  placeholder={placeholder}
                  onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
                />
              </label>
            ))}
            <div className="price-masters__filter-actions">
              <button type="submit" disabled={sheet.isFetching}>
                {sheet.isFetching ? 'Searching…' : 'Search'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraft(EMPTY_PRICE_SHEET_FILTERS);
                  setApplied(EMPTY_PRICE_SHEET_FILTERS);
                  setAppliedOn(on);
                  setOpenSku(null);
                }}
              >
                Clear
              </button>
            </div>
          </form>

          {sheet.isError && (
            <div className="oem-masters__list oem-masters__list--error" role="alert">
              {errorText(sheet.error)}
            </div>
          )}

          {sheet.data && !sheet.data.priceList && (
            <p className="oem-masters-page__empty">No price list is effective on {appliedOn}.</p>
          )}

          {sheet.data?.priceList && (
            <>
              <p className="price-masters__summary">
                Price list version {sheet.data.priceList.version ?? '—'}, effective from{' '}
                {sheet.data.priceList.effectiveFrom ?? '—'}
                {sheet.data.sourceFiles.length > 0 ? ` · loaded from ${sheet.data.sourceFiles.join(', ')}` : ''}
                {' · '}
                {sheet.data.total} {sheet.data.total === 1 ? 'vehicle' : 'vehicles'}
                {sheet.data.truncated ? ` (showing the first ${sheet.data.vehicles.length}; narrow the search)` : ''}
              </p>
              {sheet.data.vehicles.length === 0 ? (
                <p className="oem-masters-page__empty">No vehicle matches these words.</p>
              ) : (
                <div className="oem-masters__table-wrap">
                  <table className="oem-masters__table price-masters__table">
                    <thead>
                      <tr>
                        <th />
                        <th>Model</th>
                        <th>Variant</th>
                        <th>Trim</th>
                        <th>Fuel · transmission</th>
                        <th>Seating</th>
                        <th>Ex-showroom</th>
                        <th>On-road</th>
                        <th>WEF</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sheet.data.vehicles.map((vehicle) => (
                        <VehicleRow
                          key={vehicle.sku.skuCode}
                          vehicle={vehicle}
                          open={openSku === vehicle.sku.skuCode}
                          onToggle={() => setOpenSku(openSku === vehicle.sku.skuCode ? null : vehicle.sku.skuCode)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
