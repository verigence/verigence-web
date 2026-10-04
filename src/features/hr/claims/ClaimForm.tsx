import { useEffect, useRef, useState, type FormEvent } from 'react';

import type { ClaimCategory, ClaimDetail, ClaimInput } from '../../../services/hr/claims';
import { MAX_DESCRIPTION_LENGTH } from '../../../services/hr/claims';
import Field from '../Field';
import type { ClaimProblem } from './claimErrors';
import { formatKm, formatMonth, formatPaise, formatRupees, formatRupeesShort, istDate, monthOf } from './claimFormat';
import { useClaimSummary } from './claimQueries';
import {
  claimOutlook,
  emptyClaimForm,
  estimatePerKm,
  outlookNotes,
  toPaise,
  validateClaimForm,
  type ClaimField,
  type ClaimFormErrors,
  type ClaimFormValues,
} from './claimRules';
import ReceiptPicker from './ReceiptPicker';
import type { PreparedReceipt } from './receiptFiles';

const FIELD_ID: Record<ClaimField, string> = {
  category: 'claim-category',
  expenseDate: 'claim-date',
  amount: 'claim-amount',
  distanceKm: 'claim-distance',
  description: 'claim-description',
  receipts: 'claim-receipts',
};
const FIELD_ORDER: ClaimField[] = ['category', 'expenseDate', 'distanceKm', 'amount', 'description', 'receipts'];

interface Props {
  categories: ClaimCategory[];
  /** Present when editing a claim that was sent back; the form starts from it. */
  claim?: ClaimDetail;
  busy: boolean;
  /** The last server refusal, shown in plain words. */
  problem: ClaimProblem | null;
  submitLabel: string;
  onSubmit: (input: ClaimInput) => void;
  onCancel: () => void;
}

function initialValues(claim: ClaimDetail | undefined, today: string): ClaimFormValues {
  if (!claim) return emptyClaimForm(today);
  return {
    category: claim.category,
    expenseDate: claim.expenseDate,
    amount: claim.distanceKm === null ? claim.amount.toFixed(2).replace(/\.00$/, '') : '',
    distanceKm: claim.distanceKm === null ? '' : String(claim.distanceKm),
    description: claim.description ?? '',
  };
}

