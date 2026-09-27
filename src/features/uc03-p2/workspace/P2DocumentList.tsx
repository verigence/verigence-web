import { useMemo, useState } from 'react';

import type {
  P2ChecklistItem,
  P2DocumentBatch,
  P2DocumentLineage,
  P2DocumentPage,
  P2Template,
} from '../../../services/audit-core/uc03P2';
import { humanizeKey, pageStatus, PAGE_IN_FLIGHT } from './p2Format';

export type DocumentRow = {
  key: string;
  unit?: P2DocumentPage;
  batch?: P2DocumentBatch;
  memberPages: P2DocumentPage[];
  documentId?: string;
  name: string;
  subtitle: string;
  status: string;
  reason?: string | null;
  stage?: string | null;
  templateKey?: string | null;
};

function pagesLabel(unit: P2DocumentPage, batch: P2DocumentBatch): string {
  const numbers = unit.pageNumbers?.length ? unit.pageNumbers : [unit.page_number];
  if ((batch.page_count || 1) <= 1) return batch.original_filename;
  const label = numbers.length > 1 ? `pages ${numbers.join(', ')}` : `page ${numbers[0]}`;
  return `${batch.original_filename} · ${label}`;
}

export function buildDocumentRows(
  batches: P2DocumentBatch[],
  lineage: P2DocumentLineage[],
): DocumentRow[] {
  const rows: DocumentRow[] = [];
  const seenDocuments = new Set<string>();
  for (const batch of batches) {
    const units = batch.documents ?? batch.pages
      .filter((page) => page.queue_status !== 'MERGED')
      .map((page) => ({ ...page, memberPages: [] as P2DocumentPage[] }));
    if (!units.length) {
      rows.push({
        key: `batch:${batch.batchId}`, batch, memberPages: [], name: batch.original_filename,
        subtitle: batch.batch_status === 'SPLITTING' ? 'Splitting pages…' : 'Uploading…',
        status: batch.batch_status === 'FAILED' ? 'FAILED' : 'QUEUED',
      });
      continue;
    }
    for (const unit of units) {
      if (unit.diDocumentId) seenDocuments.add(unit.diDocumentId);
      rows.push({
        key: unit.queueId,
        unit,
        batch,
        memberPages: unit.memberPages ?? [],
        documentId: unit.diDocumentId,
        name: unit.displayName
          || (unit.classified_document_type ? humanizeKey(unit.classified_document_type) : PAGE_IN_FLIGHT.has(unit.queue_status) ? 'Identifying document…' : 'Document'),
        subtitle: pagesLabel(unit, batch),
        status: unit.queue_status,
        reason: unit.status_reason || (unit.queue_status === 'FAILED' ? unit.last_error : null),
        stage: unit.business_stage,
        templateKey: unit.templateKey,
      });
    }
  }
  for (const document of lineage) {
    if (document.association_status !== 'ACTIVE' || seenDocuments.has(document.documentId)) continue;
    rows.push({
      key: `evidence:${document.evidenceId}`, memberPages: [], documentId: document.documentId,
      name: document.displayName || humanizeKey(document.document_type_key) || 'Document',
      subtitle: document.original_filename || 'Earlier upload',
      status: 'READY', stage: document.process_area, templateKey: document.templateKey,
    });
  }
  return rows;
}

