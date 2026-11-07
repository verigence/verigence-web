import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import SectionCard from '../../../components/SectionCard';
import {
  addGatePassPhotos, answerGatePass, getGatePass, getGatePassDays, getGatePassImageUrl, getGatePassOutlets, notUploadedByPc,
  gatePassErrorText, MAX_GATE_PASS_PHOTOS, removeGatePassPhoto, submitGatePassCounts, uploadGatePass,
  type GatePass, type GatePassAnswer, type GatePassChoosableDay, type GatePassCountsResult, type GatePassDayInfo,
  type GatePassOutlet,
} from '../../../services/audit-core/uc03GatePass';
import { captureEvidencePhoto } from '../../../services/device/camera';
import { getMyDisplayName } from '../../../services/security/profile';

type Step = 'outlet' | 'day' | 'manage' | 'mode' | 'photo' | 'counts' | 'explain' | 'held' | 'done';

type Photo = { blob: Blob; filename: string; url: string; date: string };
// The numbers the PC reads off the register (product owner 2026-11-02): the total deliveries,
// and how many of them the dealership intimated to the PC. The tool works out the rest.
// Stock transfer entries (vehicles moved to or from another outlet) are entered too
// (product owner 2026-11-05: big outlets have them); blank means none. They are not deliveries.
type Counts = { total: string; intimated: string; transfers: string };
const EMPTY_COUNTS: Counts = { total: '', intimated: '', transfers: '' };

function dayName(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** '4 Nov' from an ISO date. */
function shortDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

const isSunday = (date: string | undefined) => Boolean(date) && new Date(`${date}T00:00:00Z`).getUTCDay() === 0;

/** What a date allows, as a Carbon tag (product owner 2026-11-07). */
function dayTag(day: GatePassChoosableDay): { text: string; tone: 'ok' | 'warn' | 'muted' } {
  if (day.state === 'NEW') return { text: 'Not uploaded', tone: 'warn' };
  if (day.state === 'EDITABLE') return { text: 'Uploaded · can be edited', tone: 'ok' };
  return { text: 'Uploaded · locked', tone: 'muted' };
}

/** One photo of a register on file, opened through a short-lived link. */
function RegisterPhoto({ tenantId, accessToken, gatePassId, position, version }: {
  tenantId: string; accessToken: string; gatePassId: string; position: number; version: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setUrl(null);
    getGatePassImageUrl(tenantId, gatePassId, accessToken, position)
      .then((res) => { if (live) setUrl(res.url); })
      .catch(() => { if (live) setUrl(''); });
    return () => { live = false; };
  }, [tenantId, accessToken, gatePassId, position, version]);
  if (url === null) return <span className="p2gp-thumbs__empty">Loading…</span>;
  if (!url) return <span className="p2gp-thumbs__empty">Photo not available</span>;
  return <img src={url} alt={`Photo ${position}`} />;
}

type Props = { tenantId: string; accessToken: string; onChanged: () => void; editGatePassId?: string | null };

/** The photo comes from the camera on the mobile app and from a file on the web. */
async function nativePhoto(): Promise<{ blob: Blob; filename: string }> {
  const photo = await captureEvidencePhoto();
  if (!photo.webPath) throw new Error('The photo could not be read. Please take it again.');
  const blob = await (await fetch(photo.webPath)).blob();
  return { blob, filename: `gate-pass.${photo.format || 'jpg'}` };
}

const num = (value: string) => (value.trim() === '' ? NaN : Number(value));
const validCount = (value: string) => Number.isInteger(num(value)) && num(value) >= 0 && num(value) <= 999;
const transfersOk = (value: string) => value.trim() === '' || validCount(value);
const transfers = (value: string) => (value.trim() === '' ? 0 : num(value));
const countsOk = (c: Counts) => validCount(c.total) && validCount(c.intimated) && num(c.intimated) <= num(c.total)
  && transfersOk(c.transfers);

