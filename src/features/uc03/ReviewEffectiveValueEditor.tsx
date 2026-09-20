import { useEffect, useMemo, useState } from 'react';

import type {
  ReviewFieldCorrection,
  ReviewV2SourceValue,
  ReviewV2UnmappedField,
} from '../../services/audit-core/uc03DocumentReviewV2';
import '../../styles/uc03-review-effective-value.css';

export type EditableReviewSource = ReviewV2SourceValue | ReviewV2UnmappedField;

export function reviewSourceKey(source: EditableReviewSource): string {
  return `${source.documentId}:${source.canonicalFieldId}:${source.fieldKey}:${source.sourceFactVersion}`;
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

// The review API doesn't carry the canonical field's own data_type through
// to this editor (ReviewV2SourceValue/ReviewV2UnmappedField have no such
// property) -- a plain string is otherwise indistinguishable from any other
// text field. Every date field in this codebase's own naming convention
// ends in "_date" (invoice_date, receipt_date, payment_reference_date,
// coverage_start_date, coverage_end_date, delivery_date, ...), and DI always
// normalizes a date to ISO-8601 (date_dd_mm_yyyy normalization -> YYYY-MM-DD)
// before it ever reaches this value -- both together is a safe signal
// without a backend/type-plumbing change just to render the right input.
function isLikelyDateField(fieldKey: string, value: unknown): boolean {
  if (!/_date$/i.test(fieldKey)) return false;
  if (value === null || value === undefined || value === '') return true;
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return String(left) === String(right);
  }
}

function parseDraft(original: unknown, draft: string): unknown {
  if (typeof original === 'number') {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) throw new Error('Enter a valid number.');
    return parsed;
  }
  if (typeof original === 'boolean') {
    if (draft === 'true') return true;
    if (draft === 'false') return false;
    throw new Error('Choose true or false.');
  }
  if (Array.isArray(original) || (original !== null && typeof original === 'object')) {
    try {
      return JSON.parse(draft);
    } catch {
      throw new Error('Enter valid JSON for this structured value.');
    }
  }
  return draft;
}

function correctionFor(source: EditableReviewSource, effectiveValue: unknown): ReviewFieldCorrection {
  return {
    documentId: source.documentId,
    canonicalFieldId: source.canonicalFieldId,
    fieldKey: source.fieldKey,
    sourceFactVersion: source.sourceFactVersion,
    effectiveValue,
  };
}

export default function ReviewEffectiveValueEditor({
  source,
  correction,
  onChange,
  requireValue = false,
  disabled = false,
}: {
  source: EditableReviewSource;
  correction?: ReviewFieldCorrection;
  onChange: (correction: ReviewFieldCorrection | undefined) => void;
  requireValue?: boolean;
  disabled?: boolean;
}) {
  const originalText = useMemo(() => displayValue(source.value), [source.value]);
  const effectiveValue = correction?.effectiveValue ?? source.value;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(displayValue(effectiveValue));
  const [error, setError] = useState<string>();

  useEffect(() => {
    setDraft(displayValue(correction?.effectiveValue ?? source.value));
    setError(undefined);
  }, [correction?.effectiveValue, source.value]);

  const save = () => {
    try {
      const parsed = parseDraft(source.value, draft);
      if (requireValue && (parsed === null || parsed === undefined || (typeof parsed === 'string' && !parsed.trim()))) {
        throw new Error('This mapped business value cannot be empty.');
      }
      onChange(valuesEqual(parsed, source.value) ? undefined : correctionFor(source, parsed));
      setEditing(false);
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The reviewed value is not valid.');
    }
  };

  const reset = () => {
    onChange(undefined);
    setDraft(originalText);
    setEditing(false);
    setError(undefined);
  };

  return (
    <div className={`uc03-effective-value-editor ${correction ? 'is-modified' : ''}`}>
      <div className="uc03-effective-value-editor__summary">
        <span>{correction ? 'PC effective value' : 'DI effective value'}</span>
        <strong>{displayValue(effectiveValue) || 'Empty'}</strong>
        <button type="button" disabled={disabled} onClick={() => setEditing((value) => !value)}>
          {editing ? 'Close edit' : correction ? 'Edit correction' : 'Edit value'}
        </button>
        {correction ? <button type="button" disabled={disabled} onClick={reset}>Use DI value</button> : null}
      </div>
      {correction ? <small>Original DI value: {originalText || 'Empty'}</small> : null}
      {editing ? (
        <div className="uc03-effective-value-editor__form">
          {typeof source.value === 'boolean' ? (
            <select value={draft} disabled={disabled} onChange={(event) => setDraft(event.target.value)}>
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          ) : Array.isArray(source.value) || (source.value !== null && typeof source.value === 'object') ? (
            <textarea rows={5} value={draft} disabled={disabled} onChange={(event) => setDraft(event.target.value)} />
          ) : (
            <input
              type={
                isLikelyDateField(source.fieldKey, source.value) ? 'date'
                  : typeof source.value === 'number' ? 'number'
                  : 'text'
              }
              value={draft}
              disabled={disabled}
              onChange={(event) => setDraft(event.target.value)}
            />
          )}
          <button type="button" className="uc03-effective-value-editor__save" disabled={disabled} onClick={save}>Save reviewed value</button>
          {error ? <span role="alert" className="uc03-effective-value-editor__error">{error}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
