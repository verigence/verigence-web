import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';

import {
  getManualVerification,
  resolveManualVerification,
  type FieldDecision,
  type ManualVerificationField,
} from '../../services/audit-core/manualVerification';
import type { Uc03StageCode } from '../../services/audit-core/uc03Audit';
import {
  getBookingReviewV2,
  getDeliveryReviewV2,
  type ReviewV2Attribute,
  type ReviewV2SourceValue,
  type ReviewV2UnmappedField,
} from '../../services/audit-core/uc03DocumentReviewV2';
import AttributeEvidenceViewer from './AttributeEvidenceViewer';
import '../../styles/uc03-review-queue.css';

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  try { return JSON.stringify(value); } catch { return String(value); }
}

function fieldLabel(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Match a manual-verification field to its review-v2 source (for the boxed viewer).
function sourceFor(
  field: ManualVerificationField,
  diDocumentId: string,
  sources: ReviewV2SourceValue[],
): ReviewV2SourceValue | undefined {
  return sources.find(
    (s) =>
      s.documentId === diDocumentId
      && (s.fieldKey === field.fieldKey
        || (field.canonicalFieldId != null && s.canonicalFieldId === field.canonicalFieldId)),
  );
}

function CorrectField({ onCorrect }: { onCorrect: (value: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  if (!editing) {
    return (
      <button type="button" className="revq-btn revq-btn--reject" onClick={() => setEditing(true)}>
        Correct it
      </button>
    );
  }
  return (
    <form
      className="revq-mv__correct"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) onCorrect(value.trim());
      }}
    >
      <input
        type="text"
        value={value}
        autoFocus
        placeholder="Correct value"
        onChange={(e) => setValue(e.target.value)}
      />
      <button type="submit" className="revq-btn revq-btn--accept" disabled={!value.trim()}>Save</button>
    </form>
  );
}

/**
 * A MANUAL_VERIFICATION finding is Audit Core's answer to "a PC or TL needs
 * to confirm or correct a low-confidence extracted value" -- not a document
 * upload, not an accept/reject verdict, but a field-by-field check against
 * the source document. Shared between the Review Queue (where a PC/TL works
 * their queue) and the Audit Flag case view (where the same finding shows
 * up in a journey's permanent register), so both offer the same real fix
 * instead of a generic "mark fixed" that never touches the actual value.
 */