function CountsForm({ value, onChange }: { value: Counts; onChange: (next: Counts) => void }) {
  const tooMany = validCount(value.total) && validCount(value.intimated) && num(value.intimated) > num(value.total);
  return (
    <>
      <div className="p2gp-counts">
        <label className="p2gp-count">
          <span>1. Total deliveries on the gate register</span>
          <input type="number" inputMode="numeric" min={0} max={999} value={value.total}
            onChange={(event) => onChange({ ...value, total: event.target.value })} />
        </label>
        <label className="p2gp-count">
          <span>2. Of these, intimated to you by the dealership</span>
          <input type="number" inputMode="numeric" min={0} max={999} value={value.intimated}
            onChange={(event) => onChange({ ...value, intimated: event.target.value })} />
        </label>
        <label className="p2gp-count">
          <span>3. Stock transfer entries on the gate register (vehicles moved to or from another outlet; leave blank if none)</span>
          <input type="number" inputMode="numeric" min={0} max={999} value={value.transfers}
            onChange={(event) => onChange({ ...value, transfers: event.target.value })} />
        </label>
      </div>
      {!transfersOk(value.transfers) ? <p className="p2w-muted" role="alert">Enter the stock transfers as a whole number.</p> : null}
      {tooMany ? <p className="p2w-muted" role="alert">Intimated cannot be more than the total on the register.</p> : null}
    </>
  );
}

/** What the tool made of the two numbers (product owner 2026-11-02). */
function registerOutcome(res: GatePassCountsResult): string {
  if (res.intimatedToPc == null) {
    return 'No divergence found. The vehicle gate passes uploaded match what you reported, and you are good to finish the task.';
  }
  const pending = res.pendingWithPc ?? 0;
  return [
    'The gate register is saved and the task is complete.',
    pending ? `${pending} intimated deliver${pending === 1 ? 'y is' : 'ies are'} still to be uploaded by you, with ${pending === 1 ? 'its' : 'their'} vehicle gate pass.`
      : 'Every delivery intimated to you is uploaded.',
    res.taskRaised ? 'A task "Delivery not notified to PC" has been raised for your Team Lead and Reviewer.' : '',
  ].filter(Boolean).join(' ');
}

function RegisterFigures({ result }: { result: GatePassCountsResult }) {
  const rows: Array<[string, number | null | undefined]> = [
    ['Total on the gate register', result.declared],
    ['Intimated to you', result.intimatedToPc],
    ['Uploaded in the tool', result.deliveryFiles],
    ['Pending with you', result.pendingWithPc],
    ['Not intimated to you', result.notIntimatedToPc],
    ['Stock transfers (not deliveries)', result.gatePass?.stockTransfers],
  ];
  return (
    <dl className="p2gp-figures">
      {rows.map(([label, value]) => (
        <div key={label}><dt>{label}</dt><dd>{value ?? 0}</dd></div>
      ))}
    </dl>
  );
}

