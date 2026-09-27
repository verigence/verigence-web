import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import '../styles/uc03-p2.css';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import StatusPill from '../components/StatusPill';
import P2EvidenceViewer, { hasP2BoxedEvidence } from '../features/uc03-p2/P2EvidenceViewer';
import P2JourneyTabs from '../features/uc03-p2/P2JourneyTabs';
import {
  correctP2DocumentField,
  getP2DocumentReview,
  type P2DocumentReviewField,
} from '../services/audit-core/uc03P2';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

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
  return String(value) + '%';
}

export default function P2DocumentReviewPage() {
  const { journeyId = '', documentId = '' } = useParams();
  const tenantId = useProjectContextStore((s) => s.selectedProject?.tenantId);
  const accessToken = useSessionStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  const [evidence, setEvidence] = useState<P2DocumentReviewField>();
  const [editing, setEditing] = useState<P2DocumentReviewField>();
  const [draft, setDraft] = useState('');
  const [remarks, setRemarks] = useState('');
  const [message, setMessage] = useState('');

  const query = useQuery({
    queryKey: ['p2-document-review', tenantId, journeyId, documentId],
    queryFn: () => getP2DocumentReview(tenantId!, journeyId, documentId, accessToken),
    enabled: Boolean(tenantId && journeyId && documentId && accessToken),
    staleTime: 5_000,
  });

  const correction = useMutation({
    mutationFn: async ({
      field,
      value,
      note,
    }: {
      field: P2DocumentReviewField;
      value: string;
      note: string;
    }) => correctP2DocumentField(
      tenantId!,
      journeyId,
      documentId,
      {
        canonicalFieldId: field.canonicalFieldId,
        fieldKey: field.fieldKey,
        sourceFactVersion: field.sourceFactVersion,
        newValue: value,
        remarks: note.trim() || undefined,
      },
      accessToken,
    ),
    onSuccess: (result) => {
      setEditing(undefined);
      setDraft('');
      setRemarks('');
      setMessage(
        result.applied
          ? 'Correction saved. The effective value has been updated and downstream Journey processing is re-evaluated.'
          : 'Correction submitted for Team Lead review. The current effective value remains unchanged until approval.',
      );
      void queryClient.invalidateQueries({ queryKey: ['p2-document-review', tenantId, journeyId, documentId] });
      void queryClient.invalidateQueries({ queryKey: ['p2-documents', tenantId, journeyId] });
      void queryClient.invalidateQueries({ queryKey: ['p2-overview', tenantId, journeyId] });
      void queryClient.invalidateQueries({ queryKey: ['p2-tasks', tenantId] });
    },
  });

  const document = query.data;
  const needsReview = document?.fields.filter((field) => field.confidenceScore === null || field.confidenceScore < 90).length ?? 0;
  const modified = document?.fields.filter((field) => field.isModified).length ?? 0;

  return (
    <div className="screen-stack p2-screen">
      <PageHeader
        eyebrow="Phase 2 · Document Review"
        title={document?.documentTypeKey?.replaceAll('_', ' ') || 'Document'}
        description={document
          ? document.originalFilename + ' · ' + document.stage
          : 'Loading extracted document…'}
        actions={<Link className="text-link" to={'/p2/journeys/' + journeyId + '/documents'}>Back to Documents</Link>}
      />
      <P2JourneyTabs />

      {query.isError ? (
        <div className="form-alert form-alert--error">
          {query.error instanceof Error ? query.error.message : 'The document could not be loaded.'}
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
                <strong>{document.originalFilename}</strong>
              </div>
              <div>
                <span className="eyebrow">Processing</span>
                <StatusPill value={document.processingStatus || 'READY'} compact />
              </div>
              <div>
                <span className="eyebrow">Fields</span>
                <strong>{document.fields.length}</strong>
              </div>
              <div>
                <span className="eyebrow">Attention</span>
                <strong>{needsReview} review · {modified} corrected</strong>
              </div>
            </div>
            {document.diReadError ? (
              <div className="p2-review-warning">
                Live DI field locations are temporarily unavailable. Durable Audit Core values are still shown; boxed evidence will return when DI recovers.
              </div>
            ) : null}
          </SectionCard>

          <SectionCard
            title="Extracted fields"
            description="Focus on values that require attention. Original extraction is retained even when an effective value is corrected."
          >
            <div className="p2-table-wrap">
              <table className="p2-table p2-field-table">
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Effective value</th>
                    <th>Confidence</th>
                    <th>State</th>
                    <th>Evidence</th>
                    <th aria-label="Action" />
                  </tr>
                </thead>
                <tbody>
                  {document.fields.map((field) => {
                    const highConfidence = field.confidenceScore !== null && field.confidenceScore >= 90;
                    const lowConfidence = field.confidenceScore === null || field.confidenceScore < 90;
                    const isEditing = editing?.canonicalFieldId === field.canonicalFieldId
                      && editing?.fieldKey === field.fieldKey
                      && editing?.sourceFactVersion === field.sourceFactVersion;
                    const state = field.isModified ? 'CORRECTED' : lowConfidence ? 'NEEDS_REVIEW' : 'READY';

                    return [
                      <tr key={field.canonicalFieldId + ':' + field.fieldKey + ':' + field.sourceFactVersion}>
                        <td>
                          <strong>{displayField(field.fieldKey)}</strong>
                          {field.isModified ? <small>DI: {displayValue(field.extractedValue)}</small> : null}
                        </td>
                        <td>{displayValue(field.effectiveValue)}</td>
                        <td>{confidenceLabel(field.confidenceScore)}</td>
                        <td><StatusPill value={state} compact /></td>
                        <td>
                          {hasP2BoxedEvidence(field, document.originalFilename) && document.contentAvailable ? (
                            <button className="p2-link-button" type="button" onClick={() => setEvidence(field)}>
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
                              setDraft(isEditing ? '' : displayValue(field.effectiveValue) === 'Not extracted' ? '' : displayValue(field.effectiveValue));
                              setRemarks('');
                              setMessage('');
                            }}
                          >
                            {isEditing ? 'Cancel' : 'Correct'}
                          </button>
                        </td>
                      </tr>,
                      isEditing ? (
                        <tr className="p2-field-edit" key={field.canonicalFieldId + ':' + field.fieldKey + ':edit'}>
                          <td colSpan={6}>
                            <form
                              className="p2-field-edit__form"
                              onSubmit={(event) => {
                                event.preventDefault();
                                if (!draft.trim()) return;
                                if (highConfidence && !remarks.trim()) return;
                                correction.mutate({ field, value: draft.trim(), note: remarks });
                              }}
                            >
                              <label>
                                Corrected value
                                <input value={draft} onChange={(event) => setDraft(event.target.value)} required />
                              </label>
                              <label>
                                Remarks{highConfidence ? ' — required for high-confidence extraction' : ''}
                                <textarea
                                  value={remarks}
                                  onChange={(event) => setRemarks(event.target.value)}
                                  rows={2}
                                  required={highConfidence}
                                  placeholder={highConfidence ? 'Explain why the high-confidence extraction is incorrect' : 'Optional comment'}
                                />
                              </label>
                              <div className="p2-field-edit__actions">
                                <span>
                                  {highConfidence
                                    ? 'A Team Lead task will be created; the current value remains effective until approval.'
                                    : 'Low-confidence correction is applied immediately and retained in the audit trail.'}
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

      {evidence && document && tenantId ? (
        <P2EvidenceViewer
          tenantId={tenantId}
          journeyId={journeyId}
          documentId={documentId}
          originalFilename={document.originalFilename}
          accessToken={accessToken}
          field={evidence}
          onClose={() => setEvidence(undefined)}
        />
      ) : null}
    </div>
  );
}
