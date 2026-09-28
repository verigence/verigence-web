import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import {
  confirmP2Field,
  correctP2DocumentField,
  getP2DocumentContent,
  getP2DocumentReview,
  type P2DocumentReviewField,
  type P2Template,
} from '../../../services/audit-core/uc03P2';
import P2PagePreview, { evidenceBox, type PreviewBox } from './P2PagePreview';
import {
  confidenceTone,
  displayValue,
  editableValue,
  formatDateTime,
  humanizeKey,
  pageStatus,
  taskStatus,
} from './p2Format';

type FieldView = P2DocumentReviewField & {
  id: string;
  label: string;
  threshold: number;
  isKey: boolean;
  needsReview: boolean;
  /** Plain words for why the value needs a look, beyond its confidence. */
  why?: string;
  state: 'NEEDS_REVIEW' | 'CONFIRMED' | 'CORRECTED' | 'OK';
};

const REASON_TEXT: Record<string, string> = {
  DATE_BEFORE_FLOOR: 'Date is before this programme started. Probably misread, check the page.',
  DATE_UNREADABLE: 'Not a readable date. Check the page.',
};

function fieldId(field: P2DocumentReviewField): string {
  return `${field.canonicalFieldId}:${field.fieldKey}:${field.sourceFactVersion}`;
}

export function templateFor(templates: P2Template[], documentTypeKey: string | null | undefined): P2Template | undefined {
  if (!documentTypeKey) return undefined;
  return templates.find((t) => t.key === documentTypeKey)
    ?? templates.find((t) => t.diTypes.includes(documentTypeKey))
    ?? (documentTypeKey === 'booking_docket' ? templates.find((t) => t.key === 'booking_docket') : undefined);
}

export function buildFieldViews(fields: P2DocumentReviewField[], template?: P2Template): FieldView[] {
  const meta = new Map((template?.fields ?? []).map((field) => [field.key, field]));
  const views = fields.map((field) => {
    const info = meta.get(field.fieldKey);
    const threshold = info?.reviewThreshold ?? template?.reviewThreshold ?? 90;
    const hasValue = field.effectiveValue !== null && field.effectiveValue !== undefined && field.effectiveValue !== '';
    const lowConfidence = field.confidenceScore === null || field.confidenceScore < threshold;
    const reviewed = Boolean(field.reviewedAtUtc) || field.isModified;
    // Audit Core says why a value needs a look (a date before the programme
    // started is wrong however confident the reading); without its word the
    // confidence alone decides.
    const flagged = field.reviewReasons ? field.reviewReasons.length > 0 : lowConfidence;
    const needsReview = hasValue && flagged && !reviewed;
    const why = needsReview ? (field.reviewReasons ?? []).map((reason) => REASON_TEXT[reason]).find(Boolean) : undefined;
    return {
      ...field,
      id: fieldId(field),
      label: info?.label ?? humanizeKey(field.fieldKey),
      threshold,
      isKey: Boolean(info?.isKey),
      needsReview,
      why,
      state: field.isModified ? 'CORRECTED' : needsReview ? 'NEEDS_REVIEW' : reviewed ? 'CONFIRMED' : 'OK',
    } as FieldView;
  });
  // Review work first, least certain reading first; then key fields.
  return views.sort((a, b) => Number(b.needsReview) - Number(a.needsReview)
    || (a.needsReview && b.needsReview ? (a.confidenceScore ?? -1) - (b.confidenceScore ?? -1) : 0)
    || Number(b.isKey) - Number(a.isKey)
    || a.label.localeCompare(b.label));
}

