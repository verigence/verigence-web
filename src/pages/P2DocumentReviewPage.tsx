import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import '../styles/uc03-p2.css';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import StatusPill from '../components/StatusPill';
import AttributeEvidenceViewer, { hasBoxedEvidence } from '../features/uc03/AttributeEvidenceViewer';
import P2JourneyTabs from '../features/uc03-p2/P2JourneyTabs';
import {
  getUnifiedReviewV2,
  submitFieldCorrection,
  type ReviewV2Document,
  type ReviewV2Field,
  type ReviewV2SourceValue,
} from '../services/audit-core/uc03DocumentReviewV2';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

type Stage = 'BOOKING' | 'DELIVERY';

function displayField(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Not extracted';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  try { return JSON.stringify(value); } catch { return String(value); }
}

function confidenceLabel(value: number | null): string {
  if (value === null || value === undefined) return '—';
  return `${value.toFixed(value % 1 === 0 ? 0 : 1)}%`;
}

function source(document: ReviewV2Document, field: ReviewV2Field): ReviewV2SourceValue {
  return {
    canonicalFieldId: field.canonicalFieldId,
    fieldKey: field.fieldKey,
    value: field.value,
    confidenceScore: field.confidenceScore,
    sourceFactVersion: field.sourceFactVersion,
    reviewState: field.reviewState,
    documentId: document.documentId,
    evidenceId: document.evidenceId,
    documentTypeKey: document.documentTypeKey,
    documentLabel: document.label,
    originalFilename: document.originalFilename,
    contentUrl: document.contentUrl,
    pageNo: field.pageNo,
    evidenceRegion: field.evidenceRegion,
  };
}