export default function ManualVerificationPanel({
  journeyId,
  flagId,
  stage,
  tenantId,
  accessToken,
  onResolved,
}: {
  journeyId: string;
  flagId: string;
  stage: Uc03StageCode;
  tenantId: string;
  accessToken?: string;
  onResolved: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [decisions, setDecisions] = useState<Record<string, FieldDecision>>({});
  const [viewer, setViewer] = useState<ReviewV2SourceValue | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mvQuery = useQuery({
    queryKey: ['mv-fields', tenantId, journeyId],
    enabled: expanded && Boolean(accessToken),
    queryFn: () => getManualVerification(tenantId, journeyId, accessToken),
  });
  const reviewQuery = useQuery<{
    attributes: ReviewV2Attribute[];
    unmappedFields: ReviewV2UnmappedField[];
  }>({
    queryKey: ['mv-review', tenantId, journeyId, stage],
    enabled: expanded && Boolean(accessToken),
    queryFn: () =>
      stage === 'DELIVERY'
        ? getDeliveryReviewV2(tenantId, journeyId, accessToken)
        : getBookingReviewV2(tenantId, journeyId, accessToken),
  });

  const finding = mvQuery.data?.items.find((i) => i.findingId === flagId);
  const sources: ReviewV2SourceValue[] = useMemo(() => {
    const data = reviewQuery.data;
    if (!data) return [];
    const fromAttrs = data.attributes.flatMap((a) => a.sources ?? []);
    const fromUnmapped: ReviewV2SourceValue[] = data.unmappedFields.map((f) => ({
      canonicalFieldId: f.canonicalFieldId,
      fieldKey: f.fieldKey,
      value: f.value,
      confidenceScore: f.confidenceScore,
      sourceFactVersion: f.sourceFactVersion,
      reviewState: f.confidenceScore != null && f.confidenceScore >= 0.9 ? 'READY' : 'NEEDS_REVIEW',
      documentId: f.documentId,
      evidenceId: null,
      documentTypeKey: f.documentTypeKey,
      documentLabel: f.documentLabel,
      originalFilename: f.originalFilename,
      contentUrl: null,
      pageNo: f.pageNo,
      evidenceRegion: f.evidenceRegion,
    }));
    return [...fromAttrs, ...fromUnmapped];
  }, [reviewQuery.data]);

  const resolveMutation = useMutation({
    mutationFn: () =>
      resolveManualVerification(
        tenantId,
        journeyId,
        flagId,
        Object.values(decisions),
        accessToken,
      ),
    onSuccess: () => {
      setError(null);
      onResolved();
    },
    onError: () => setError('That could not be saved — refresh and try again.'),
  });

  if (!expanded) {
    return (
      <button type="button" className="revq-btn revq-btn--accept" onClick={() => setExpanded(true)}>
        Verify values →
      </button>
    );
  }

  if (mvQuery.isPending || reviewQuery.isPending) {
    return <p className="revq-mv__loading">Loading the values to check…</p>;
  }
  if (!finding) {
    return <p className="revq-mv__loading">These values were already verified. Refresh to see the latest state.</p>;
  }

  const allDecided = finding.fields.every((f) => decisions[f.extractedFieldId]);

  return (
    <div className="revq-mv">
      <ul className="revq-mv__fields">
        {finding.fields.map((field) => {
          const src = sourceFor(field, finding.diDocumentId, sources);
          const decision = decisions[field.extractedFieldId];
          const confPct = field.confidence != null ? Math.round(field.confidence * 100) : null;
          return (
            <li key={field.extractedFieldId} className={decision ? 'is-done' : ''}>
              <div className="revq-mv__field">
                <span className="revq-mv__label">{fieldLabel(field.fieldKey)}</span>
                {confPct != null && <span className="revq-mv__conf">{confPct}%</span>}
              </div>
              <div className="revq-mv__value">
                {decision?.action === 'CORRECT'
                  ? displayValue(decision.effectiveValue)
                  : displayValue(field.effectiveValue ?? field.extractedValue)}
                {src && (
                  <button type="button" className="revq-mv__doc" onClick={() => setViewer(src)}>
                    View on document ↗
                  </button>
                )}
              </div>
              {!decision ? (
                <div className="revq-mv__choose">
                  <button
                    type="button"
                    className="revq-btn revq-btn--accept"
                    onClick={() =>
                      setDecisions((d) => ({
                        ...d,
                        [field.extractedFieldId]: { extractedFieldId: field.extractedFieldId, action: 'CONFIRM' },
                      }))
                    }
                  >
                    Value is right
                  </button>
                  <CorrectField
                    onCorrect={(value) =>
                      setDecisions((d) => ({
                        ...d,
                        [field.extractedFieldId]: {
                          extractedFieldId: field.extractedFieldId,
                          action: 'CORRECT',
                          effectiveValue: value,
                        },
                      }))
                    }
                  />
                </div>
              ) : (
                <button
                  type="button"
                  className="revq-mv__undo"
                  onClick={() =>
                    setDecisions((d) => {
                      const next = { ...d };
                      delete next[field.extractedFieldId];
                      return next;
                    })
                  }
                >
                  {decision.action === 'CORRECT' ? 'Corrected' : 'Confirmed'} · change
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {error && <p className="revq-mv__error" role="alert">{error}</p>}

      <div className="revq-mv__actions">
        <button type="button" className="revq-btn" onClick={() => setExpanded(false)}>Close</button>
        <button
          type="button"
          className="revq-btn revq-btn--accept"
          disabled={!allDecided || resolveMutation.isPending}
          onClick={() => resolveMutation.mutate()}
        >
          {resolveMutation.isPending ? 'Saving…' : `Verify ${finding.fields.length} value${finding.fields.length === 1 ? '' : 's'}`}
        </button>
      </div>

      {viewer && accessToken && (
        <AttributeEvidenceViewer
          tenantId={tenantId}
          journeyId={journeyId}
          accessToken={accessToken}
          source={viewer}
          onClose={() => setViewer(null)}
        />
      )}
    </div>
  );
}