/** PC: upload today's gate pass, say what the day held, and see whether it agrees with the vehicle gate passes uploaded (2026-10-27). */
export default function GatePassWizard({ tenantId, accessToken, onChanged, editGatePassId }: Props) {
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const outletsQuery = useQuery({
    queryKey: ['gate-pass-outlets', tenantId],
    queryFn: () => getGatePassOutlets(tenantId, accessToken),
    staleTime: 60_000,
  });
  const outlets = outletsQuery.data?.outlets ?? [];
  // Registers this PC uploaded today, still correctable (product owner 2026-11-03).
  const editableToday = (outletsQuery.data?.editableToday ?? []).filter((gp) => gp.countsEditable !== false);
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
  const [notNotified, setNotNotified] = useState('');
  const [outcome, setOutcome] = useState<string | null>(null);
  // The date the register is for: the PC always chooses it, today back to N-7, Sunday going with
  // Monday (product owner 2026-11-07). pickedDate is the choice on the date step, forDate the one made.
  const [forDate, setForDate] = useState<string | null>(null);
  const [pickedDate, setPickedDate] = useState('');
  // A register on file for the chosen date, whose photos can still be changed (N to N-3).
  const [register, setRegister] = useState<GatePass | null>(null);
  const [replacing, setReplacing] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<number | null>(null);
  // Where the next picked photos go: the new register being built, or the register on file.
  const fileTarget = useRef<'new' | 'existing'>('new');
  const todayDate = outletsQuery.data?.window?.today ?? outletsQuery.data?.today?.date ?? null;

  const selected: GatePassOutlet | undefined = outlets.length === 1
    ? outlets[0]
    : confirmedDefault === false ? outlets.find((o) => o.outletId === chosenId) : defaultOutlet;
  const outletReady = outlets.length === 1 || confirmedDefault === true || (confirmedDefault === false && Boolean(chosenId));
  const daysQuery = useQuery({
    queryKey: ['gate-pass-days', tenantId, selected?.outletId],
    queryFn: () => getGatePassDays(tenantId, selected!.outletId, accessToken),
    enabled: Boolean(selected) && step !== 'outlet',
    staleTime: 0,
  });
  const choosable = daysQuery.data?.days ?? [];
  const windowDays: GatePassDayInfo[] = choosable.length ? choosable : (outletsQuery.data?.window?.days ?? []);
  const dayOf = (date: string | null) => windowDays.find((d) => d.date === date) ?? null;
  const picked = choosable.find((d) => d.date === pickedDate) ?? null;
  const chosenDay = gatePass?.dayLabel ?? register?.dayLabel ?? dayOf(forDate)?.label ?? null;
  const dayWords = forDate && forDate !== todayDate ? `for ${chosenDay}` : 'today';
  const sundayToday = isSunday(todayDate ?? undefined) || (!outletsQuery.data?.today && Boolean(outletsQuery.data?.previous));

  const covers = gatePass?.coversDates ?? register?.coversDates ?? dayOf(forDate)?.coversDates ?? (forDate ? [forDate] : []);
  // Correcting the counts of a register uploaded today (product owner 2026-11-03).
  const [editing, setEditing] = useState(false);

  function correctCounts(gp: GatePass) {
    setGatePass(gp);
    setCounts({ total: gp.newDeliveries != null ? String(gp.newDeliveries) : '',
      intimated: gp.intimatedToPc != null ? String(gp.intimatedToPc) : '',
      transfers: gp.stockTransfers ? String(gp.stockTransfers) : '' });
    setCountsByDay(Object.fromEntries((gp.dayCounts ?? []).map((d) => [d.date, {
      total: String(d.newDeliveries ?? ''), intimated: d.intimatedToPc != null ? String(d.intimatedToPc) : '',
      transfers: d.stockTransfers ? String(d.stockTransfers) : '' }])));
    setEditing(true);
    setError(null);
    setStep('counts');
  }

  useEffect(() => {
    if (!editGatePassId) return;
    let live = true;
    getGatePass(tenantId, editGatePassId, accessToken)
      .then(({ gatePass: gp }) => {
        if (!live) return;
        if (gp.countsEditable) correctCounts(gp);
        else setError('The counts of this gate register can be corrected only on the day it was uploaded.');
      })
      .catch((cause) => { if (live) setError(gatePassErrorText(cause, 'The gate register could not be opened.')); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editGatePassId, tenantId]);
  const twoDays = covers.length > 1;

  /** The PC is always asked which date the register is for (product owner 2026-11-07). */
  function afterOutlet() {
    setForDate(null);
    setPickedDate('');
    setRegister(null);
    setError(null);
    setStep('day');
  }

  /** A date without a register: a new one. A date whose register can still be changed: its photos. */
  function afterDay() {
    if (!picked || picked.state === 'LOCKED') return;
    setError(null);
    setConfirmReplace(false);
    setConfirmRemove(null);
    if (picked.state === 'EDITABLE' && picked.register) {
      setForDate(picked.date);
      setRegister(picked.register);
      setStep('manage');
      return;
    }
    setReplacing(false);
    goToPhotos(picked.date);
  }

  function goToPhotos(date: string | null) {
    setForDate(date);
    setPhotos([]);
    setSeparate(false);
    const info = dayOf(date);
    setStep((info?.coversDates.length ?? 1) > 1 ? 'mode' : 'photo');
  }

  /** Photos added to the register on file go to the server at once; it keeps the counts. */
  async function addToRegister(items: Array<{ blob: Blob; filename: string }>) {
    if (!register) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await addGatePassPhotos(tenantId, register.gatePassId, items,
        register.photoMode === 'SEPARATE' ? pendingDate.current ?? undefined : undefined, accessToken);
      setRegister(saved);
      onChanged();
      void queryClient.invalidateQueries({ queryKey: ['gate-pass-days', tenantId] });
    } catch (cause) {
      setError(gatePassErrorText(cause, 'The photo could not be added. Please try again.'));
    } finally {
      setBusy(false);
    }
  }

  async function removeFromRegister(pageNo: number) {
    if (!register) return;
    setBusy(true);
    setError(null);
    try {
      setRegister(await removeGatePassPhoto(tenantId, register.gatePassId, pageNo, accessToken));
      setConfirmRemove(null);
      onChanged();
      void queryClient.invalidateQueries({ queryKey: ['gate-pass-days', tenantId] });
    } catch (cause) {
      setError(gatePassErrorText(cause, 'The photo could not be removed. Please try again.'));
    } finally {
      setBusy(false);
    }
  }

  /** Enter the numbers of the register on file (not entered yet). */
  function countsOfRegister(gp: GatePass) {
    setGatePass(gp);
    setCounts(EMPTY_COUNTS);
    setCountsByDay(Object.fromEntries((gp.coversDates ?? [gp.businessDate]).map((d) => [d, EMPTY_COUNTS])));
    setEditing(false);
    setError(null);
    setStep('counts');
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

  async function takePhoto(date: string | null, target: 'new' | 'existing' = 'new') {
    setError(null);
    pendingDate.current = date;
    try {
      const shot = await nativePhoto();
      if (target === 'existing') await addToRegister([shot]);
      else addPhotos([shot]);
    } catch (cause) {
      // Closing the camera is not an error worth showing.
      if (cause instanceof Error && /cancel/i.test(cause.message)) return;
      setError(gatePassErrorText(cause, 'The photo could not be taken. Please try again.'));
    }
  }

  function pickFiles(date: string | null, target: 'new' | 'existing' = 'new') {
    pendingDate.current = date;
    fileTarget.current = target;
    fileInput.current?.click();
  }

  function onFiles(list: FileList | null) {
    const files = Array.from(list ?? []).map((file) => ({ blob: file as Blob, filename: file.name }));
    if (fileInput.current) fileInput.current.value = '';
    if (!files.length) return;
    if (fileTarget.current === 'existing') void addToRegister(files);
    else addPhotos(files);
  }

  const photosReady = photos.length > 0 && (!separate || covers.every((d) => photos.some((p) => p.date === d)));

  async function sendPhotos() {
    if (!selected || !photosReady || !forDate) return;
    setBusy(true);
    setError(null);
    try {
      const pcName = await queryClient.fetchQuery({
        queryKey: ['my-display-name'], queryFn: async () => (await getMyDisplayName(accessToken)) ?? null, staleTime: 5 * 60_000,
      });
      const saved = await uploadGatePass(tenantId, {
        outletId: selected.outletId, pcName: pcName ?? undefined, businessDate: forDate,
        photos: photos.map(({ blob, filename, date }) => ({ blob, filename, date })), separateDays: separate,
      }, accessToken);
      setGatePass(saved);
      setRegister(null);
      setReplacing(false);
      setCountsByDay(Object.fromEntries(covers.map((d) => [d, EMPTY_COUNTS])));
      setStep('counts');
      onChanged();
      void queryClient.invalidateQueries({ queryKey: ['gate-pass-days', tenantId] });
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
          return { date, newDeliveries: num(c.total), intimatedToPc: num(c.intimated), stockTransfers: transfers(c.transfers) };
        }),
      } : {
        newDeliveries: num(counts.total), intimatedToPc: num(counts.intimated), stockTransfers: transfers(counts.transfers),
      }, accessToken);
      setResult(res);
      setGatePass(res.gatePass);
      onChanged();
      void queryClient.invalidateQueries({ queryKey: ['gate-pass-outlets', tenantId] });
      if (res.nextStep === 'DONE') {
        setOutcome(registerOutcome(res));
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

  async function sendAnswer(answer: GatePassAnswer) {
    if (!gatePass) return;
    setBusy(true);
    setError(null);
    try {
      const res = await answerGatePass(tenantId, gatePass.gatePassId, answer, accessToken);
      setGatePass(res.gatePass);
      const owed = res.notUploadedByPc ?? 0;
      setOutcome([
        res.taskRaised ? 'Noted. A high-priority task "Delivery not notified to PC" has been raised for your Team Lead.'
          : 'Noted. Thank you, the task is complete.',
        owed ? `${owed} deliver${owed === 1 ? 'y is' : 'ies are'} still to be uploaded by you, with ${owed === 1 ? 'its' : 'their'} vehicle gate pass.` : '',
      ].filter(Boolean).join(' '));
      setStep('done');
      onChanged();
    } catch (cause) {
      setError(gatePassErrorText(cause, 'Your answer could not be saved. Please try again.'));
    } finally {
      setBusy(false);
    }
  }

  function startAgain() {
    setStep('outlet'); setConfirmedDefault(null); setChosenId(''); setGatePass(null); setResult(null); setEditing(false);
    setCounts(EMPTY_COUNTS); setCountsByDay({}); photos.forEach((p) => URL.revokeObjectURL(p.url)); setPhotos([]);
    setSeparate(false); setPastDeliveries(''); setOutcome(null); setError(null); setForDate(null);
    setPickedDate(''); setRegister(null); setReplacing(false); setConfirmReplace(false); setConfirmRemove(null);
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
        <h3>{chosenDay ? `Gate pass for ${chosenDay}` : 'Gate pass'}</h3>
        <p className="p2w-muted">
          {selected && step !== 'outlet' ? selected.outletName : null}
          {covers.length > 1
            ? `${selected && step !== 'outlet' ? ' · ' : ''}Sunday is off: this gate pass covers Sunday and Monday.`
            : null}
        </p>
      </div>

      {/* Hidden picker shared by the new register and the register on file. */}
      <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden
        onChange={(event) => onFiles(event.target.files)} />

      {error ? <div className="p2w-alert p2w-alert--error" role="alert">{error}</div> : null}

      {sundayToday && step === 'outlet' ? (
        <div className="p2w-alert" role="status">
          Today is Sunday, the off day: Sunday’s gate pass goes with Monday’s. You can still upload or edit an earlier day’s gate register here.
        </div>
      ) : null}

      {step === 'outlet' && editableToday.length ? (
        <div className="p2gp-step p2gp-editable">
          <p><strong>Uploaded today — you can correct the numbers until midnight</strong></p>
          <ul className="p2gp-editable__list">
            {editableToday.map((gp) => (
              <li key={gp.gatePassId} className="p2gp-editable__item">
                <span>
                  <strong>{gp.outletName}</strong> · {gp.dayLabel ?? gp.businessDate}
                  <span className="p2w-muted">
                    {' '}· Total {gp.newDeliveries ?? 0}, intimated to you {gp.intimatedToPc ?? '—'}
                    {gp.countsEditCount ? ` · corrected ${gp.countsEditCount}×` : ''}
                  </span>
                </span>
                <button type="button" className="p2w-button p2w-button--secondary" onClick={() => correctCounts(gp)}>
                  Correct the numbers
                </button>
              </li>
            ))}
          </ul>
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

      {step === 'day' ? (
        <div className="p2gp-step">
          {daysQuery.isLoading ? <p className="p2w-muted">Loading the dates…</p> : null}
          {daysQuery.isError ? (
            <div className="p2w-alert p2w-alert--error" role="alert">
              {gatePassErrorText(daysQuery.error, 'The dates could not be loaded. Please try again.')}
            </div>
          ) : null}
          {choosable.length ? (
            <fieldset className="p2gp-days">
              <legend>Which date is this gate register for?</legend>
              <p className="p2w-muted p2gp-days__help">
                You can upload a register for today or any of the last {daysQuery.data?.uploadBackDays ?? 7} days. A register already
                uploaded can be changed for {daysQuery.data?.editBackDays ?? 3} days after its date. Sunday is off: its gate pass goes with Monday’s.
              </p>
              {choosable.map((day) => {
                const tag = dayTag(day);
                return (
                  <label key={day.date} className={`p2gp-day${day.state === 'LOCKED' ? ' p2gp-day--locked' : ''}`}>
                    <input type="radio" name="gate-pass-date" value={day.date}
                      checked={pickedDate === day.date} onChange={() => { setPickedDate(day.date); setError(null); }} />
                    <span className="p2gp-day__label">
                      {day.isToday ? `Today, ${day.label}` : day.label}
                      {day.register ? (
                        <span className="p2gp-day__meta">
                          {(day.register.pages?.length ?? 1)} photo{(day.register.pages?.length ?? 1) === 1 ? '' : 's'}
                          {' · '}{day.register.countsSubmitted ? 'numbers entered' : 'numbers not entered'}
                        </span>
                      ) : null}
                    </span>
                    <span className={`p2gp-pill p2gp-pill--${tag.tone}`}>{tag.text}</span>
                  </label>
                );
              })}
            </fieldset>
          ) : null}
          {picked ? (
            <div className={`p2w-alert${picked.state === 'LOCKED' ? ' p2gp-ask' : ''}`} role="status">
              {picked.state === 'LOCKED'
                ? `The gate register for ${picked.label} is locked. A register already uploaded can be changed only up to ${daysQuery.data?.editBackDays ?? 3} days after its date. Please ask your Team Lead if it needs correcting.`
                : picked.note}
            </div>
          ) : null}
          <div className="p2gp-actions">
            <button type="button" className="p2w-button p2w-button--primary" disabled={!picked || picked.state === 'LOCKED'} onClick={afterDay}>
              {picked?.state === 'EDITABLE' ? 'Open the register' : 'Continue'}
            </button>
            <button type="button" className="p2w-button p2w-button--ghost" onClick={() => setStep('outlet')}>Back</button>
          </div>
        </div>
      ) : null}

      {step === 'manage' && register ? (() => {
        const pages = (register.pages ?? []).map((p, i) => ({ ...p, position: p.position ?? i + 1 }));
        const apart = register.photoMode === 'SEPARATE';
        const full = pages.length >= MAX_GATE_PASS_PHOTOS;
        const version = `${register.gatePassId}:${register.pagesEditCount ?? 0}`;
        const canRemove = (page: { date: string }) => pages.length > 1 && (!apart || pages.filter((p) => p.date === page.date).length > 1);
        return (
          <div className="p2gp-step">
            <div className="p2w-alert" role="status">
              The gate register for <strong>{register.dayLabel ?? register.businessDate}</strong> is already uploaded
              {register.pcName ? ` by ${register.pcName}` : ''}. You can add, replace or remove its photos
              {register.editableUntil ? ` until the end of ${shortDate(register.editableUntil)}` : ''}. Its numbers stay as they are.
            </div>
            {(apart ? register.coversDates ?? [register.businessDate] : [null]).map((date) => {
              const mine = pages.filter((p) => !apart || p.date === date);
              return (
                <fieldset key={date ?? 'all'} className="p2gp-photos">
                  {apart && date ? <legend>{dayName(date)}</legend> : null}
                  <ul className="p2gp-thumbs">
                    {mine.map((page) => (
                      <li key={page.pageNo}>
                        <RegisterPhoto tenantId={tenantId} accessToken={accessToken} gatePassId={register.gatePassId}
                          position={page.position} version={version} />
                        {canRemove(page) ? (
                          <button type="button" className="p2gp-thumbs__remove" aria-label={`Remove photo ${page.position}`} disabled={busy}
                            onClick={() => setConfirmRemove(page.pageNo)}>×</button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                  <div className="p2gp-actions">
                    {Capacitor.isNativePlatform() ? (
                      <button type="button" className="p2w-button p2w-button--secondary" disabled={busy || full}
                        onClick={() => void takePhoto(date, 'existing')}>Take a photo</button>
                    ) : null}
                    <button type="button" className="p2w-button p2w-button--secondary" disabled={busy || full}
                      onClick={() => pickFiles(date, 'existing')}>{busy ? 'Saving…' : 'Add photo'}</button>
                  </div>
                </fieldset>
              );
            })}
            {confirmRemove != null ? (
              <div className="p2w-alert p2gp-ask" role="alert">
                Remove photo {pages.find((p) => p.pageNo === confirmRemove)?.position} from the register? It is kept in the history.
                <div className="p2gp-actions p2gp-actions--inline">
                  <button type="button" className="p2w-button p2w-button--danger" disabled={busy} onClick={() => void removeFromRegister(confirmRemove)}>
                    {busy ? 'Removing…' : 'Remove photo'}
                  </button>
                  <button type="button" className="p2w-button p2w-button--ghost" disabled={busy} onClick={() => setConfirmRemove(null)}>Keep it</button>
                </div>
              </div>
            ) : null}
            <p className="p2w-muted">
              {pages.length} of {MAX_GATE_PASS_PHOTOS} photos{full ? ' · remove a photo to add another' : ''}
              {apart ? ' · keep at least one photo for each day' : ''}
            </p>
            <p className="p2w-muted">
              {register.countsSubmitted
                ? `Numbers entered: ${register.newDeliveries ?? 0} deliveries on the register, ${register.intimatedToPc ?? '—'} intimated to you.`
                : 'The numbers of this register are not entered yet.'}
            </p>
            {confirmReplace ? (
              <div className="p2w-alert p2gp-ask" role="alert">
                Replace all the photos of {register.dayLabel ?? register.businessDate}? The register on file is kept in the history,
                and you will enter its numbers again.
                <div className="p2gp-actions p2gp-actions--inline">
                  <button type="button" className="p2w-button p2w-button--primary"
                    onClick={() => { setReplacing(true); setConfirmReplace(false); goToPhotos(register.businessDate); }}>Replace all photos</button>
                  <button type="button" className="p2w-button p2w-button--ghost" onClick={() => setConfirmReplace(false)}>Cancel</button>
                </div>
              </div>
            ) : null}
            <div className="p2gp-actions">
              {!register.countsSubmitted ? (
                <button type="button" className="p2w-button p2w-button--primary" disabled={busy} onClick={() => countsOfRegister(register)}>
                  Enter the numbers
                </button>
              ) : register.countsEditable ? (
                <button type="button" className="p2w-button p2w-button--secondary" disabled={busy} onClick={() => correctCounts(register)}>
                  Correct the numbers
                </button>
              ) : null}
              <button type="button" className="p2w-button p2w-button--secondary" disabled={busy || confirmReplace}
                onClick={() => setConfirmReplace(true)}>Replace all photos</button>
              <button type="button" className="p2w-button p2w-button--ghost" disabled={busy}
                onClick={() => { setRegister(null); setStep('day'); void daysQuery.refetch(); }}>Back</button>
            </div>
          </div>
        );
      })() : null}

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
            <button type="button" className="p2w-button p2w-button--ghost" onClick={() => setStep(replacing && register ? 'manage' : 'day')}>Back</button>
          </div>
        </div>
      ) : null}

      {step === 'photo' ? (
        <div className="p2gp-step">
          {replacing ? (
            <div className="p2w-alert p2gp-ask" role="status">
              These photos replace the gate register for {chosenDay}. The register on file is kept in the history; you will enter its numbers again.
            </div>
          ) : null}
          <p>
            Take a clear photo of each page of the gate-out register, straight on and in good light, or upload photos you have
            already taken. Up to {MAX_GATE_PASS_PHOTOS} photos.
          </p>
          {/* Camera or existing photos, on the app and the website alike (product owner 2026-10-27). */}
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
            <button type="button" className="p2w-button p2w-button--ghost" disabled={busy}
              onClick={() => setStep(twoDays ? 'mode' : replacing && register ? 'manage' : 'day')}>Back</button>
          </div>
        </div>
      ) : null}

      {step === 'counts' ? (
        <form className="p2gp-step" onSubmit={(event) => { event.preventDefault(); if (countsValid) void sendCounts(); }}>
          {editing && gatePass ? (
            <div className="p2w-alert" role="status">
              Correcting the numbers of {gatePass.outletName}, {gatePass.dayLabel ?? gatePass.businessDate}
              {gatePass.countsEditCount ? ` (corrected ${gatePass.countsEditCount}× already)` : ''}. You can correct them until the end of today.
            </div>
          ) : null}
          {!editing && gatePass?.photoQuality && gatePass.photoQuality !== 'GOOD' ? (
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
            {editing ? (
              <button type="button" className="p2w-button p2w-button--ghost" disabled={busy} onClick={startAgain}>Cancel</button>
            ) : null}
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
            gate pass of this date uploaded. Of the other <strong>{result.difference}</strong>, how many did the dealership not notify to you?
          </p>
          <label className="p2gp-count">
            <span>Not notified to me by the dealership</span>
            <input type="number" inputMode="numeric" min={0} max={result.difference} value={notNotified}
              onChange={(event) => setNotNotified(event.target.value)} />
          </label>
          {notNotified !== '' && Number(notNotified) <= result.difference ? (
            <p className="p2w-muted">
              Not uploaded by you in the tool: <strong>{notUploadedByPc(result.declared, result.deliveryFiles, Number(notNotified))}</strong>
              {' '}({result.declared} on the gate pass − {result.deliveryFiles} found − {Number(notNotified)} not notified).
            </p>
          ) : null}
          <div className="p2gp-actions">
            <button type="button" className="p2w-button p2w-button--primary"
              disabled={busy || notNotified === '' || !Number.isInteger(Number(notNotified)) || Number(notNotified) < 0
                || Number(notNotified) > result.difference}
              onClick={() => void sendAnswer({ notNotified: Number(notNotified) })}>{busy ? 'Saving…' : 'Submit'}</button>
          </div>
        </div>
      ) : null}

      {step === 'done' ? (
        <div className="p2gp-step">
          <div className="p2w-alert p2w-alert--success" role="status">{outcome}</div>
          {result?.intimatedToPc != null ? <RegisterFigures result={result} /> : null}
          <div className="p2gp-actions">
            {gatePass?.countsEditable ? (
              <button type="button" className="p2w-button p2w-button--secondary" onClick={() => correctCounts(gatePass)}>
                Correct the numbers
              </button>
            ) : null}
            <button type="button" className="p2w-button p2w-button--ghost" onClick={startAgain}>Upload another gate pass</button>
          </div>
        </div>
      ) : null}
    </SectionCard>
  );
}
