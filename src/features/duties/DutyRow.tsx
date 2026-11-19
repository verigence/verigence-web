import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import {
  markDutyNotReceived, tickDuty, undoDuty, type MyDay, type MyDutyItem,
} from '../../services/audit-core/duties';
import { dayLabel, forLabel, tickProblem, timeLabel, valuesLabel } from './dutiesFormat';
import { dutiesKeys } from './useMyDuties';

/** Where the work of a system-checked duty is done. */
const CHECKER_LINKS: Record<string, { to: string; label: string }> = {
  GATE_REGISTER: { to: '/p2/gate-pass', label: 'Open gate register' },
  UPLOADS: { to: '/p2/bookings', label: 'Open Booking & Delivery' },
  VEHICLE_PHOTOS: { to: '/p2/bookings', label: 'Open Booking & Delivery' },
  BANK_STATEMENT: { to: '/p2/data-uploads?type=bank', label: 'Open bank statements' },
  OPEN_TASKS: { to: '/p2/tasks', label: 'Open tasks' },
};

function errorText(cause: unknown): string {
  return cause instanceof Error && cause.message ? cause.message : 'That could not be saved. Please try again.';
}

type Props = {
  item: MyDutyItem; tenantId: string; today: string; accessToken?: string;
  /** The item's Project is the one open in the app, so its screens can be linked. */
  linkable: boolean;
};

/**
 * One duty on the PC's list: a tick, the values it asks for, "not received today" (with the WhatsApp
 * group question, product owner 2026-11-18), or what the system has read for it.
 */