export default function P2DocumentEditor({
  tenantId,
  journeyId,
  documentId,
  accessToken,
  templates,
  focusField,
  onClose,
  onReplace,
  onRemove,
}: {
  tenantId: string;
  journeyId: string;
  documentId: string;
  accessToken?: string;
  templates: P2Template[];
  focusField?: string;
  onClose: () => void;
  onReplace: (documentId: string) => void;
  onRemove: (documentId: string) => void;
}) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string>();
  const [editingId, setEditingId] = useState<string>();
  const [draft, setDraft] = useState('');
  const [remarks, setRemarks] = useState('');
  const [filter, setFilter] = useState<'REVIEW' | 'ALL'>('REVIEW');
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string }>();
  const [menuOpen, setMenuOpen] = useState(false);
  const rowRefs = useRef(new Map<string, HTMLLIElement>());

  const review = useQuery({
    queryKey: ['p2-document-review', tenantId, journeyId, documentId],
    queryFn: () => getP2DocumentReview(tenantId, journeyId, documentId, accessToken),
    staleTime: 5_000,
  });
  const content = useQuery({
    queryKey: ['p2-document-content', tenantId, journeyId, documentId],
    queryFn: () => getP2DocumentContent(tenantId, journeyId, documentId, accessToken),
    enabled: Boolean(review.data?.contentAvailable),
    staleTime: 5 * 60_000,
  });
  const [objectUrl, setObjectUrl] = useState<string>();
  useEffect(() => {
    if (!content.data?.blob) return undefined;
    const url = URL.createObjectURL(content.data.blob);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [content.data?.blob]);

  const template = useMemo(() => templateFor(templates, review.data?.documentTypeKey), [templates, review.data]);
  const fields = useMemo(() => buildFieldViews(review.data?.fields ?? [], template), [review.data, template]);
  const pending = fields.filter((field) => field.needsReview);
  const shown = filter === 'REVIEW' && pending.length ? pending : fields;
  const isPdf = (content.data?.contentType || '').includes('pdf')
    || (review.data?.originalFilename || '').toLowerCase().endsWith('.pdf');

  const boxes: PreviewBox[] = useMemo(() => fields.flatMap((field) => {
    const box = evidenceBox(field.evidenceRegion);
    if (!box) return [];
    return [{
      id: field.id,
      page: isPdf ? Math.max(1, field.pageNo || 1) : 1,
      box,
      label: field.label,
      tone: field.state === 'NEEDS_REVIEW' ? confidenceTone(field.confidenceScore, field.threshold) : 'success',
    }];
  }), [fields, isPdf]);

  // Land on the requested field (task deep link) or the first one needing
  // review -- only once templates are known, since thresholds decide it.
  const templatesReady = templates.length > 0;
  useEffect(() => {
    if (!fields.length || selectedId || !templatesReady) return;
    const target = (focusField && fields.find((field) => field.fieldKey === focusField)) || pending[0] || fields[0];
    if (target) {
      setSelectedId(target.id);
      if (focusField && !target.needsReview) setFilter('ALL');
    }
  }, [fields, focusField, pending, selectedId, templatesReady]);

  const select = (id: string) => {
    setSelectedId(id);
    const field = fields.find((item) => item.id === id);
    if (field && isPdf && field.pageNo) setPage(Math.max(1, field.pageNo));
    if (field && filter === 'REVIEW' && !field.needsReview) setFilter('ALL');
    window.requestAnimationFrame(() => rowRefs.current.get(id)?.scrollIntoView({ block: 'nearest' }));
  };

  const invalidate = () => {
    ['p2-document-review', 'p2-documents', 'p2-stage', 'p2-overview', 'p2-tasks'].forEach((key) =>
      void queryClient.invalidateQueries({ queryKey: [key, tenantId] }));
    void queryClient.invalidateQueries({ queryKey: ['p2-document-review', tenantId, journeyId, documentId] });
  };

  const goToNextPending = (afterId: string) => {
    const remaining = pending.filter((field) => field.id !== afterId);
    if (remaining[0]) select(remaining[0].id);
  };

  const confirm = useMutation({
    mutationFn: (field: FieldView) => confirmP2Field(tenantId, journeyId, documentId, field, accessToken),
    onSuccess: (_, field) => {
      setNotice({ tone: 'success', text: `${field.label} confirmed.` });
      goToNextPending(field.id);
      invalidate();
    },
    onError: (cause) => setNotice({ tone: 'error', text: cause instanceof Error ? cause.message : 'Could not confirm.' }),
  });

  const correct = useMutation({
    mutationFn: ({ field, value, note }: { field: FieldView; value: string; note: string }) =>
      correctP2DocumentField(tenantId, journeyId, documentId, {
        canonicalFieldId: field.canonicalFieldId,
        fieldKey: field.fieldKey,
        sourceFactVersion: field.sourceFactVersion,
        newValue: value,
        remarks: note.trim() || undefined,
      }, accessToken),
    onSuccess: (result, { field }) => {
      setEditingId(undefined);
      setNotice({
        tone: 'success',
        text: result.applied
          ? `${field.label} corrected. The audit is re-checking with the new value.`
          : `Correction sent to the Team Lead for approval. The current value stays until approved.`,
      });
      goToNextPending(field.id);
      invalidate();
    },
    onError: (cause) => setNotice({ tone: 'error', text: cause instanceof Error ? cause.message : 'Could not save.' }),
  });

  const startEdit = (field: FieldView) => {
    setEditingId(field.id);
    setDraft(editableValue(field.effectiveValue));
    setRemarks('');
    setNotice(undefined);
    select(field.id);
  };

  const document = review.data;
  const title = template?.displayName || humanizeKey(document?.documentTypeKey) || 'Document';
  const status = pageStatus(document?.processingStatus === 'PROCESSED' ? 'READY' : document?.processingStatus);

  return (
    <section className="p2w-editor" aria-label={`${title} review`}>
      <header className="p2w-editor__head">
        <button type="button" className="p2w-icon-button p2w-editor__back" onClick={onClose} aria-label="Back to documents">‹</button>
        <div className="p2w-editor__title">
          <h2>{title}</h2>
          <p>{document?.originalFilename || 'Loading…'} · <span className={`p2w-tone p2w-tone--${status.tone}`}>{status.label}</span></p>
        </div>
        <div className="p2w-editor__menu">
          <button type="button" className="p2w-button p2w-button--ghost" aria-haspopup="menu" aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}>More</button>
          {menuOpen ? (
            <div className="p2w-menu" role="menu">
              <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onReplace(documentId); }}>Replace with a new scan</button>
              <button type="button" role="menuitem" className="is-danger" onClick={() => { setMenuOpen(false); onRemove(documentId); }}>Remove from Journey…</button>
            </div>
          ) : null}
        </div>
      </header>

      {review.isError ? <div className="p2w-alert p2w-alert--error">This document could not be loaded. {review.error instanceof Error ? review.error.message : ''}</div> : null}
      {document?.diReadError ? <div className="p2w-alert">Field locations are temporarily unavailable; values can still be reviewed.</div> : null}
      {notice ? <div className={`p2w-alert p2w-alert--${notice.tone}`} role="status">{notice.text}</div> : null}

      <div className="p2w-editor__body">
        <div className="p2w-editor__preview">
          {objectUrl ? (
            <P2PagePreview sourceUrl={objectUrl} isPdf={isPdf} boxes={boxes} selectedId={selectedId}
              onSelect={select} page={page} onPageChange={setPage} />
          ) : (
            <div className="p2w-preview__message">
              {content.isLoading || review.isLoading ? 'Loading page…' : 'Page preview is not available yet.'}
            </div>
          )}
        </div>

        <div className="p2w-editor__fields">
          <div className="p2w-segment" role="tablist" aria-label="Fields">
            <button type="button" role="tab" aria-selected={filter === 'REVIEW'} className={filter === 'REVIEW' ? 'is-active' : ''}
              onClick={() => setFilter('REVIEW')}>Needs review <b>{pending.length}</b></button>
            <button type="button" role="tab" aria-selected={filter === 'ALL'} className={filter === 'ALL' ? 'is-active' : ''}
              onClick={() => setFilter('ALL')}>All fields <b>{fields.length}</b></button>
          </div>
          {filter === 'REVIEW' && !pending.length && fields.length ? (
            <p className="p2w-empty p2w-empty--success">No value on this document needs a check.</p>
          ) : null}
          {!fields.length && !review.isLoading ? <p className="p2w-empty">No fields have been extracted yet.</p> : null}

          <ul className="p2w-field-list">
            {shown.map((field) => {
              const selected = field.id === selectedId;
              const editing = field.id === editingId;
              const highConfidence = field.confidenceScore !== null && field.confidenceScore >= field.threshold;
              const tone = confidenceTone(field.confidenceScore, field.threshold);
              return (
                <li key={field.id} ref={(node) => { if (node) rowRefs.current.set(field.id, node); }}
                  className={`p2w-field${selected ? ' is-selected' : ''}${field.needsReview ? ' needs-review' : ''}`}>
                  <button type="button" className="p2w-field__main" onClick={() => select(field.id)} aria-pressed={selected}>
                    <span className="p2w-field__label">{field.label}{field.isKey ? <i aria-label="key field">•</i> : null}</span>
                    <span className="p2w-field__value">{displayValue(field.effectiveValue)}</span>
                    {field.isModified ? <span className="p2w-field__origin">Read as {displayValue(field.extractedValue)}</span> : null}
                    {field.why ? <span className="p2w-field__why">{field.why}</span> : null}
                    <span className="p2w-field__meta">
                      <span className={`p2w-chip p2w-chip--${field.needsReview ? (field.why ? 'danger' : tone) : 'success'}`}>
                        {field.confidenceScore === null ? 'No confidence' : `${Math.round(field.confidenceScore)}%`}
                      </span>
                      {field.why ? <span className="p2w-chip p2w-chip--danger">Check date</span> : null}
                      {field.state === 'CORRECTED' ? <span className="p2w-chip p2w-chip--info">Corrected</span> : null}
                      {field.state === 'CONFIRMED' ? <span className="p2w-chip p2w-chip--success">Confirmed</span> : null}
                    </span>
                  </button>
                  {editing ? (
                    <form className="p2w-field__edit" onSubmit={(event) => {
                      event.preventDefault();
                      if (!draft.trim() || (highConfidence && !remarks.trim())) return;
                      correct.mutate({ field, value: draft.trim(), note: remarks });
                    }} onKeyDown={(event) => { if (event.key === 'Escape') setEditingId(undefined); }}>
                      <label>
                        <span>Correct value</span>
                        <input autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} inputMode="text" />
                      </label>
                      {highConfidence ? (
                        <label>
                          <span>Why is the {Math.round(field.confidenceScore ?? 0)}% reading wrong? (sent to Team Lead)</span>
                          <textarea rows={2} value={remarks} onChange={(event) => setRemarks(event.target.value)} required />
                        </label>
                      ) : null}
                      <div className="p2w-field__actions">
                        <button type="button" className="p2w-button p2w-button--ghost" onClick={() => setEditingId(undefined)}>Cancel</button>
                        <button type="submit" className="p2w-button p2w-button--primary"
                          disabled={correct.isPending || !draft.trim() || (highConfidence && !remarks.trim())}>
                          {correct.isPending ? 'Saving…' : highConfidence ? 'Send for approval' : 'Save'}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="p2w-field__actions">
                      {field.needsReview ? (
                        <button type="button" className="p2w-button p2w-button--confirm" disabled={confirm.isPending}
                          onClick={() => confirm.mutate(field)}>Looks right</button>
                      ) : null}
                      <button type="button" className="p2w-button p2w-button--ghost" onClick={() => startEdit(field)}>Edit</button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {document && (document.relatedTasks.length || document.correctionHistory.length) ? (
            <details className="p2w-disclosure">
              <summary>Tasks & history</summary>
              {document.relatedTasks.length ? (
                <ul className="p2w-link-list">
                  {document.relatedTasks.map((task) => (
                    <li key={task.taskId}>
                      <Link to={`/p2/journeys/${journeyId}/tasks?task=${task.taskId}`}>{task.title}</Link>
                      <span className={`p2w-tone p2w-tone--${taskStatus(task.status).tone}`}>{taskStatus(task.status).label}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {document.correctionHistory.length ? (
                <ul className="p2w-link-list">
                  {document.correctionHistory.map((item) => (
                    <li key={`${item.fieldKey}:${item.sourceFactVersion}`}>
                      <span>{humanizeKey(item.fieldKey)}: {displayValue(item.extractedValue)} → <b>{displayValue(item.effectiveValue)}</b></span>
                      <span className="p2w-muted">{item.reviewedByActorId ? `${item.reviewedByActorId} · ` : ''}{formatDateTime(item.reviewedAtUtc)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </details>
          ) : null}
        </div>
      </div>
    </section>
  );
}
