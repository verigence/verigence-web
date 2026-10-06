import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import {
  amountChange,
  buildCompareLines,
  defaultCompareDates,
  defaultWef,
  findVehicle,
  wefDates,
} from '../features/priceMasters/compare';
import {
  EMPTY_PRICE_SHEET_FILTERS,
  fetchPriceModels,
  fetchPriceSheet,
  fetchPriceVersions,
  formatRupees,
  type PriceMasterVehicle,
  type PriceVersion,
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

const dateFormat = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

function formatWef(date: string): string {
  if (!date) return '—';
  const parsed = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? date : dateFormat.format(parsed);
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

function describe(vehicle: PriceMasterVehicle): string {
  const { sku } = vehicle;
  return [sku.model, sku.variant, sku.trim, [sku.fuel, sku.transmission].filter(Boolean).join(' · '), sku.seater && `${sku.seater} seater`]
    .filter(Boolean)
    .join(' · ');
}

export default function PriceMastersPage() {
  const project = usePriceMasterProject('browse');
  const enabled = Boolean(project.accessToken && project.tenantId && project.allowed);

  const versionsQuery = useQuery({
    queryKey: ['price-versions', project.tenantId],
    enabled,
    queryFn: () => fetchPriceVersions(project.tenantId, project.accessToken),
  });
  const dates = useMemo(() => wefDates(versionsQuery.data?.versions ?? []), [versionsQuery.data]);

  const [pickedWef, setPickedWef] = useState('');
  const wef = pickedWef && dates.some((d) => d.effectiveFrom === pickedWef) ? pickedWef : defaultWef(dates, today());
  const [pickedCompare, setPickedCompare] = useState<{ for: string; a?: string; b?: string }>({ for: '' });
  const defaults = defaultCompareDates(dates, wef);
  const compareA = pickedCompare.for === wef && pickedCompare.a !== undefined ? pickedCompare.a : defaults[0];
  const compareB = pickedCompare.for === wef && pickedCompare.b !== undefined ? pickedCompare.b : defaults[1];

  const [model, setModel] = useState('');
  const [skuCode, setSkuCode] = useState('');
  const [variantFilter, setVariantFilter] = useState('');

  const modelsQuery = useQuery({
    queryKey: ['price-models', project.tenantId, wef],
    enabled: enabled && Boolean(wef),
    queryFn: () => fetchPriceModels(project.tenantId, wef, project.accessToken),
  });
  const sheetFor = (date: string, on: boolean) => ({
    queryKey: ['price-sheet', project.tenantId, date, model],
    enabled: enabled && Boolean(date) && Boolean(model) && on,
    queryFn: () => fetchPriceSheet(project.tenantId, date, { ...EMPTY_PRICE_SHEET_FILTERS, model }, project.accessToken),
  });
  const sheet = useQuery(sheetFor(wef, true));
  const sheetA = useQuery(sheetFor(compareA, Boolean(skuCode)));
  const sheetB = useQuery(sheetFor(compareB, Boolean(skuCode)));

  if (!project.allowed) return <PriceMasterRedirect />;

  const versionOn = (date: string): PriceVersion | undefined => dates.find((d) => d.effectiveFrom === date);
  const vehicles = sheet.data?.vehicles ?? [];
  const shown = variantFilter.trim()
    ? vehicles.filter((v) => `${v.sku.variant} ${v.sku.trim ?? ''}`.toLowerCase().includes(variantFilter.trim().toLowerCase()))
    : vehicles;
  const selected = vehicles.find((v) => v.sku.skuCode === skuCode) ?? null;

  const columns = [
    { date: wef, vehicle: selected, loading: sheet.isLoading, error: sheet.error },
    ...(compareA ? [{ date: compareA, vehicle: findVehicle(sheetA.data?.vehicles ?? [], skuCode), loading: sheetA.isLoading, error: sheetA.error }] : []),
    ...(compareB ? [{ date: compareB, vehicle: findVehicle(sheetB.data?.vehicles ?? [], skuCode), loading: sheetB.isLoading, error: sheetB.error }] : []),
  ];
  const lines = selected ? buildCompareLines(columns.map((c) => c.vehicle?.standard ?? null)) : [];
  const otherDates = dates.filter((d) => d.effectiveFrom !== wef);

  const chooseWef = (date: string) => {
    setPickedWef(date);
    setModel('');
    setSkuCode('');
    setVariantFilter('');
  };

  return (
    <section className="oem-masters-page price-masters" aria-labelledby="price-masters-title">
      <div className="oem-masters-page__heading">
        <div>
          <span className="oem-masters-page__eyebrow">Master data</span>
          <h1 id="price-masters-title">Price masters</h1>
          <p>
            Pick a WEF date, then the model and the variant. You get the complete price in the standard format, and you can
            put it next to the same vehicle on two other WEF dates.
          </p>
        </div>
      </div>

      {project.needsPicker && (
        <ProjectPicker projects={project.projects} value={project.tenantId} loading={project.projectsLoading} onChange={project.pick} />
      )}

      {project.tenantId && (
        <>
          <section className="price-masters__step" aria-labelledby="pm-step-wef">
            <h2 id="pm-step-wef">1. WEF date</h2>
            {versionsQuery.isLoading && <p className="price-masters__fine">Loading the WEF dates…</p>}
            {versionsQuery.isError && (
              <div className="oem-masters__list oem-masters__list--error" role="alert">{errorText(versionsQuery.error)}</div>
            )}
            {versionsQuery.data && dates.length === 0 && (
              <p className="oem-masters-page__empty">No price list has been uploaded for this project yet.</p>
            )}
            <div className="price-masters__chips" role="group" aria-label="WEF dates">
              {dates.map((d) => (
                <button
                  key={d.effectiveFrom}
                  type="button"
                  className="price-masters__chip"
                  aria-pressed={d.effectiveFrom === wef}
                  onClick={() => chooseWef(d.effectiveFrom)}
                >
                  <strong>{formatWef(d.effectiveFrom)}</strong>
                  <small>{d.priceList ?? 'Price list'}{d.version ? ` · v${d.version}` : ''}</small>
                </button>
              ))}
            </div>
          </section>

          {wef && (
            <section className="price-masters__step" aria-labelledby="pm-step-model">
              <h2 id="pm-step-model">2. Model</h2>
              {modelsQuery.isLoading && <p className="price-masters__fine">Loading the models…</p>}
              {modelsQuery.isError && (
                <div className="oem-masters__list oem-masters__list--error" role="alert">{errorText(modelsQuery.error)}</div>
              )}
              {modelsQuery.data && modelsQuery.data.models.length === 0 && (
                <p className="oem-masters-page__empty">No model is priced on {formatWef(wef)}.</p>
              )}
              <div className="price-masters__chips" role="group" aria-label="Models">
                {(modelsQuery.data?.models ?? []).map((m) => (
                  <button
                    key={m.modelId}
                    type="button"
                    className="price-masters__chip"
                    aria-pressed={m.model === model}
                    onClick={() => {
                      setModel(m.model);
                      setSkuCode('');
                      setVariantFilter('');
                    }}
                  >
                    <strong>{m.model}</strong>
                  </button>
                ))}
              </div>
            </section>
          )}

          {model && (
            <section className="price-masters__step" aria-labelledby="pm-step-variant">
              <h2 id="pm-step-variant">3. Variant and trim</h2>
              {sheet.isLoading && <p className="price-masters__fine">Loading the variants…</p>}
              {sheet.isError && (
                <div className="oem-masters__list oem-masters__list--error" role="alert">{errorText(sheet.error)}</div>
              )}
              {sheet.data && (
                <>
                  <p className="price-masters__summary">
                    {sheet.data.total} {sheet.data.total === 1 ? 'vehicle' : 'vehicles'} on the {formatWef(wef)} price list
                    {sheet.data.sourceFiles.length > 0 ? ` · loaded from ${sheet.data.sourceFiles.join(', ')}` : ''}
                    {sheet.data.truncated ? ` (showing the first ${sheet.data.vehicles.length})` : ''}
                  </p>
                  {vehicles.length > 8 && (
                    <label className="price-masters__find">
                      Find a variant or trim
                      <input type="text" value={variantFilter} onChange={(event) => setVariantFilter(event.target.value)} placeholder="e.g. AX7" />
                    </label>
                  )}
                  <div className="oem-masters__table-wrap">
                    <table className="oem-masters__table price-masters__table">
                      <thead>
                        <tr>
                          <th>Variant</th>
                          <th>Trim</th>
                          <th>Fuel · transmission</th>
                          <th>Seating</th>
                          <th>Ex-showroom</th>
                          <th>On-road</th>
                        </tr>
                      </thead>
                      <tbody>
                        {shown.map((v) => (
                          <tr
                            key={v.sku.skuCode}
                            className={`price-masters__row${v.sku.skuCode === skuCode ? ' is-selected' : ''}`}
                            onClick={() => setSkuCode(v.sku.skuCode)}
                          >
                            <td>
                              <button
                                type="button"
                                className="price-masters__toggle"
                                aria-pressed={v.sku.skuCode === skuCode}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setSkuCode(v.sku.skuCode);
                                }}
                              >
                                {v.sku.variant}
                              </button>
                            </td>
                            <td>{v.sku.trim ?? '—'}</td>
                            <td>{[v.sku.fuel, v.sku.transmission].filter(Boolean).join(' · ') || '—'}</td>
                            <td>{v.sku.seater ?? '—'}</td>
                            <td className="price-masters__num">{formatRupees(v.standard.exShowroom)}</td>
                            <td className="price-masters__num">{formatRupees(v.standard.onRoadWithoutHypo)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {shown.length === 0 && <p className="oem-masters-page__empty">No variant matches those words.</p>}
                </>
              )}
            </section>
          )}

          {selected && (
            <section className="price-masters__step" aria-labelledby="pm-step-price">
              <h2 id="pm-step-price">Complete price</h2>
              <p className="price-masters__summary">{describe(selected)}</p>
              <div className="price-masters__compare-pick">
                <span>Compare with</span>
                {([['a', compareA], ['b', compareB]] as const).map(([which, value]) => (
                  <label key={which}>
                    <span className="price-masters__visually-hidden">Compare with WEF date {which === 'a' ? 1 : 2}</span>
                    <select
                      value={value}
                      onChange={(event) =>
                        setPickedCompare({
                          for: wef,
                          a: which === 'a' ? event.target.value : compareA,
                          b: which === 'b' ? event.target.value : compareB,
                        })
                      }
                    >
                      <option value="">Nothing</option>
                      {otherDates.map((d) => (
                        <option key={d.effectiveFrom} value={d.effectiveFrom}>{formatWef(d.effectiveFrom)}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <div className="oem-masters__table-wrap">
                <table className="oem-masters__table price-masters__compare">
                  <thead>
                    <tr>
                      <th>Price line</th>
                      {columns.map((c, index) => (
                        <th key={`${c.date}-${index}`} className="price-masters__num">
                          {formatWef(c.date)}
                          <small>{index === 0 ? 'selected' : 'compared'}</small>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => (
                      <tr key={line.key} className={line.emphasis ? 'price-masters__total' : undefined}>
                        <th scope="row">{line.label}</th>
                        {line.values.map((value, index) => {
                          const change = index === 0 ? null : amountChange(line.values[0], value);
                          const column = columns[index];
                          return (
                            <td key={`${line.key}-${index}`} className="price-masters__num">
                              {column.loading ? '…' : value === null && !column.vehicle && index > 0 ? 'not on this list' : formatRupees(value)}
                              {change && change.kind !== 'unknown' && change.kind !== 'same' && (
                                <small className={`price-masters__delta price-masters__delta--${change.kind}`}>{change.text}</small>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="price-masters__fine">
                On-road has no extended warranty in it; at most one warranty option is added, as the rows above show.
                {selected.standard.hypothecationSource === 'VERSION_DEFAULT'
                  ? ' The hypothecation charge is not on this vehicle’s sheet; the price list’s usual charge is used.'
                  : ''}
                {columns.slice(1).some((c) => c.error) ? ' One of the compared dates could not be loaded.' : ''}
              </p>
              {selected.standard.insurance.options.length > 1 && (
                <>
                  <p className="price-masters__fine">This vehicle has more than one insurance price; the booking form decides which applies:</p>
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
                        {selected.standard.insurance.options.map((option) => (
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
              {columns.map((c, index) => {
                const files = versionOn(c.date)?.sourceFiles ?? [];
                return files.length > 0 ? (
                  <p key={`${c.date}-files-${index}`} className="price-masters__fine">{formatWef(c.date)} loaded from {files.join(', ')}</p>
                ) : null;
              })}
            </section>
          )}
        </>
      )}
    </section>
  );
}