/** The claim form, for a new claim and for correcting one that was sent back. Fields follow the category. */
export default function ClaimForm({ categories, claim, busy, problem, submitLabel, onSubmit, onCancel }: Props) {
  const today = istDate();
  const [values, setValues] = useState<ClaimFormValues>(() => initialValues(claim, today));
  const [photos, setPhotos] = useState<PreparedReceipt[]>([]);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [errors, setErrors] = useState<ClaimFormErrors>({});
  const sending = useRef(false);

  const category = categories.find((c) => c.code === values.category);
  const existing = claim?.receipts ?? [];
  const keptCount = existing.filter((r) => !removedIds.includes(r.receiptId)).length;
  const month = /^\d{4}-\d{2}-\d{2}$/.test(values.expenseDate) ? monthOf(values.expenseDate) : '';
  const summary = useClaimSummary(month, Boolean(category) && Boolean(month));

  // A refusal from the service marks the fields it names and frees the form for another try.
  useEffect(() => {
    sending.current = false;
    if (problem) setErrors((current) => ({ ...current, ...problem.fields }));
  }, [problem]);
  useEffect(() => {
    if (!busy) sending.current = false;
  }, [busy]);

  const patch = (change: Partial<ClaimFormValues>) => {
    setValues((current) => ({ ...current, ...change }));
    setErrors((current) => {
      const next = { ...current };
      if ('category' in change) {
        delete next.category;
        delete next.amount;
        delete next.distanceKm;
        delete next.receipts;
      }
      if ('expenseDate' in change) delete next.expenseDate;
      if ('amount' in change) delete next.amount;
      if ('distanceKm' in change) delete next.distanceKm;
      if ('description' in change) delete next.description;
      return next;
    });
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (busy || sending.current) return;
    const found = validateClaimForm(values, { category, receiptCount: keptCount + photos.length, today });
    setErrors(found);
    const first = FIELD_ORDER.find((f) => found[f]);
    if (first) {
      document.getElementById(FIELD_ID[first])?.focus();
      return;
    }
    sending.current = true;
    onSubmit({
      category: values.category,
      expenseDate: values.expenseDate,
      amount: category?.perKm ? undefined : values.amount.trim(),
      distanceKm: category?.perKm ? values.distanceKm.trim() : undefined,
      description: values.description,
      receipts: photos.map((p) => p.blob),
      removeReceiptIds: removedIds,
    });
  };

  const amountPaise = category?.perKm ? null : toPaise(values.amount);
  const estimate = category?.perKm ? estimatePerKm(values.distanceKm, category.ratePerKm) : null;
  const outlook = claimOutlook({
    category,
    amountPaise: amountPaise ?? (estimate ? toPaise(estimate) : null),
    expenseDate: values.expenseDate,
    today,
    summary: summary.data,
    excludePaise: claim && claim.category && categories.find((c) => c.code === claim.category)?.kind === 'TRAVEL' && monthOf(claim.expenseDate) === summary.data?.month ? toPaise(claim.amount) ?? 0 : 0,
  });
  const notes = outlookNotes(outlook, summary.data, values.expenseDate);
  const noRate = Boolean(category?.perKm && (!category.ratePerKm || category.ratePerKm <= 0));

  return (
    <form className="hr-form hrc-form" noValidate onSubmit={submit}>
      <div className="hr-form-grid hrc-grid">
        <Field label="What was it for?" htmlFor="claim-category" required error={errors.category}>
          <select
            id="claim-category"
            value={values.category}
            disabled={busy}
            aria-invalid={Boolean(errors.category)}
            aria-describedby={errors.category ? 'claim-category-error' : undefined}
            onChange={(e) => patch({ category: e.target.value })}
          >
            <option value="">Choose a category</option>
            {categories.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
          </select>
        </Field>

        <Field label="Expense date" htmlFor="claim-date" required error={errors.expenseDate} hint="The day you spent the money. Not in the future.">
          <input
            id="claim-date"
            type="date"
            value={values.expenseDate}
            max={today}
            disabled={busy}
            aria-invalid={Boolean(errors.expenseDate)}
            aria-describedby={errors.expenseDate ? 'claim-date-error' : 'claim-date-hint'}
            onChange={(e) => patch({ expenseDate: e.target.value })}
          />
        </Field>

        {category?.perKm ? (
          <Field
            label="Distance (km)"
            htmlFor="claim-distance"
            required
            error={errors.distanceKm}
            hint={noRate ? undefined : `Paid at ${formatRupees(category.ratePerKm)} per km.${estimate ? ` About ${formatRupees(estimate)} for ${formatKm(Number(values.distanceKm))}.` : ''}`}
          >
            <input
              id="claim-distance"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.0"
              value={values.distanceKm}
              disabled={busy}
              aria-invalid={Boolean(errors.distanceKm)}
              aria-describedby={errors.distanceKm ? 'claim-distance-error' : 'claim-distance-hint'}
              onChange={(e) => patch({ distanceKm: e.target.value })}
            />
          </Field>
        ) : category ? (
          <Field label="Amount (₹)" htmlFor="claim-amount" required error={errors.amount} hint="In rupees, at most two decimals.">
            <input
              id="claim-amount"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              value={values.amount}
              disabled={busy}
              aria-invalid={Boolean(errors.amount)}
              aria-describedby={errors.amount ? 'claim-amount-error' : 'claim-amount-hint'}
              onChange={(e) => patch({ amount: e.target.value })}
            />
          </Field>
        ) : null}

        <Field
          label="Description"
          htmlFor="claim-description"
          wide
          error={errors.description}
          hint={`Where you went and why, so the reviewer can approve quickly. ${values.description.length} of ${MAX_DESCRIPTION_LENGTH}.`}
        >
          <textarea
            id="claim-description"
            rows={3}
            maxLength={MAX_DESCRIPTION_LENGTH}
            value={values.description}
            disabled={busy}
            aria-invalid={Boolean(errors.description)}
            aria-describedby={errors.description ? 'claim-description-error' : 'claim-description-hint'}
            onChange={(e) => patch({ description: e.target.value })}
          />
        </Field>
      </div>

      {noRate && (
        <div className="hrc-note hrc-note--warn" role="status">
          HR has not set the per-km rate yet, so this category cannot be used. Ask HR, or choose another category.
        </div>
      )}

      <ReceiptPicker
        photos={photos}
        onChange={(next) => {
          setPhotos(next);
          setErrors((current) => ({ ...current, receipts: undefined }));
        }}
        disabled={busy}
        required={Boolean(category?.receiptRequired)}
        error={errors.receipts}
        claimId={claim?.claimId}
        existing={existing}
        removedIds={removedIds}
        onToggleRemoved={(id) => {
          setRemovedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
          setErrors((current) => ({ ...current, receipts: undefined }));
        }}
      />

      {summary.data && category && (
        <div className="hrc-notes" aria-live="polite">
          {outlook.overLimit && outlook.projectedTravelPaise !== null && (
            <div className="hrc-note hrc-note--warn" role="status">
              Travel for {formatMonth(summary.data.month)} would be {formatPaise(outlook.projectedTravelPaise)}, above the {formatRupeesShort(summary.data.travelLimit)} monthly limit. HR will refuse this claim. Lower the amount or claim part of it.
            </div>
          )}
          {notes.map((note) => <div key={note} className="hrc-note hrc-note--info">{note}</div>)}
          {category.kind === 'TRAVEL' && !outlook.overLimit && (
            <div className="hrc-note">
              {formatMonth(summary.data.month)}: {formatRupees(summary.data.travelUsed)} of {formatRupeesShort(summary.data.travelLimit)} travel claimed so far; {formatRupees(summary.data.travelRemaining)} left.
            </div>
          )}
          <div className="hrc-note">
            Sent today, this claim goes into the {formatMonth(summary.data.nextPayrollMonth)} payroll (claims sent by the {summary.data.cutoffDay}th count for that month).
          </div>
        </div>
      )}

      {problem && (
        <div className="uc01-admin-message uc01-admin-message--error" role="alert">{problem.message}</div>
      )}
      <div className="hr-actions hr-actions--form">
        <button type="submit" className="uc01-admin-button uc01-admin-button--primary" disabled={busy}>
          {busy ? 'Sending…' : submitLabel}
        </button>
        <button type="button" className="uc01-admin-button" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
