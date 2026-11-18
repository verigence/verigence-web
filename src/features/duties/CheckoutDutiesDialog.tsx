import { useState } from 'react';

import DialogShell from '../hr/attendance/DialogShell';
import { AuditCoreHttpError } from '../../services/audit-core/client';
import { closeMyDay } from '../../services/audit-core/duties';
import {
  activeDays, closeReasons, dayLabel, forLabel, itemsOf, needsReason, type DutyProjectDay, type ReasonDraft,
} from './dutiesFormat';
import '../../styles/duties.css';

type Props = {
  days: DutyProjectDay[]; accessToken?: string;
  /** The day is closed (or could not be reached): go on to the check-out photo. */
  onDone: () => void;
  onClose: () => void;
};

const EMPTY: ReasonDraft = { category: '', remark: '', handledByActorId: '' };

/** Closes the day in every Project. A Project that cannot be reached never holds check-out up;
 *  only a reason the server refuses is shown to the person. */
export async function closeDays(entries: Array<{ tenantId: string; reasons: ReturnType<typeof closeReasons>['reasons'] }>,
  accessToken?: string): Promise<string | undefined> {
  for (const entry of entries) {
    try {
      await closeMyDay(entry.tenantId, entry.reasons, accessToken);
    } catch (cause) {
      if (cause instanceof AuditCoreHttpError && cause.status === 422) return cause.problem?.detail || cause.message;
    }
  }
  return undefined;
}

/**
 * Before the check-out photo: the mandatory duties not done, Project by Project, each with a reason
 * (product owner 2026-11-18: "at day end they have to complete all tasks, or if not completed need to
 * give the reason"; "club this with the check in and check out"). This is the day close.
 */
export default function CheckoutDutiesDialog({ days, accessToken, onDone, onClose }: Props) {
  const active = activeDays(days);
  const [drafts, setDrafts] = useState<Record<string, ReasonDraft>>({});
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const several = active.length > 1;
  const set = (itemId: string, patch: Partial<ReasonDraft>) => {
    setDrafts((d) => ({ ...d, [itemId]: { ...(d[itemId] ?? EMPTY), ...patch } }));
    setError(undefined);
  };

  async function submit() {
    const entries: Array<{ tenantId: string; reasons: ReturnType<typeof closeReasons>['reasons'] }> = [];
    for (const entry of active) {
      const built = closeReasons(itemsOf(entry.day), drafts, entry.day.reasonCategories ?? []);
      if (built.problem) { setError(built.problem); return; }
      entries.push({ tenantId: entry.tenantId, reasons: built.reasons });
    }
    setSaving(true);
    const refused = await closeDays(entries, accessToken);
    setSaving(false);
    if (refused) setError(refused);
    else onDone();
  }

  return (
    <DialogShell title="Duties not done today" eyebrow="Check-out" onClose={onClose} locked={saving} wide>
      <p>Give a reason for each one, then check out. They come back on tomorrow&apos;s list.</p>
      <div className="dty-projects dty-projects--dialog">
        {active.map((entry) => {
          const categories = entry.day.reasonCategories ?? [];
          return (entry.day.outlets ?? []).map((outlet) => {
            const pending = outlet.items.filter(needsReason);
            if (pending.length === 0) return null;
            return (
              <section key={`${entry.tenantId}-${outlet.outletId}`} className="dty-outlet">
                <h4 className="dty-outlet__name">
                  {outlet.outletName}<span>{several ? entry.projectName : outlet.dealerName}</span>
                </h4>
                <ul className="dty-list">
                  {pending.map((item) => {
                    const draft = drafts[item.itemId] ?? EMPTY;
                    const category = categories.find((c) => c.code === draft.category);
                    const dated = forLabel(item, entry.day.date);
                    return (
                      <li key={item.itemId} className="dty-reason">
                        <div className="dty-row__head">
                          <strong>{item.title}</strong>
                          {dated ? <span className="dty-tag">{dated}</span> : null}
                          {item.carriedDays > 0 ? <span className="dty-tag dty-tag--warn">Carried from {dayLabel(item.dutyDate)}</span> : null}
                        </div>
                        {item.progress ? <p className="dty-row__text dty-row__text--strong">{item.progress.note}</p> : null}
                        <div className="dty-reason__fields">
                          <label className="dty-field">
                            <span>Reason</span>
                            <select value={draft.category} onChange={(e) => set(item.itemId, { category: e.target.value })}>
                              <option value="">Choose a reason</option>
                              {categories.filter((c) => !c.needsPerson || outlet.colleagues.length > 0).map((c) => (
                                <option key={c.code} value={c.code}>{c.label}</option>
                              ))}
                            </select>
                          </label>
                          {category?.needsPerson ? (
                            <label className="dty-field">
                              <span>Who is doing it</span>
                              <select value={draft.handledByActorId} onChange={(e) => set(item.itemId, { handledByActorId: e.target.value })}>
                                <option value="">Choose a PC</option>
                                {outlet.colleagues.map((c) => <option key={c.actorId} value={c.actorId}>{c.name}</option>)}
                              </select>
                            </label>
                          ) : null}
                          <label className="dty-field dty-field--wide">
                            <span>{category?.needsRemark ? 'Say why' : 'Note (optional)'}</span>
                            <input value={draft.remark} maxLength={300} onChange={(e) => set(item.itemId, { remark: e.target.value })} />
                          </label>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          });
        })}
      </div>
      {error ? <div className="uc01-admin-message uc01-admin-message--error" role="alert">{error}</div> : null}
      <div className="uc01-admin-dialog__actions">
        <button type="button" className="uc01-admin-button" disabled={saving} onClick={onClose}>Back to my duties</button>
        <button type="button" className="uc01-admin-button uc01-admin-button--primary" disabled={saving} onClick={() => void submit()}>
          {saving ? 'Saving…' : 'Save and check out'}
        </button>
      </div>
    </DialogShell>
  );
}
