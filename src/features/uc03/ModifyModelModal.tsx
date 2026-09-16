import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import {
  getModelCatalog,
  proposeModelSelectionCorrection,
  type ModelCatalogSku,
} from '../../services/audit-core/uc03ModelResolution';
// Shared success/empty/error message-box classes (uc03-jd-success etc.) --
// deliberately reused rather than duplicated.
import '../../styles/uc03-journey-documents.css';
import '../../styles/uc03-modify-model-modal.css';

function readable(value: string | null): string {
  return value ? value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : '—';
}

function formatMoney(amount: string | null): string {
  if (!amount) return '—';
  const value = Number(amount);
  if (Number.isNaN(value)) return amount;
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function distinctValues(skus: ModelCatalogSku[], pick: (sku: ModelCatalogSku) => string | null): string[] {
  return [...new Set(skus.map(pick).filter((value): value is string => Boolean(value)))].sort();
}

/**
 * A simple, single popup for the whole "propose a different vehicle" job --
 * deliberately not a heavy inline section on the page itself. Six dropdowns
 * (Model, Fuel, Transmission, Drive, Seater, Variant), each narrowing the
 * next from the tenant's own currently effective price list, resolving to
 * one exact SKU; a required reason; Save proposes it. What actually happens
 * next (a Team Lead reviewing and applying/rejecting it) lives entirely on
 * the ordinary Task Queue -- this popup's only job is to raise that.
 */
export default function ModifyModelModal({
  tenantId,
  journeyId,
  accessToken,
  onClose,
  onProposed,
}: {
  tenantId: string;
  journeyId: string;
  accessToken?: string;
  onClose: () => void;
  onProposed: () => void;
}) {
  const [model, setModel] = useState('');
  const [fuel, setFuel] = useState('');
  const [transmission, setTransmission] = useState('');
  const [drive, setDrive] = useState('');
  const [seater, setSeater] = useState('');
  const [variantKey, setVariantKey] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<string>();

  const query = useQuery({
    queryKey: ['uc03-model-catalog', tenantId, journeyId],
    queryFn: () => getModelCatalog(tenantId, journeyId, accessToken),
    enabled: Boolean(tenantId && journeyId && accessToken),
    retry: false,
    refetchOnWindowFocus: false,
  });

  const skus = query.data?.skus ?? [];
  const afterModel = model ? skus.filter((s) => s.modelName === model) : skus;
  const afterFuel = fuel ? afterModel.filter((s) => s.fuel === fuel) : afterModel;
  const afterTransmission = transmission ? afterFuel.filter((s) => s.transmission === transmission) : afterFuel;
  const afterDrive = drive ? afterTransmission.filter((s) => s.drive === drive) : afterTransmission;
  const afterSeater = seater ? afterDrive.filter((s) => s.seater === seater) : afterDrive;

  const models = useMemo(() => [...new Set(skus.map((s) => s.modelName))].sort(), [skus]);
  const fuels = useMemo(() => distinctValues(afterModel, (s) => s.fuel), [afterModel]);
  const transmissions = useMemo(() => distinctValues(afterFuel, (s) => s.transmission), [afterFuel]);
  const drives = useMemo(() => distinctValues(afterTransmission, (s) => s.drive), [afterTransmission]);
  const seaters = useMemo(() => distinctValues(afterDrive, (s) => s.seater), [afterDrive]);
  // Model/fuel/transmission/drive/seater narrow this far; whatever's left
  // differs only by trim/colour -- the master's own variant name (which
  // already encodes trim) is the final pick, not a made-up 7th field
  // nothing in the masters actually stores separately.
  const variantOptions = useMemo(
    () => afterSeater.map((s) => ({ key: `${s.variantName ?? ''}|${s.colourName ?? ''}`, sku: s })),
    [afterSeater],
  );
  const selectedSku = variantOptions.find((option) => option.key === variantKey)?.sku
    ?? (afterSeater.length === 1 ? afterSeater[0] : undefined);

  const resetBelow = (level: 'model' | 'fuel' | 'transmission' | 'drive' | 'seater') => {
    if (level === 'model') { setFuel(''); setTransmission(''); setDrive(''); setSeater(''); setVariantKey(''); }
    if (level === 'fuel') { setTransmission(''); setDrive(''); setSeater(''); setVariantKey(''); }
    if (level === 'transmission') { setDrive(''); setSeater(''); setVariantKey(''); }
    if (level === 'drive') { setSeater(''); setVariantKey(''); }
    if (level === 'seater') { setVariantKey(''); }
  };

  const submit = async () => {
    if (!selectedSku || !reason.trim()) return;
    setBusy(true);
    setError(undefined);
    try {
      await proposeModelSelectionCorrection(
        tenantId,
        journeyId,
        { productSkuId: selectedSku.productSkuId, reason: reason.trim() },
        accessToken,
      );
      setDone(`Proposed ${selectedSku.modelName}${selectedSku.variantName ? ` ${selectedSku.variantName}` : ''} — a Team Lead task has been raised to review and apply it.`);
      onProposed();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'This correction could not be proposed. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="uc03-mm-backdrop" role="presentation" onClick={onClose}>
      <div className="uc03-mm-modal" role="dialog" aria-modal="true" aria-label="Modify vehicle model" onClick={(event) => event.stopPropagation()}>
        <header className="uc03-mm-modal__header">
          <h3>Modify vehicle model</h3>
          <button type="button" className="uc03-mm-modal__close" onClick={onClose} aria-label="Close">×</button>
        </header>

        {done ? (
          <div className="uc03-mm-modal__body">
            <div className="uc03-jd-success" role="status">{done}</div>
            <div className="uc03-mm-actions">
              <button type="button" className="uc03-c3-primary" onClick={onClose}>Done</button>
            </div>
          </div>
        ) : query.isPending ? (
          <div className="uc03-mm-modal__body"><p className="uc03-jd-empty">Loading the price masters…</p></div>
        ) : query.isError || !skus.length ? (
          <div className="uc03-mm-modal__body"><p className="uc03-jd-empty">No price masters are available to pick a vehicle from.</p></div>
        ) : (
          <div className="uc03-mm-modal__body">
            <p className="uc03-mm-intro">Pick the correct vehicle from the current price masters, then save. A Team Lead will review and apply the change.</p>
            <div className="uc03-mm-fields">
              <label>
                Model
                <select value={model} onChange={(event) => { setModel(event.target.value); resetBelow('model'); }}>
                  <option value="">Select model…</option>
                  {models.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <label>
                Fuel
                <select value={fuel} onChange={(event) => { setFuel(event.target.value); resetBelow('fuel'); }} disabled={!model}>
                  <option value="">Select fuel…</option>
                  {fuels.map((value) => <option key={value} value={value}>{readable(value)}</option>)}
                </select>
              </label>
              <label>
                Transmission
                <select value={transmission} onChange={(event) => { setTransmission(event.target.value); resetBelow('transmission'); }} disabled={!fuel}>
                  <option value="">Select transmission…</option>
                  {transmissions.map((value) => <option key={value} value={value}>{readable(value)}</option>)}
                </select>
              </label>
              <label>
                Drive
                <select value={drive} onChange={(event) => { setDrive(event.target.value); resetBelow('drive'); }} disabled={!transmission}>
                  <option value="">Select drive…</option>
                  {drives.map((value) => <option key={value} value={value}>{readable(value)}</option>)}
                </select>
              </label>
              <label>
                Seater
                <select value={seater} onChange={(event) => { setSeater(event.target.value); resetBelow('seater'); }} disabled={!drive}>
                  <option value="">Select seater…</option>
                  {seaters.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <label>
                Variant
                <select value={variantKey} onChange={(event) => setVariantKey(event.target.value)} disabled={!seater && variantOptions.length !== 1}>
                  <option value="">{variantOptions.length ? 'Select variant…' : 'Narrow the fields above first'}</option>
                  {variantOptions.map(({ key, sku }) => (
                    <option key={key} value={key}>{sku.variantName}{sku.colourName ? ` (${sku.colourName})` : ''} — {sku.skuCode}</option>
                  ))}
                </select>
              </label>
            </div>

            {selectedSku ? (
              <div className="uc03-mm-selected">
                <strong>{selectedSku.modelName} {selectedSku.variantName}</strong>
                {selectedSku.colourName ? <span>{selectedSku.colourName}</span> : null}
                <span>Ex-showroom {formatMoney(selectedSku.exShowroomPrice)}</span>
                {selectedSku.totalPrice ? <span>On-road {formatMoney(selectedSku.totalPrice)}</span> : null}
              </div>
            ) : null}

            <label className="uc03-mm-reason">
              Reason — why is the current vehicle wrong?
              <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} required />
            </label>

            {error ? <div className="uc03-jd-error" role="alert">{error}</div> : null}

            <div className="uc03-mm-actions">
              <button type="button" onClick={onClose} disabled={busy}>Cancel</button>
              <button type="button" className="uc03-c3-primary" disabled={busy || !selectedSku || !reason.trim()} onClick={() => void submit()}>
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