export default function DutyRow({ item, tenantId, today, accessToken, linkable }: Props) {
  const queryClient = useQueryClient();
  const [panel, setPanel] = useState<'tick' | 'notReceived' | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [comment, setComment] = useState('');
  const [informed, setInformed] = useState<boolean | null>(null);
  const [error, setError] = useState<string>();
  const apply = (day: MyDay) => {
    queryClient.setQueryData(dutiesKeys.myDay(tenantId), day);
    setPanel(null); setValues({}); setComment(''); setInformed(null); setError(undefined);
  };
  const tick = useMutation({
    mutationFn: async () => {
      const problem = tickProblem(item.inputs, values);
      if (problem) throw new Error(problem);
      const cleaned: Record<string, string | number> = {};
      item.inputs.forEach((i) => {
        const raw = (values[i.key] ?? '').trim();
        if (raw) cleaned[i.key] = i.type === 'TEXT' ? raw : Number(raw.replace(/,/g, ''));
      });
      return tickDuty(tenantId, item.itemId, cleaned, comment.trim() || null, accessToken);
    },
    onSuccess: apply,
    onError: (cause) => setError(errorText(cause)),
  });
  const undo = useMutation({
    mutationFn: () => undoDuty(tenantId, item.itemId, accessToken),
    onSuccess: apply,
    onError: (cause) => setError(errorText(cause)),
  });
  const notReceived = useMutation({
    mutationFn: async () => {
      if (informed === null) throw new Error('Say whether you have informed the WhatsApp group.');
      return markDutyNotReceived(tenantId, item.itemId, informed, comment.trim() || null, accessToken);
    },
    onSuccess: apply,
    onError: (cause) => setError(errorText(cause)),
  });
  const busy = tick.isPending || undo.isPending || notReceived.isPending;
  const done = item.status === 'DONE';
  const open = item.status === 'PENDING' || item.status === 'NOT_RECEIVED';
  const system = item.closeMode === 'AUTO';
  const link = system && linkable ? CHECKER_LINKS[item.checkerCode ?? ''] : undefined;
  const dated = forLabel(item, today);
  const startTick = () => {
    setError(undefined);
    if (item.inputs.length === 0) tick.mutate();
    else setPanel('tick');
  };
  const notReceivedMark = item.reasons.find((r) => r.category === 'NOT_RECEIVED');

  return (
    <li className={`dty-row dty-row--${item.status.toLowerCase().replace('_', '-')}`}>
      <span className="dty-check" aria-hidden="true">{done ? '✓' : item.status === 'ON_TRACK' ? '•' : ''}</span>
      <div className="dty-row__body">
        <div className="dty-row__head">
          <strong>{item.title}</strong>
          {dated ? <span className="dty-tag">{dated}</span> : null}
          {!item.mandatory ? <span className="dty-tag">Optional</span> : null}
          {item.carriedDays > 0 ? (
            <span className="dty-tag dty-tag--warn">
              Carried from {dayLabel(item.dutyDate)}{item.daysLeft === 0 ? ' · last day' : ` · ${item.daysLeft} day${item.daysLeft === 1 ? '' : 's'} left`}
            </span>
          ) : null}
          {item.status === 'ON_TRACK' ? <span className="dty-tag dty-tag--ok">On track</span> : null}
          {item.status === 'NOT_RECEIVED' ? <span className="dty-tag dty-tag--warn">Not received today</span> : null}
        </div>
        {item.description && !done ? <p className="dty-row__text">{item.description}</p> : null}

        {done ? (
          <p className="dty-row__text">
            Done{item.doneSource === 'SYSTEM' ? ' (read by the system)' : ''}
            {item.doneByName ? ` · ${item.doneByName}` : ''}{item.doneAt ? ` · ${timeLabel(item.doneAt)}` : ''}
            {valuesLabel(item.inputs, item.values) ? ` · ${valuesLabel(item.inputs, item.values)}` : ''}
            {item.comment ? ` · ${item.comment}` : ''}
          </p>
        ) : null}
        {!done && item.progress ? <p className="dty-row__text dty-row__text--strong">{item.progress.note}</p> : null}
        {!done && system && item.hint && item.status !== 'ON_TRACK' ? <p className="dty-row__text">{item.hint}</p> : null}
        {!done && item.checkFailed ? <p className="dty-row__text">This could not be checked just now. It will be checked again when you reopen the list.</p> : null}
        {notReceivedMark && open ? (
          <p className="dty-row__text">
            {notReceivedMark.byName} marked it not received
            {notReceivedMark.informedGroup === null ? '' : notReceivedMark.informedGroup ? ' · WhatsApp group informed' : ' · WhatsApp group not informed'}
            {notReceivedMark.remark ? ` · ${notReceivedMark.remark}` : ''}. It will be asked again tomorrow.
          </p>
        ) : null}

        {panel === null ? (
          <div className="dty-row__actions">
            {open && item.canTick ? (
              <button type="button" className="uc01-admin-button uc01-admin-button--primary uc01-admin-button--compact" disabled={busy} onClick={startTick}>
                {system ? (item.nilLabel ?? 'Mark done') : item.allowNotReceived ? 'Yes, done' : 'Mark done'}
              </button>
            ) : null}
            {open && item.allowNotReceived && item.status !== 'NOT_RECEIVED' ? (
              <button type="button" className="uc01-admin-button uc01-admin-button--compact" disabled={busy}
                onClick={() => { setError(undefined); setPanel('notReceived'); }}>Not received</button>
            ) : null}
            {!done && link ? <Link className="uc01-admin-button uc01-admin-button--compact" to={link.to}>{link.label}</Link> : null}
            {item.canUndo ? (
              <button type="button" className="uc01-admin-button uc01-admin-button--compact" disabled={busy} onClick={() => undo.mutate()}>Undo</button>
            ) : null}
          </div>
        ) : null}

        {panel === 'tick' ? (
          <form className="dty-panel" onSubmit={(e) => { e.preventDefault(); tick.mutate(); }}>
            {item.inputs.map((input) => (
              <label key={input.key} className="dty-field">
                <span>{input.label}{input.required ? '' : ' (optional)'}</span>
                <input value={values[input.key] ?? ''} maxLength={input.type === 'TEXT' ? 200 : 16}
                  inputMode={input.type === 'TEXT' ? 'text' : input.type === 'AMOUNT' ? 'decimal' : 'numeric'}
                  onChange={(e) => { setValues((v) => ({ ...v, [input.key]: e.target.value })); setError(undefined); }} />
              </label>
            ))}
            <label className="dty-field dty-field--wide">
              <span>Note (optional)</span>
              <input value={comment} maxLength={300} onChange={(e) => setComment(e.target.value)} />
            </label>
            <div className="dty-panel__actions">
              <button type="submit" className="uc01-admin-button uc01-admin-button--primary uc01-admin-button--compact" disabled={busy}>
                {tick.isPending ? 'Saving…' : 'Save'}
              </button>
              <button type="button" className="uc01-admin-button uc01-admin-button--compact" disabled={busy} onClick={() => { setPanel(null); setError(undefined); }}>Cancel</button>
            </div>
          </form>
        ) : null}

        {panel === 'notReceived' ? (
          <form className="dty-panel" onSubmit={(e) => { e.preventDefault(); notReceived.mutate(); }}>
            <fieldset className="dty-choice">
              <legend>Have you informed the relevant WhatsApp group?</legend>
              <label className={informed === true ? 'is-active' : ''}>
                <input type="radio" name={`dty-informed-${item.itemId}`} checked={informed === true} onChange={() => { setInformed(true); setError(undefined); }} />Yes
              </label>
              <label className={informed === false ? 'is-active' : ''}>
                <input type="radio" name={`dty-informed-${item.itemId}`} checked={informed === false} onChange={() => { setInformed(false); setError(undefined); }} />No
              </label>
            </fieldset>
            <label className="dty-field dty-field--wide">
              <span>Note (optional)</span>
              <input value={comment} maxLength={300} onChange={(e) => setComment(e.target.value)} />
            </label>
            <div className="dty-panel__actions">
              <button type="submit" className="uc01-admin-button uc01-admin-button--primary uc01-admin-button--compact" disabled={busy || informed === null}>
                {notReceived.isPending ? 'Saving…' : 'Save as not received'}
              </button>
              <button type="button" className="uc01-admin-button uc01-admin-button--compact" disabled={busy} onClick={() => { setPanel(null); setError(undefined); }}>Cancel</button>
            </div>
          </form>
        ) : null}

        {error ? <p className="dty-error" role="alert">{error}</p> : null}
      </div>
    </li>
  );
}
