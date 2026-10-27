import { useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import SectionCard from '../../../components/SectionCard';
import {
  answerGatePass, getGatePassOutlets, gatePassErrorText, submitGatePassCounts, uploadGatePass,
  type GatePass, type GatePassCountsResult, type GatePassOutlet,
} from '../../../services/audit-core/uc03GatePass';
import { captureEvidencePhoto } from '../../../services/device/camera';
import { getMyDisplayName } from '../../../services/security/profile';

type Step = 'outlet' | 'day' | 'photo' | 'counts' | 'explain' | 'held' | 'done';

type Props = { tenantId: string; accessToken: string; onChanged: () => void };

/** The photo comes from the camera on the mobile app and from a file on the web. */
async function nativePhoto(): Promise<{ blob: Blob; filename: string }> {
  const photo = await captureEvidencePhoto();
  if (!photo.webPath) throw new Error('The photo could not be read. Please take it again.');
  const blob = await (await fetch(photo.webPath)).blob();
  return { blob, filename: `gate-pass.${photo.format || 'jpg'}` };
}

const num = (value: string) => (value.trim() === '' ? NaN : Number(value));
const validCount = (value: string) => Number.isInteger(num(value)) && num(value) >= 0 && num(value) <= 999;

/** PC: upload today's gate pass, say what the day held, and see whether it agrees with the delivery files. */
export default function GatePassWizard({ tenantId, accessToken, onChanged }: Props) {
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const outletsQuery = useQuery({
    queryKey: ['gate-pass-outlets', tenantId],
    queryFn: () => getGatePassOutlets(tenantId, accessToken),
    staleTime: 60_000,
  });
  const outlets = outletsQuery.data?.outlets ?? [];
  const defaultOutlet = outlets.find((o) => o.outletId === outletsQuery.data?.defaultOutletId) ?? outlets[0];

  const [step, setStep] = useState<Step>('outlet');
  const [confirmedDefault, setConfirmedDefault] = useState<boolean | null>(null);
  const [chosenId, setChosenId] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gatePass, setGatePass] = useState<GatePass | null>(null);
  const [result, setResult] = useState<GatePassCountsResult | null>(null);
  const [counts, setCounts] = useState({ newDeliveries: '', stockTransfers: '', testDrives: '', otherCount: '', otherNote: '' });
  const [pastDeliveries, setPastDeliveries] = useState('');
  const [outcome, setOutcome] = useState<string | null>(null);
  // The day the photo is for: today unless the PC says it is the previous day's (2026-10-27).
  const [forDate, setForDate] = useState<string | null>(null);
  const today = outletsQuery.data?.today ?? null;
  const previous = outletsQuery.data?.previous ?? null;
  const dayOf = (date: string | null) => [today, previous].find((d) => d?.date === date) ?? null;

  const selected: GatePassOutlet | undefined = outlets.length === 1
    ? outlets[0]
    : confirmedDefault === false ? outlets.find((o) => o.outletId === chosenId) : defaultOutlet;
  const outletReady = outlets.length === 1 || confirmedDefault === true || (confirmedDefault === false && Boolean(chosenId));
  const chosenDay = gatePass?.dayLabel ?? dayOf(forDate)?.label ?? today?.label ?? previous?.label ?? outletsQuery.data?.businessDate;
  const dayWords = forDate && forDate !== today?.date ? `for ${chosenDay}` : 'today';

  /** Ask which day only when the outlet still owes the previous day's gate pass. */
  function afterOutlet() {
    const owesPrevious = Boolean(selected && previous && outletsQuery.data?.previousOpenOutletIds?.includes(selected.outletId));
    if (today && owesPrevious) {
      setForDate(null);
      setStep('day');
      return;
    }
    setForDate(today?.date ?? previous?.date ?? null);
    setStep('photo');
  }

  async function sendPhoto(blob: Blob, filename: string) {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const pcName = await queryClient.fetchQuery({
        queryKey: ['my-display-name'], queryFn: async () => (await getMyDisplayName(accessToken)) ?? null, staleTime: 5 * 60_000,
      });
      const saved = await uploadGatePass(tenantId, {
        outletId: selected.outletId, pcName: pcName ?? undefined, businessDate: forDate ?? undefined, file: blob, filename,
      }, accessToken);
      setGatePass(saved);
      setStep('counts');
      onChanged();
    } catch (cause) {
      setError(gatePassErrorText(cause, 'The gate pass could not be uploaded. Please try again.'));
    } finally {
      setBusy(false);
    }
  }

  async function takePhoto() {
    setError(null);
    try {
      const { blob, filename } = await nativePhoto();
      await sendPhoto(blob, filename);
    } catch (cause) {
      // Closing the camera is not an error worth showing.
      if (cause instanceof Error && /cancel/i.test(cause.message)) return;
      setError(gatePassErrorText(cause, 'The photo could not be taken. Please try again.'));
    }
  }

  async function onFile(file: File | undefined) {
    if (fileInput.current) fileInput.current.value = '';
    if (file) await sendPhoto(file, file.name);
  }

  const countsValid = validCount(counts.newDeliveries) && validCount(counts.stockTransfers)
    && validCount(counts.testDrives) && validCount(counts.otherCount)
    && (num(counts.otherCount) === 0 || counts.otherNote.trim().length > 0);

  async function sendCounts() {
    if (!gatePass) return;
    setBusy(true);
    setError(null);
    try {
      const res = await submitGatePassCounts(tenantId, gatePass.gatePassId, {
        newDeliveries: num(counts.newDeliveries), stockTransfers: num(counts.stockTransfers),
        testDrives: num(counts.testDrives), otherCount: num(counts.otherCount),
        otherNote: counts.otherNote.trim() || undefined,
      }, accessToken);
      setResult(res);
      setGatePass(res.gatePass);
      onChanged();
      if (res.nextStep === 'DONE') {
        setOutcome('No divergence found. The delivery files match what you reported, and you are good to finish the task.');
        setStep('done');
      } else {
        setStep(res.nextStep === 'EXPLAIN_EXTRA_FILES' ? 'explain' : 'held');
      }
    } catch (cause) {
      setError(gatePassErrorText(cause, 'The numbers could not be saved. Please try again.'));
    } finally {
      setBusy(false);
    }
  }

  async function sendAnswer(answer: { pastDeliveries?: string; filesHeld?: boolean }) {
    if (!gatePass) return;
    setBusy(true);
    setError(null);
    try {
      const res = await answerGatePass(tenantId, gatePass.gatePassId, answer, accessToken);
      setGatePass(res.gatePass);
      setOutcome(res.taskRaised
        ? 'Noted. A high-priority task "Delivery not notified to PC" has been raised for your Team Lead.'
        : 'Noted. Thank you, the task is complete.');
      setStep('done');
      onChanged();
    } catch (cause) {
      setError(gatePassErrorText(cause, 'Your answer could not be saved. Please try again.'));
    } finally {
      setBusy(false);
    }
  }

  function startAgain() {
    setStep('outlet'); setConfirmedDefault(null); setChosenId(''); setGatePass(null); setResult(null);
    setCounts({ newDeliveries: '', stockTransfers: '', testDrives: '', otherCount: '', otherNote: '' });
    setPastDeliveries(''); setOutcome(null); setError(null); setForDate(null);
  }

  if (outletsQuery.isLoading) return <SectionCard><p className="p2w-muted">Loading…</p></SectionCard>;
  if (outletsQuery.isError || !outlets.length) {
    return (
      <SectionCard>
        <div className="p2w-alert p2w-alert--error" role="alert">
          {outletsQuery.isError
            ? gatePassErrorText(outletsQuery.error, 'Your outlets could not be loaded.')
            : 'No outlet is mapped to you, so a gate pass cannot be uploaded. Please ask your Team Lead.'}
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard>
      <div className="p2w-card__title">
        <h3>Gate pass for {chosenDay}</h3>
        <p className="p2w-muted">
          {selected && step !== 'outlet' ? selected.outletName : null}
          {(gatePass?.coversDates ?? dayOf(forDate)?.coversDates ?? today?.coversDates ?? []).length > 1
            ? `${selected && step !== 'outlet' ? ' · ' : ''}Sunday is off: one photo of the gate pass for Sunday and Monday, with the counts of both days together.`
            : null}
        </p>
      </div>

      {error ? <div className="p2w-alert p2w-alert--error" role="alert">{error}</div> : null}

      {!today && previous && step === 'outlet' ? (
        <div className="p2w-alert" role="status">
          Sunday is off: Sunday’s gate pass goes with Monday’s, one photo for both days. You can still upload the gate pass for {previous.label} here.
        </div>
      ) : null}

      {step === 'outlet' ? (
        <div className="p2gp-step">
          {outlets.length > 1 && defaultOutlet ? (
            <>
              <p><strong>Is this gate pass for {defaultOutlet.outletName}?</strong></p>
              <div className="p2gp-actions">
                <button type="button" className={`p2w-button ${confirmedDefault === true ? 'p2w-button--primary' : 'p2w-button--secondary'}`} onClick={() => setConfirmedDefault(true)}>Yes</button>
                <button type="button" className={`p2w-button ${confirmedDefault === false ? 'p2w-button--primary' : 'p2w-button--secondary'}`} onClick={() => setConfirmedDefault(false)}>No</button>
              </div>
              {confirmedDefault === false ? (
                <fieldset className="p2w-start__outlets">
                  <legend>Which outlet is it for?</legend>
                  {outlets.map((outlet) => (
                    <label key={outlet.outletId} className="p2w-start__outlet">
                      <input type="radio" name="gate-pass-outlet" value={outlet.outletId}
                        checked={chosenId === outlet.outletId} onChange={() => setChosenId(outlet.outletId)} />
                      <span>{outlet.outletName}</span>
                    </label>
                  ))}
                </fieldset>
              ) : null}
            </>
          ) : (
            <p><strong>Outlet: {outlets[0].outletName}</strong></p>
          )}
          <div className="p2gp-actions">
            <button type="button" className="p2w-button p2w-button--primary" disabled={!outletReady} onClick={afterOutlet}>Continue</button>
          </div>
        </div>
      ) : null}

      {step === 'day' && today && previous ? (
        <div className="p2gp-step">
          <div className="p2w-alert p2gp-ask" role="alert">
            The gate pass for <strong>{previous.label}</strong>{selected ? ` of ${selected.outletName}` : ''} is not uploaded yet.
            Which day is this photo for?
          </div>
          <div className="p2gp-actions">
            <button type="button" className="p2w-button p2w-button--secondary" onClick={() => { setForDate(previous.date); setStep('photo'); }}>
              {previous.label}
            </button>
            <button type="button" className="p2w-button p2w-button--primary" onClick={() => { setForDate(today.date); setStep('photo'); }}>
              Today, {today.label}
            </button>
            <button type="button" className="p2w-button p2w-button--ghost" onClick={() => setStep('outlet')}>Back</button>
          </div>
        </div>
      ) : null}

      {step === 'photo' ? (
        <div className="p2gp-step">
          <p>Take a clear photo of the gate pass, straight on and in good light, with the handwriting sharp. A blurred or small photo is refused.</p>
          <div className="p2gp-actions">
            {Capacitor.isNativePlatform() ? (
              <button type="button" className="p2w-button p2w-button--primary p2w-button--lg" disabled={busy} onClick={() => void takePhoto()}>
                {busy ? 'Uploading…' : 'Open camera'}
              </button>
            ) : (
              <>
                <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" hidden
                  onChange={(event) => void onFile(event.target.files?.[0])} />
                <button type="button" className="p2w-button p2w-button--primary p2w-button--lg" disabled={busy} onClick={() => fileInput.current?.click()}>
                  {busy ? 'Uploading…' : 'Upload the photo'}
                </button>
              </>
            )}
            <button type="button" className="p2w-button p2w-button--ghost" disabled={busy} onClick={() => setStep('outlet')}>Back</button>
          </div>
        </div>
      ) : null}

      {step === 'counts' ? (
        <form className="p2gp-step" onSubmit={(event) => { event.preventDefault(); if (countsValid) void sendCounts(); }}>
          <p><strong>The gate pass is saved.</strong> Now enter what it shows {dayWords === 'today' ? 'for today' : dayWords}{(gatePass?.coversDates?.length ?? 1) > 1 ? ' (Sunday and Monday together)' : ''}:</p>
          <div className="p2gp-counts">
            {([
              ['newDeliveries', '1. New deliveries'], ['stockTransfers', '2. Stock transfers'],
              ['testDrives', '3. Test drives'], ['otherCount', '4. Any other'],
            ] as const).map(([key, label]) => (
              <label key={key} className="p2gp-count">
                <span>{label}</span>
                <input type="number" inputMode="numeric" min={0} max={999} value={counts[key]}
                  onChange={(event) => setCounts((c) => ({ ...c, [key]: event.target.value }))} />
              </label>
            ))}
          </div>
          {num(counts.otherCount) > 0 ? (
            <label className="p2gp-count p2gp-count--wide">
              <span>Specify the other movement</span>
              <input type="text" maxLength={300} value={counts.otherNote}
                onChange={(event) => setCounts((c) => ({ ...c, otherNote: event.target.value }))} />
            </label>
          ) : null}
          <div className="p2gp-actions">
            <button type="submit" className="p2w-button p2w-button--primary" disabled={busy || !countsValid}>{busy ? 'Saving…' : 'Submit'}</button>
          </div>
        </form>
      ) : null}

      {step === 'explain' && result ? (
        <div className="p2gp-step">
          <p>
            You reported <strong>{result.declared}</strong> new deliver{result.declared === 1 ? 'y' : 'ies'}, but <strong>{result.deliveryFiles}</strong> delivery
            file{result.deliveryFiles === 1 ? ' was' : 's were'} uploaded for this outlet {dayWords === 'today' ? 'today' : `on ${chosenDay}`}. Which of those uploaded delivery files are for deliveries done on another day?
            Give the number or the customer name of each.
          </p>
          <textarea className="p2gp-text" rows={3} maxLength={1000} value={pastDeliveries} onChange={(event) => setPastDeliveries(event.target.value)} />
          <div className="p2gp-actions">
            <button type="button" className="p2w-button p2w-button--primary" disabled={busy || !pastDeliveries.trim()}
              onClick={() => void sendAnswer({ pastDeliveries: pastDeliveries.trim() })}>{busy ? 'Saving…' : 'Submit'}</button>
          </div>
        </div>
      ) : null}

      {step === 'held' && result ? (
        <div className="p2gp-step">
          <p>
            You reported <strong>{result.declared}</strong> new deliver{result.declared === 1 ? 'y' : 'ies'}, but only <strong>{result.deliveryFiles}</strong> delivery
            file{result.deliveryFiles === 1 ? ' was' : 's were'} uploaded. Was the difference of <strong>{result.difference}</strong> intimated to you, and do you have those files?
          </p>
          <div className="p2gp-actions">
            <button type="button" className="p2w-button p2w-button--confirm" disabled={busy} onClick={() => void sendAnswer({ filesHeld: true })}>Yes</button>
            <button type="button" className="p2w-button p2w-button--danger" disabled={busy} onClick={() => void sendAnswer({ filesHeld: false })}>No</button>
          </div>
        </div>
      ) : null}

      {step === 'done' ? (
        <div className="p2gp-step">
          <div className="p2w-alert p2w-alert--success" role="status">{outcome}</div>
          <div className="p2gp-actions">
            <button type="button" className="p2w-button p2w-button--ghost" onClick={startAgain}>Upload another gate pass</button>
          </div>
        </div>
      ) : null}
    </SectionCard>
  );
}