export default function P2DocumentList({
  rows,
  checklist,
  templates,
  selectedDocumentId,
  onOpen,
  onRetry,
  onSetType,
  busyKey,
}: {
  rows: DocumentRow[];
  checklist: P2ChecklistItem[];
  templates: P2Template[];
  selectedDocumentId?: string;
  onOpen: (documentId: string) => void;
  onRetry: (queueId: string) => void;
  onSetType: (queueId: string, templateKey: string) => void;
  busyKey?: string;
}) {
  const [stage, setStage] = useState<'BOOKING' | 'DELIVERY'>(() =>
    checklist.some((item) => item.stage === 'DELIVERY' && item.status === 'RECEIVED') ? 'DELIVERY' : 'BOOKING');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [typing, setTyping] = useState<string>();
  const typeOptions = useMemo(
    () => templates.filter((t) => t.requirement !== 'SUPPORTING' || t.key === 'upi_screenshot')
      .filter((t) => t.diTypes.length)
      .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [templates],
  );
  const stageItems = checklist.filter((item) => item.stage === stage);
  const missingRequired = stageItems.filter((item) => item.status === 'MISSING' && item.requirement !== 'OPTIONAL');

  return (
    <div className="p2w-list">
      <section className="p2w-checklist" aria-label="Document checklist">
        <div className="p2w-segment" role="tablist">
          {(['BOOKING', 'DELIVERY'] as const).map((code) => {
            const items = checklist.filter((item) => item.stage === code && item.requirement !== 'OPTIONAL');
            const received = items.filter((item) => item.status === 'RECEIVED').length;
            return (
              <button key={code} type="button" role="tab" aria-selected={stage === code}
                className={stage === code ? 'is-active' : ''} onClick={() => setStage(code)}>
                {humanizeKey(code)} <b>{received}/{items.length}</b>
              </button>
            );
          })}
        </div>
        <ul className="p2w-checklist__items">
          {stageItems.map((item) => (
            <li key={item.templateKey} className={`is-${item.status.toLowerCase()} is-${item.requirement.toLowerCase()}`}>
              <span aria-hidden="true">{item.status === 'RECEIVED' ? '✓' : item.requirement === 'OPTIONAL' ? '○' : '!'}</span>
              {item.status === 'RECEIVED' && item.documentIds[0] ? (
                <button type="button" className="p2w-link" onClick={() => onOpen(item.documentIds[0])}>{item.displayName}</button>
              ) : (
                <span>{item.displayName}{item.requirement === 'OPTIONAL' ? ' (optional)' : ''}</span>
              )}
            </li>
          ))}
        </ul>
        {missingRequired.length ? (
          <p className="p2w-muted">{missingRequired.length} required document{missingRequired.length === 1 ? '' : 's'} still to upload.</p>
        ) : null}
      </section>

      <ul className="p2w-docs" aria-label="Uploaded documents">
        {rows.map((row) => {
          const status = pageStatus(row.status);
          const selected = Boolean(row.documentId && row.documentId === selectedDocumentId);
          const openable = Boolean(row.documentId) && ['READY', 'NEEDS_REVIEW', 'SUPPORTING'].includes(row.status);
          const retryable = row.unit && ['FAILED', 'DEAD_LETTER'].includes(row.status);
          const typeable = row.unit && ['SUPPORTING', 'NEEDS_REVIEW'].includes(row.status);
          const busy = busyKey === row.key;
          const hasMembers = row.memberPages.length > 1;
          return (
            <li key={row.key} className={`p2w-doc${selected ? ' is-selected' : ''} p2w-doc--${status.tone}`}>
              <div className="p2w-doc__main">
                <button type="button" className="p2w-doc__open" disabled={!openable}
                  onClick={() => row.documentId && onOpen(row.documentId)} aria-current={selected || undefined}
                  aria-label={openable ? `Open ${row.name}` : undefined}>
                  <strong>{row.name}</strong>
                  <span>{row.subtitle}</span>
                </button>
                <span className={`p2w-chip p2w-chip--${status.tone}`}>
                  {PAGE_IN_FLIGHT.has(row.status) ? <i className="p2w-spinner" aria-hidden="true" /> : null}
                  {status.label}
                </span>
                {openable ? <span className="p2w-doc__chevron" aria-hidden="true">›</span> : null}
              </div>
              {row.reason ? <p className="p2w-doc__reason">{row.reason}</p> : null}
              {typing === row.key && row.unit ? (
                <div className="p2w-doc__type">
                  <label>
                    <span>What is this document?</span>
                    <select defaultValue="" onChange={(event) => {
                      if (event.target.value && row.unit) {
                        onSetType(row.unit.queueId, event.target.value);
                        setTyping(undefined);
                      }
                    }}>
                      <option value="" disabled>Choose a type…</option>
                      {typeOptions.map((option) => <option key={option.key} value={option.key}>{option.displayName}</option>)}
                    </select>
                  </label>
                  <button type="button" className="p2w-link" onClick={() => setTyping(undefined)}>Cancel</button>
                </div>
              ) : null}
              <div className="p2w-doc__actions">
                {retryable ? (
                  <button type="button" className="p2w-button p2w-button--primary" disabled={busy}
                    onClick={() => onRetry(row.unit!.queueId)}>{busy ? 'Retrying…' : 'Retry'}</button>
                ) : null}
                {typeable && typing !== row.key ? (
                  <button type="button" className="p2w-button p2w-button--secondary" onClick={() => setTyping(row.key)}>
                    Set type
                  </button>
                ) : null}
                {hasMembers ? (
                  <button type="button" className="p2w-link" aria-expanded={expanded.has(row.key)} onClick={() =>
                    setExpanded((current) => {
                      const next = new Set(current);
                      if (next.has(row.key)) next.delete(row.key); else next.add(row.key);
                      return next;
                    })}>
                    {expanded.has(row.key) ? 'Hide pages' : `${row.memberPages.length} pages`}
                  </button>
                ) : null}
              </div>
              {hasMembers && expanded.has(row.key) ? (
                <ul className="p2w-doc__pages">
                  {row.memberPages.map((page) => (
                    <li key={page.queueId}>Page {page.page_number} · {page.classified_document_type ? humanizeKey(page.classified_document_type) : 'unclassified'}</li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
        {!rows.length ? <li className="p2w-empty">Nothing uploaded yet. Add the booking documents above.</li> : null}
      </ul>
    </div>
  );
}