export default function P2DocumentReviewPage() {
  const { journeyId = '', documentId = '' } = useParams();
  const tenantId = useProjectContextStore((s) => s.selectedProject?.tenantId);
  const accessToken = useSessionStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  const [evidence, setEvidence] = useState<ReviewV2SourceValue>();
  const [editing, setEditing] = useState<ReviewV2Field>();
  const [draft, setDraft] = useState('');
  const [remarks, setRemarks] = useState('');
  const [message, setMessage] = useState('');

  const query = useQuery({
    queryKey: ['p2-document-review', tenantId, journeyId, documentId],
    queryFn: () => getUnifiedReviewV2(tenantId!, journeyId, accessToken),
    enabled: Boolean(tenantId && journeyId && documentId && accessToken),
    staleTime: 5_000,
  });

  const selected = useMemo(() => {
    if (!query.data) return undefined;
    const booking = query.data.booking.documents.find((document) => document.documentId === documentId);
    if (booking) return { document: booking, stage: 'BOOKING' as Stage };
    const delivery = query.data.delivery.documents.find((document) => document.documentId === documentId);
    if (delivery) return { document: delivery, stage: 'DELIVERY' as Stage };
    return undefined;
  }, [documentId, query.data]);

  const correction = useMutation({
    mutationFn: async ({ field, value, note }: { field: ReviewV2Field; value: string; note: string }) => {
      if (!selected) throw new Error('Document is no longer available for review.');
      return submitFieldCorrection(
        tenantId!,
        journeyId,
        {
          stage: selected.stage,
          documentId: selected.document.documentId,
          documentTypeKey: selected.document.documentTypeKey || 'unknown',
          fieldKey: field.fieldKey,
          canonicalFieldId: field.canonicalFieldId,
          sourceFactVersion: field.sourceFactVersion,
          confidenceScore: field.confidenceScore,
          evidenceId: selected.document.evidenceId,
          originalValue: field.value,
          newValue: value,
          remarks: note.trim() || undefined,
        },
        accessToken,
      );
    },
    onSuccess: (result) => {
      setEditing(undefined);
      setDraft('');
      setRemarks('');
      setMessage(
        result.applied
          ? 'Correction saved. Journey facts will be re-evaluated from the corrected value.'
          : 'Correction submitted for Team Lead review. The original value remains effective until it is approved.',
      );
      void queryClient.invalidateQueries({ queryKey: ['p2-document-review', tenantId, journeyId, documentId] });
      void queryClient.invalidateQueries({ queryKey: ['p2-documents', tenantId, journeyId] });
      void queryClient.invalidateQueries({ queryKey: ['p2-overview', tenantId, journeyId] });
      void queryClient.invalidateQueries({ queryKey: ['p2-tasks', tenantId] });
    },
  });

  const document = selected?.document;

  return (
    <div className="screen-stack p2-screen">
      <PageHeader
        eyebrow="Phase 2 · Document Review"
        title={document?.label || 'Document'}
        description={document
          ? `${document.originalFilename} · ${selected?.stage === 'DELIVERY' ? 'Delivery' : 'Booking'}`
          : 'Loading extracted document…'}
        actions={<Link className="text-link" to={`/p2/journeys/${journeyId}/documents`}>Back to Documents</Link>}
      />
      <P2JourneyTabs />

      {query.isError ? (
        <div className="form-alert form-alert--error">
          {query.error instanceof Error ? query.error.message : 'The document could not be loaded.'}
        </div>
      ) : null}
      {!query.isLoading && query.data && !selected ? (
        <div className="form-alert form-alert--error">
          This document is not available in the current Journey review set.
        </div>
      ) : null}
      {message ? <div className="form-alert form-alert--success">{message}</div> : null}
      {correction.isError ? (
        <div className="form-alert form-alert--error">
          {correction.error instanceof Error ? correction.error.message : 'The correction could not be saved.'}
        </div>
      ) : null}

      {document ? (
        <>
          <SectionCard>
            <div className="p2-document-review-head">
              <div>
                <span className="eyebrow">Document</span>
                <strong>{document.documentTypeKey?.replaceAll('_', ' ') || 'Classification unavailable'}</strong>
              </div>
              <div>
                <span className="eyebrow">Extraction</span>
                <StatusPill value={document.extractionState} compact />
              </div>
              <div>
                <span className="eyebrow">Fields</span>
                <strong>{document.fields.length}</strong>
              </div>
              <div>
                <span className="eyebrow">Needs review</span>
                <strong>{document.fields.filter((field) => field.reviewState === 'NEEDS_REVIEW').length}</strong>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Extracted fields"
            description="Review only what needs attention. Source evidence is shown only when Document Intelligence returned a reliable location."
          >
            <div className="p2-table-wrap">
              <table className="p2-table p2-field-table">
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Effective value</th>
                    <th>Confidence</th>
                    <th>Review</th>
                    <th>Evidence</th>
                    <th aria-label="Action" />
                  </tr>
                </thead>
                <tbody>
                  {document.fields.map((field) => {
                    const fieldSource = source(document, field);
                    const highConfidence = field.confidenceScore !== null && field.confidenceScore >= 90;
                    const isEditing = editing?.canonicalFieldId === field.canonicalFieldId
                      && editing?.fieldKey === field.fieldKey
                      && editing?.sourceFactVersion === field.sourceFactVersion;
                    return [
                      <tr key={`${field.canonicalFieldId}:${field.fieldKey}:${field.sourceFactVersion}`}>
                        <td><strong>{displayField(field.fieldKey)}</strong></td>
                        <td>{displayValue(field.value)}</td>
                        <td>{confidenceLabel(field.confidenceScore)}</td>
                        <td><StatusPill value={field.reviewState} compact /></td>
                        <td>
                          {hasBoxedEvidence(fieldSource) ? (
                            <button className="p2-link-button" type="button" onClick={() => setEvidence(fieldSource)}>
                              View boxed evidence
                            </button>
                          ) : <span className="p2-muted">Location unavailable</span>}
                        </td>
                        <td className="p2-table__action">
                          <button
                            className="p2-link-button"
                            type="button"
                            onClick={() => {
                              setEditing(isEditing ? undefined : field);
                              setDraft(isEditing ? '' : displayValue(field.value) === 'Not extracted' ? '' : displayValue(field.value));
                              setRemarks('');
                              setMessage('');
                            }}
                          >
                            {isEditing ? 'Cancel' : 'Correct'}
                          </button>
                        </td>
                      </tr>,
                      isEditing ? (
                        <tr className="p2-field-edit" key={`${field.canonicalFieldId}:${field.fieldKey}:edit`}>
                          <td colSpan={6}>
                            <form
                              className="p2-field-edit__form"
                              onSubmit={(event) => {
                                event.preventDefault();
                                if (!draft.trim()) return;
                                if (highConfidence && !remarks.trim()) return;
                                correction.mutate({ field, value: draft, note: remarks });
                              }}
                            >
                              <label>
                                Corrected value
                                <input value={draft} onChange={(event) => setDraft(event.target.value)} required />
                              </label>
                              {highConfidence ? (
                                <label>
                                  Reason for correction
                                  <textarea
                                    value={remarks}
                                    onChange={(event) => setRemarks(event.target.value)}
                                    rows={2}
                                    required
                                    placeholder="Required because DI confidence is 90% or higher"
                                  />
                                </label>
                              ) : null}
                              <div className="p2-field-edit__actions">
                                <span>
                                  {highConfidence
                                    ? 'This correction requires Team Lead review before it becomes effective.'
                                    : 'This correction can be applied immediately.'}
                                </span>
                                <button
                                  type="submit"
                                  className="p2-primary-action"
                                  disabled={correction.isPending || !draft.trim() || (highConfidence && !remarks.trim())}
                                >
                                  {correction.isPending ? 'Saving…' : highConfidence ? 'Submit for Review' : 'Save Correction'}
                                </button>
                              </div>
                            </form>
                          </td>
                        </tr>
                      ) : null,
                    ];
                  })}
                  {document.fields.length === 0 ? (
                    <tr><td colSpan={6} className="p2-empty">No extracted fields are available yet.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </>
      ) : null}

      {evidence && tenantId ? (
        <AttributeEvidenceViewer
          tenantId={tenantId}
          journeyId={journeyId}
          accessToken={accessToken}
          source={evidence}
          onClose={() => setEvidence(undefined)}
        />
      ) : null}
    </div>
  );
}
