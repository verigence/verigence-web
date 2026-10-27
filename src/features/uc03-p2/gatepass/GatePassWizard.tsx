import { useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import SectionCard from '../../../components/SectionCard';
import {
  answerGatePass, getGatePassOutlets, gatePassErrorText, MAX_GATE_PASS_PHOTOS, submitGatePassCounts, uploadGatePass,
  type GatePass, type GatePassCountsResult, type GatePassOutlet,
} from '../../../services/audit-core/uc03GatePass';
import { captureEvidencePhoto } from '../../../services/device/camera';
import { getMyDisplayName } from '../../../services/security/profile';

type Step = 'outlet' | 'day' | 'mode' | 'photo' | 'counts' | 'explain' | 'held' | 'done';

type Photo = { blob: Blob; filename: string; url: string; date: string };
type Counts = { newDeliveries: string; stockTransfers: string; testDrives: string; otherCount: string; otherNote: string };
const EMPTY_COUNTS: Counts = { newDeliveries: '', stockTransfers: '', testDrives: '', otherCount: '', otherNote: '' };

function dayName(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

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
const countsOk = (c: Counts) => validCount(c.newDeliveries) && validCount(c.stockTransfers)
  && validCount(c.testDrives) && validCount(c.otherCount) && (num(c.otherCount) === 0 || c.otherNote.trim().length > 0);

function CountsForm({ value, onChange }: { value: Counts; onChange: (next: Counts) => void }) {
  return (
    <>
      <div className="p2gp-counts">
        {([
          ['newDeliveries', '1. New deliveries'], ['stockTransfers', '2. Stock transfers'],
          ['testDrives', '3. Test drives'], ['otherCount', '4. Any other'],
        ] as const).map(([key, label]) => (
          <label key={key} className="p2gp-count">
            <span>{label}</span>
            <input type="number" inputMode="numeric" min={0} max={999} value={value[key]}
              onChange={(event) => onChange({ ...value, [key]: event.target.value })} />
          </label>
        ))}
      </div>
      {num(value.otherCount) > 0 ? (
        <label className="p2gp-count p2gp-count--wide">
          <span>Specify the other movement</span>
          <input type="text" maxLength={300} value={value.otherNote}
            onChange={(event) => onChange({ ...value, otherNote: event.target.value })} />
        </label>
      ) : null}
    </>
  );
}

/** PC: upload today's gate pass, say what the day held, and see whether it agrees with the vehicle gate passes uploaded (2026-10-27). */
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
  const [counts, setCounts] = useState<Counts>(EMPTY_COUNTS);
  const [countsByDay, setCountsByDay] = useState<Record<string, Counts>>({});
  // Up to four photos (the register can run over pages); Monday covers Sunday, and the
  // PC says whether the two days are on the same photos or apart (product owner 2026-10-27).
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [separate, setSeparate] = useState(false);
  // The day the next photos are for (Sunday or Monday), read when the camera or file picker returns.
  const pendingDate = useRef<string | null>(null);
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

  const covers = dayOf(forDate)?.coversDates ?? (forDate ? [forDate] : []);
  const twoDays = covers.length > 1;

  /** Ask which day only when the outlet still owes the previous day's gate pass. */
  function afterOutlet() {
    const owesPrevious = Boolean(selected && previous && outletsQuery.data?.previousOpenOutletIds?.includes(selected.outletId));
    if (today && owesPrevious) {
      setForDate(null);
      setStep('day');
      return;
    }
    goToPhotos(today?.date ?? previous?.date ?? null);
  }

  function goToPhotos(date: string | null) {
    setForDate(date);
    setPhotos([]);
    setSeparate(false);
    const info = [today, previous].find((d) => d?.date === date);
    setStep((info?.coversDates.length ?? 1) > 1 ? 'mode' : 'photo');
  }

  function addPhotos(items: Array<{ blob: Blob; filename: string }>) {
    setError(null);
    setPhotos((current) => {
      const room = MAX_GATE_PASS_PHOTOS - current.length;
      if (items.length > room) setError(`At most ${MAX_GATE_PASS_PHOTOS} photos for one gate pass.`);
      const date = separate && pendingDate.current ? pendingDate.current : (forDate ?? '');
      return [...current, ...items.slice(0, Math.max(room, 0)).map((item) => ({ ...item, url: URL.createObjectURL(item.blob), date }))];
    });
  }

  function removePhoto(index: number) {
    setPhotos((current) => {
      URL.revokeObjectURL(current[index].url);
      return current.filter((_, i) => i !== index);
    });
  }

  async function takePhoto(date: string | null) {
    setError(null);
    pendingDate.current = date;
    try {
      const shot = await nativePhoto();
      addPhotos([shot]);
    } catch (cause) {
      // Closing the camera is not an error worth showing.
      if (cause instanceof Error && /cancel/i.test(cause.message)) return;
      setError(gatePassErrorText(cause, 'The photo could not be taken. Please try again.'));
    }
  }

  function pickFiles(date: string | null) {
    pendingDate.current = date;
    fileInput.current?.click();
  }

  function onFiles(list: FileList | null) {
    const picked = Array.from(list ?? []).map((file) => ({ blob: file as Blob, filename: file.name }));
    if (fileInput.current) fileInput.current.value = '';
    if (picked.length) addPhotos(picked);
  }

  const photosReady = photos.length > 0 && (!separate || covers.every((d) => photos.some((p) => p.date === d)));

  async function sendPhotos() {
    if (!selected || !photosReady) return;
    setBusy(true);
    setError(null);
    try {
      const pcName = await queryClient.fetchQuery({
        queryKey: ['my-display-name'], queryFn: async () => (await getMyDisplayName(accessToken)) ?? null, staleTime: 5 * 60_000,
      });
      const saved = await uploadGatePass(tenantId, {
        outletId: selected.outletId, pcName: pcName ?? undefined, businessDate: forDate ?? undefined,
        photos: photos.map(({ blob, filename, date }) => ({ blob, filename, date })), separateDays: separate,
      }, accessToken);
      setGatePass(saved);
      setCountsByDay(Object.fromEntries(covers.map((d) => [d, EMPTY_COUNTS])));
      setStep('counts');
      onChanged();
    } catch (cause) {
      setError(gatePassErrorText(cause, 'The gate pass could not be uploaded. Please try again.'));
    } finally {
      setBusy(false);
    }
  }

  const perDay = gatePass?.photoMode === 'SEPARATE';
  const countsValid = perDay ? covers.every((d) => countsOk(countsByDay[d] ?? EMPTY_COUNTS)) : countsOk(counts);

  async function sendCounts() {
    if (!gatePass) return;
    setBusy(true);
    setError(null);
    try {
      const res = await submitGatePassCounts(tenantId, gatePass.gatePassId, perDay ? {
        days: covers.map((date) => {
          const c = countsByDay[date] ?? EMPTY_COUNTS;
          return { date, newDeliveries: num(c.newDeliveries), stockTransfers: num(c.stockTransfers),
                   testDrives: num(c.testDrives), otherCount: num(c.otherCount), otherNote: c.otherNote.trim() || undefined };
        }),
      } : {
        newDeliveries: num(counts.newDeliveries), stockTransfers: num(counts.stockTransfers),
        testDrives: num(counts.testDrives), otherCount: num(counts.otherCount),
        otherNote: counts.otherNote.trim() || undefined,
      }, accessToken);
      setResult(res);
      setGatePass(res.gatePass);
      onChanged();
      if (res.nextStep === 'DONE') {
        setOutcome('No divergence found. The vehicle gate passes uploaded match what you reported, and you are good to finish the task.');
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
    setCounts(EMPTY_COUNTS); setCountsByDay({}); photos.forEach((p) => URL.revokeObjectURL(p.url)); setPhotos([]);
    setSeparate(false); setPastDeliveries(''); setOutcome(null); setError(null); setForDate(null);
  }

  if (outletsQuery.isLoading) return <SectionCard><p className="p2w-muted">Loading…</p></SectionCard>;
  if (outletsQuery.isError || !outlets.length) {
    return (
      <SectionCard>
        <div className="p2w-alert p2w-alert--error" role="alert">
          {outletsQuery.isError
            ? gatePassErrorText(outletsQuery.error, 'Your outlets could not be loaded.')
            : outletsQuery.data?.satelliteOnly
              ? 'Your outlets are satellite outlets. The daily gate pass is taken at onsite outlets only, so there is nothing to upload here.'
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
            ? `${selected && step !== 'outlet' ? ' · ' : ''}Sunday is off: this gate pass covers Sunday and Monday.`
            : null}
        </p>
      </div>

      {error ? <div className="p2w-alert p2w-alert--error" role="alert">{error}</div> : null}

      {!today && previous && step === 'outlet' ? (
        <div className="p2w-alert" role="status">
          Sunday is off: Sunday’s gate pass goes with Monday’s. You can still upload the gate pass for {previous.label} here.
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
            <button type="button" className="p2w-button p2w-button--secondary" onClick={() => goToPhotos(previous.date)}>
              {previous.label}
            </button>
            <button type="button" className="p2w-button p2w-button--primary" onClick={() => goToPhotos(today.date)}>
              Today, {today.label}
            </button>
            <button type="button" className="p2w-button p2w-button--ghost" onClick={() => setStep('outlet')}>Back</button>
          </div>
        </div>
      ) : null}

      {step === 'mode' && twoDays ? (
        <div className="p2gp-step">
          <div className="p2w-alert p2gp-ask" role="alert">
            Sunday was off, so this gate pass covers <strong>{dayName(covers[0])}</strong> and <strong>{dayName(covers[1])}</strong>.
            Are both days on the same gate pass photo, or do you have separate photos for each day?
          </div>
          <div className="p2gp-actions">
            <button type="button" className="p2w-button p2w-button--primary" onClick={() => { setSeparate(false); setStep('photo'); }}>
              Same photo for both days
            </button>
            <button type="button" className="p2w-button p2w-button--secondary" onClick={() => { setSeparate(true); setStep('photo'); }}>
              Separate photos for each day
            </button>
            <button type="button" className="p2w-button p2w-button--ghost" onClick={() => setStep('outlet')}>Back</button>
          </div>
        </div>
      ) : null}

      {step === 'photo' ? (
        <div className="p2gp-step">
          <p>
            Take a clear photo of each page of the gate-out register, straight on and in good light, or upload photos you have
            already taken. Up to {MAX_GATE_PASS_PHOTOS} photos.
          </p>
          {/* Camera or existing photos, on the app and the website alike (product owner 2026-10-27). */}
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden
            onChange={(event) => onFiles(event.target.files)} />
          {(separate ? covers : [null]).map((date) => {
            const mine = photos.map((p, i) => ({ p, i })).filter(({ p }) => !separate || p.date === date);
            const full = photos.length >= MAX_GATE_PASS_PHOTOS;
            return (
              <fieldset key={date ?? 'all'} className="p2gp-photos">
                {separate && date ? <legend>{dayName(date)}</legend> : null}
                {mine.length ? (
                  <ul className="p2gp-thumbs">
                    {mine.map(({ p, i }) => (
                      <li key={p.url}>
                        <img src={p.url} alt={`Page ${i + 1}`} />
                        <button type="button" className="p2gp-thumbs__remove" aria-label={`Remove photo ${i + 1}`} disabled={busy}
                          onClick={() => removePhoto(i)}>×</button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="p2gp-actions">
                  {Capacitor.isNativePlatform() ? (
                    <button type="button" className="p2w-button p2w-button--secondary" disabled={busy || full} onClick={() => void takePhoto(date)}>
                      {mine.length ? 'Take another page' : 'Open camera'}
                    </button>
                  ) : null}
                  <button type="button" className="p2w-button p2w-button--secondary" disabled={busy || full} onClick={() => pickFiles(date)}>
                    {Capacitor.isNativePlatform() ? 'Upload photos' : mine.length ? 'Add more photos' : 'Choose photos'}
                  </button>
                </div>
              </fieldset>
            );
          })}
          <p className="p2w-muted">{photos.length} of {MAX_GATE_PASS_PHOTOS} photos{separate && !photosReady && photos.length ? ' · add at least one photo for each day' : ''}</p>
          <div className="p2gp-actions">
            <button type="button" className="p2w-button p2w-button--primary p2w-button--lg" disabled={busy || !photosReady} onClick={() => void sendPhotos()}>
              {busy ? 'Uploading…' : `Upload ${photos.length > 1 ? `${photos.length} photos` : 'the photo'}`}
            </button>
            <button type="button" className="p2w-button p2w-button--ghost" disabled={busy} onClick={() => setStep(twoDays ? 'mode' : 'outlet')}>Back</button>
          </div>
        </div>
      ) : null}

      {step === 'counts' ? (
        <form className="p2gp-step" onSubmit={(event) => { event.preventDefault(); if (countsValid) void sendCounts(); }}>
          {gatePass?.photoQuality && gatePass.photoQuality !== 'GOOD' ? (
            <div className="p2w-alert p2gp-ask" role="status">
              {gatePass.photoQualityNote} The photo is saved. If the handwriting is hard to read, take it again; otherwise carry on.
              <div className="p2gp-actions p2gp-actions--inline">
                <button type="button" className="p2w-button p2w-button--secondary" onClick={() => { setPhotos([]); setStep('photo'); }}>Take it again</button>
              </div>
            </div>
          ) : null}
          {perDay ? (
            <>
              <p><strong>The gate pass is saved.</strong> Now enter what it shows for each day:</p>
              {covers.map((date) => (
                <fieldset key={date} className="p2gp-photos">
                  <legend>{dayName(date)}</legend>
                  <CountsForm value={countsByDay[date] ?? EMPTY_COUNTS}
                    onChange={(next) => setCountsByDay((all) => ({ ...all, [date]: next }))} />
                </fieldset>
              ))}
            </>
          ) : (
            <>
              <p><strong>The gate pass is saved.</strong> Now enter what it shows {dayWords === 'today' ? 'for today' : dayWords}{(gatePass?.coversDates?.length ?? 1) > 1 ? ' (Sunday and Monday together)' : ''}:</p>
              <CountsForm value={counts} onChange={setCounts} />
            </>
          )}
          <div className="p2gp-actions">
            <button type="submit" className="p2w-button p2w-button--primary" disabled={busy || !countsValid}>{busy ? 'Saving…' : 'Submit'}</button>
          </div>
        </form>
      ) : null}

      {step === 'explain' && result ? (
        <div className="p2gp-step">
          <p>
            You reported <strong>{result.declared}</strong> new deliver{result.declared === 1 ? 'y' : 'ies'}, but <strong>{result.deliveryFiles}</strong> deliver{result.deliveryFiles === 1 ? 'y has its' : 'ies have their'} vehicle
            gate pass dated {dayWords === 'today' ? 'today' : chosenDay} uploaded for this outlet. Which of those deliveries were not on this gate pass?
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
            You reported <strong>{result.declared}</strong> new deliver{result.declared === 1 ? 'y' : 'ies'}, but only <strong>{result.deliveryFiles}</strong> deliver{result.deliveryFiles === 1 ? 'y has its' : 'ies have their'} vehicle
            gate pass of this date uploaded. A delivery counts only once its own vehicle gate pass is uploaded with its file. Was the difference
            of <strong>{result.difference}</strong> intimated to you, and do you have those files?
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
