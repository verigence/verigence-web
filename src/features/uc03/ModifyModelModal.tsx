import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import {
  confirmModelResolutionSku,
  getModelCatalog,
  proposeModelSelectionCorrection,
  type ModelCatalogSku,
} from '../../services/audit-core/uc03ModelResolution';
import { recheckP2Journey } from '../../services/audit-core/uc03P2';
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
 * deliberately not a heavy inline section on the page itself. Seven dropdowns
 * (Model, Trim, Fuel, Transmission, Drive, Seater, Variant), each narrowing
 * the next from the tenant's own currently effective price list, resolving
 * to one exact SKU; a required reason; Save proposes it. Trim (e.g. Z4, Z8 S,
 * Z8T on the same model) is the masters' own column, distinct from Variant
 * (the full descriptive string) -- several different trims routinely share
 * an identical fuel/transmission/drive/seater combination, so without Trim
 * as its own step the Variant list mixed unrelated trims together with no
 * way to narrow to the right one first. What actually happens next (a Team
 * Lead reviewing and applying/rejecting it) lives entirely on the ordinary
 * Task Queue -- this popup's only job is to raise that.
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
  const [trim, setTrim] = useState('');
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
  // No confirmed SKU yet: the pick sets the vehicle directly (Resolve SKU).
  // A confirmed SKU changes only through a Team Lead reviewed proposal.
  // Found live 2026-10-20: this popup always proposed a correction, which
  // Audit Core refuses for a journey with no confirmed SKU -- so "Resolve
  // SKU" could never resolve the journeys that needed it.
  // (An older Audit Core does not report it: keep proposing, as before.)
  const direct = Boolean(query.data && 'confirmedProductSkuId' in query.data && !query.data.confirmedProductSkuId);
  const afterModel = model ? skus.filter((s) => s.modelName === model) : skus;
  const afterTrim = trim ? afterModel.filter((s) => s.trim === trim) : afterModel;
  const afterFuel = fuel ? afterTrim.filter((s) => s.fuel === fuel) : afterTrim;
  const afterTransmission = transmission ? afterFuel.filter((s) => s.transmission === transmission) : afterFuel;
  const afterDrive = drive ? afterTransmission.filter((s) => s.drive === drive) : afterTransmission;
  const afterSeater = seater ? afterDrive.filter((s) => s.seater === seater) : afterDrive;

  const models = useMemo(() => [...new Set(skus.map((s) => s.modelName))].sort(), [skus]);
  // Trim (e.g. Z4, Z8 S, Z8T) is the masters' own column -- distinct SKUs on
  // the same model routinely share every other structured attribute, so
  // this has to narrow before fuel/transmission/drive/seater can mean
  // anything, not after.
  const trims = useMemo(() => distinctValues(afterModel, (s) => s.trim), [afterModel]);
  const fuels = useMemo(() => distinctValues(afterTrim, (s) => s.fuel), [afterTrim]);
  const transmissions = useMemo(() => distinctValues(afterFuel, (s) => s.transmission), [afterFuel]);
  const drives = useMemo(() => distinctValues(afterTransmission, (s) => s.drive), [afterTransmission]);
  const seaters = useMemo(() => distinctValues(afterDrive, (s) => s.seater), [afterDrive]);
  // Whatever's left after trim/fuel/transmission/drive/seater differs only
  // by colour -- the master's own variant name is the final pick.
  const variantOptions = useMemo(
    () => afterSeater.map((s) => ({ key: `${s.variantName ?? ''}|${s.colourName ?? ''}`, sku: s })),
    [afterSeater],
  );
  const selectedSku = variantOptions.find((option) => option.key === variantKey)?.sku
    ?? (afterSeater.length === 1 ? afterSeater[0] : undefined);

  const resetBelow = (level: 'model' | 'trim' | 'fuel' | 'transmission' | 'drive' | 'seater') => {
    if (level === 'model') { setTrim(''); setFuel(''); setTransmission(''); setDrive(''); setSeater(''); setVariantKey(''); }
    if (level === 'trim') { setFuel(''); setTransmission(''); setDrive(''); setSeater(''); setVariantKey(''); }
    if (level === 'fuel') { setTransmission(''); setDrive(''); setSeater(''); setVariantKey(''); }
    if (level === 'transmission') { setDrive(''); setSeater(''); setVariantKey(''); }
    if (level === 'drive') { setSeater(''); setVariantKey(''); }
    if (level === 'seater') { setVariantKey(''); }
  };

  const submit = async () => {
    if (!selectedSku || (!direct && !reason.trim())) return;
    setBusy(true);
    setError(undefined);
    try {
      if (direct) {
        await confirmModelResolutionSku(tenantId, journeyId, selectedSku.productSkuId, accessToken);
        // The deal is re-priced and the checks run again with the new vehicle.
        await recheckP2Journey(tenantId, journeyId, accessToken).catch(() => undefined);
        setDone(`Vehicle set to ${selectedSku.modelName}${selectedSku.variantName ? ` ${selectedSku.variantName}` : ''}. The deal is re-priced and the checks run again.`);
        onProposed();
        return;
      }
      await proposeModelSelectionCorrection(
        tenantId,
        journeyId,
        { productSkuId: selectedSku.productSkuId, reason: reason.trim() },
        accessToken,
      );
      setDone(`Proposed ${selectedSku.modelName}${selectedSku.variantName ? ` ${selectedSku.variantName}` : ''} — a Team Lead task has been raised to review and apply it.`);
      onProposed();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : direct ? 'The vehicle could not be set. Try again.' : 'This correction could not be proposed. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="uc03-mm-backdrop" role="presentation" onClick={onClose}>
      <div className="uc03-mm-modal" role="dialog" aria-modal="true" aria-label={direct ? 'Resolve SKU' : 'Modify vehicle model'} onClick={(event) => event.stopPropagation()}>
        <header className="uc03-mm-modal__header">
          <h3>{direct ? 'Resolve SKU' : 'Modify vehicle model'}</h3>
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
            <p className="uc03-mm-intro">{direct
              ? 'No SKU is set for this journey yet. Pick the vehicle from the current price masters, then save; it is set straight away.'
              : 'Pick the correct vehicle from the current price masters, then save. A Team Lead will review and apply the change.'}</p>
            <div className="uc03-mm-fields">
              <label>
                Model
                <select value={model} onChange={(event) => { setModel(event.target.value); resetBelow('model'); }}>
                  <option value="">Select model…</option>
                  {models.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <label>
                Trim
                <select value={trim} onChange={(event) => { setTrim(event.target.value); resetBelow('trim'); }} disabled={!model}>
                  <option value="">{trims.length ? 'Select trim…' : 'No trim on this model'}</option>
                  {trims.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <label>
                Fuel
                <select value={fuel} onChange={(event) => { setFuel(event.target.value); resetBelow('fuel'); }} disabled={!model || (trims.length > 0 && !trim)}>
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

            {direct ? null : (
              <label className="uc03-mm-reason">
                Reason — why is the current vehicle wrong?
                <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} required />
              </label>
            )}

            {error ? <div className="uc03-jd-error" role="alert">{error}</div> : null}

            <div className="uc03-mm-actions">
              <button type="button" onClick={onClose} disabled={busy}>Cancel</button>
              <button type="button" className="uc03-c3-primary" disabled={busy || !selectedSku || (!direct && !reason.trim())} onClick={() => void submit()}>
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
