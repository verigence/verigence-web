import { useMemo, useState } from 'react';

import type {
  P2ChecklistItem,
  P2DocumentBatch,
  P2DocumentLineage,
  P2DocumentPage,
  P2Template,
} from '../../../services/audit-core/uc03P2';
import { humanizeKey, pageStatus, PAGE_IN_FLIGHT, type Tone } from './p2Format';

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

const NOT_IDENTIFIED = new Set(['QUEUED', 'PREPARING_PAGE', 'DI_UPLOAD_PREPARING', 'DI_UPLOADING', 'DI_FINALIZING', 'CLASSIFYING', 'RETRY_WAIT']);
const FAILED = new Set(['FAILED', 'DEAD_LETTER']);

/** Uploaded -> Identified -> Read, for one document card. */
export function DocumentProgress({ status }: { status: string }) {
  const identified = !NOT_IDENTIFIED.has(status) && !FAILED.has(status);
  const read = status === 'READY';
  const steps: Array<[string, 'done' | 'active' | 'todo' | 'failed' | 'skipped']> = [
    ['Uploaded', 'done'],
    ['Identified', identified ? 'done' : FAILED.has(status) ? 'failed' : 'active'],
    ['Read', read ? 'done' : status === 'SUPPORTING' ? 'skipped' : status === 'NEEDS_REVIEW' ? 'failed'
      : identified ? 'active' : 'todo'],
  ];
  return (
    <ol className="p2w-progress" aria-label="Document progress">
      {steps.map(([label, state]) => (
        <li key={label} className={`is-${state}`}>
          <span aria-hidden="true">{state === 'done' ? '✓' : state === 'failed' ? '!' : state === 'skipped' ? '–' : ''}</span>
          {label}{state === 'skipped' ? ' (supporting)' : ''}
        </li>
      ))}
    </ol>
  );
}

export type ChecklistRequirement = {
  key: string;
  stage: P2ChecklistItem['stage'];
  label: string;
  requirement: P2ChecklistItem['requirement'];
  conditional: boolean;
  reason?: string | null;
  status: 'RECEIVED' | 'MISSING';
  documentIds: string[];
  /** Every template that meets this requirement (a group lists each member). */
  templateKeys: string[];
};

/** One row per requirement: documents of a group ("PAN Card or Aadhaar")
 * are one requirement that any of them meets. */
export function checklistRequirements(checklist: P2ChecklistItem[]): ChecklistRequirement[] {
  const byKey = new Map<string, ChecklistRequirement>();
  for (const item of checklist) {
    const key = `${item.stage}:${item.group ?? item.templateKey}`;
    const received = item.status !== 'MISSING';
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        key, stage: item.stage, label: item.groupLabel || item.displayName, requirement: item.requirement,
        conditional: Boolean(item.conditional), reason: item.reason, status: received ? 'RECEIVED' : 'MISSING',
        documentIds: item.status === 'RECEIVED' ? [...item.documentIds] : [],
        templateKeys: [item.templateKey],
      });
      continue;
    }
    if (received) existing.status = 'RECEIVED';
    if (item.status === 'RECEIVED') existing.documentIds.push(...item.documentIds);
    existing.conditional = existing.conditional || Boolean(item.conditional);
    existing.reason = existing.reason || item.reason;
    if (!existing.templateKeys.includes(item.templateKey)) existing.templateKeys.push(item.templateKey);
  }
  return [...byKey.values()];
}

/** Which uploaded document answers which requirement. A document that has
 * been read is matched by id; one still being identified or read is matched
 * by the type it was identified as. Whatever matches nothing (a supporting
 * document, a page not yet identified) is listed as an other upload. */
export function assignRowsToRequirements(
  requirements: ChecklistRequirement[],
  rows: DocumentRow[],
): { matched: Map<string, DocumentRow[]>; other: DocumentRow[] } {
  const matched = new Map<string, DocumentRow[]>();
  const used = new Set<string>();
  for (const requirement of requirements) {
    const mine = rows.filter((row) => !used.has(row.key) && (
      (row.documentId && requirement.documentIds.includes(row.documentId))
      || (row.templateKey && requirement.templateKeys.includes(row.templateKey)
        && (!row.stage || row.stage === requirement.stage))
    ));
    mine.forEach((row) => used.add(row.key));
    matched.set(requirement.key, mine);
  }
  return { matched, other: rows.filter((row) => !used.has(row.key)) };
}

type CardState = 'missing' | 'progress' | 'review' | 'ready' | 'failed';

function cardState(tone: Tone, status: string): CardState {
  if (FAILED.has(status) || tone === 'danger') return 'failed';
  if (tone === 'success') return 'ready';
  if (tone === 'warning' || status === 'NEEDS_REVIEW') return 'review';
  return 'progress';
}

/** The row that best describes a requirement's state: something failed
 * beats something to check beats something in progress beats done. */
function leadRow(rows: DocumentRow[]): DocumentRow {
  const rank = (row: DocumentRow) => {
    const state = cardState(pageStatus(row.status).tone, row.status);
    return state === 'failed' ? 0 : state === 'review' ? 1 : state === 'progress' ? 2 : 3;
  };
  return [...rows].sort((a, b) => rank(a) - rank(b))[0];
}

type RowActions = {
  selectedDocumentId?: string;
  busyKey?: string;
  typing?: string;
  typeOptions: P2Template[];
  onOpen: (documentId: string) => void;
  onRetry: (queueId: string) => void;
  onSetType: (queueId: string, templateKey: string) => void;
  setTyping: (key?: string) => void;
};

function RowBody({ row, actions, expanded, onToggle }: {
  row: DocumentRow; actions: RowActions; expanded: boolean; onToggle: () => void;
}) {
  const status = pageStatus(row.status);
  const openable = Boolean(row.documentId) && ['READY', 'NEEDS_REVIEW', 'SUPPORTING'].includes(row.status);
  const retryable = row.unit && ['FAILED', 'DEAD_LETTER'].includes(row.status);
  const typeable = row.unit && ['SUPPORTING', 'NEEDS_REVIEW'].includes(row.status);
  const busy = actions.busyKey === row.key;
  const hasMembers = row.memberPages.length > 1;
  return (
    <>
      <button type="button" className="p2w-reqcard__open" disabled={!openable}
        onClick={() => row.documentId && actions.onOpen(row.documentId)}
        aria-current={row.documentId && row.documentId === actions.selectedDocumentId ? 'true' : undefined}
        aria-label={openable ? `Open ${row.name}` : undefined}>
        <strong>{row.name}</strong>
        <span>{row.subtitle}</span>
      </button>
      <span className={`p2w-chip p2w-chip--${status.tone}`}>
        {PAGE_IN_FLIGHT.has(row.status) ? <i className="p2w-spinner" aria-hidden="true" /> : null}
        {status.label}
      </span>
      <DocumentProgress status={row.status} />
      {row.reason ? <p className="p2w-reqcard__why">{row.reason}</p> : null}
      {actions.typing === row.key && row.unit ? (
        <div className="p2w-doc__type">
          <label>
            <span>What is this document?</span>
            <select defaultValue="" onChange={(event) => {
              if (event.target.value && row.unit) {
                actions.onSetType(row.unit.queueId, event.target.value);
                actions.setTyping(undefined);
              }
            }}>
              <option value="" disabled>Choose a type…</option>
              {actions.typeOptions.map((option) => <option key={option.key} value={option.key}>{option.displayName}</option>)}
            </select>
          </label>
          <button type="button" className="p2w-link" onClick={() => actions.setTyping(undefined)}>Cancel</button>
        </div>
      ) : null}
      <div className="p2w-reqcard__actions">
        {openable ? (
          <button type="button" className="p2w-button p2w-button--secondary" onClick={() => row.documentId && actions.onOpen(row.documentId)}>
            {row.status === 'NEEDS_REVIEW' ? 'Check' : 'Open'}
          </button>
        ) : null}
        {retryable ? (
          <button type="button" className="p2w-button p2w-button--primary" disabled={busy}
            onClick={() => actions.onRetry(row.unit!.queueId)}>{busy ? 'Retrying…' : 'Retry'}</button>
        ) : null}
        {typeable && actions.typing !== row.key ? (
          <button type="button" className="p2w-button p2w-button--ghost" onClick={() => actions.setTyping(row.key)}>Set type</button>
        ) : null}
        {hasMembers ? (
          <button type="button" className="p2w-link" aria-expanded={expanded} onClick={onToggle}>
            {expanded ? 'Hide pages' : `${row.memberPages.length} pages`}
          </button>
        ) : null}
      </div>
      {hasMembers && expanded ? (
        <ul className="p2w-reqcard__pages">
          {row.memberPages.map((page) => (
            <li key={page.queueId}>Page {page.page_number} · {page.classified_document_type ? humanizeKey(page.classified_document_type) : 'unclassified'}</li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

export default function P2DocumentList({
  rows,
  checklist,
  templates,
  selectedDocumentId,
  onOpen,
  onRetry,
  onSetType,
  onAdd,
  busyKey,
}: {
  rows: DocumentRow[];
  checklist: P2ChecklistItem[];
  templates: P2Template[];
  selectedDocumentId?: string;
  onOpen: (documentId: string) => void;
  onRetry: (queueId: string) => void;
  onSetType: (queueId: string, templateKey: string) => void;
  /** Opens the file picker for a document that is still missing. */
  onAdd?: () => void;
  busyKey?: string;
}) {
  const [stage, setStage] = useState<'BOOKING' | 'DELIVERY'>(() =>
    checklist.some((item) => item.stage === 'DELIVERY' && item.status !== 'MISSING') ? 'DELIVERY' : 'BOOKING');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [typing, setTyping] = useState<string>();
  const typeOptions = useMemo(
    () => templates.filter((t) => t.requirement !== 'SUPPORTING' || t.key === 'upi_screenshot')
      .filter((t) => t.diTypes.length)
      .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [templates],
  );
  const requirements = useMemo(() => checklistRequirements(checklist), [checklist]);
  const { matched, other } = useMemo(() => assignRowsToRequirements(requirements, rows), [requirements, rows]);
  const stageItems = requirements.filter((item) => item.stage === stage);
  const otherHere = other.filter((row) => !row.stage || row.stage === stage);
  const missingRequired = stageItems.filter((item) => item.status === 'MISSING' && !matched.get(item.key)?.length && item.requirement !== 'OPTIONAL');
  const toggle = (key: string) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const actions: RowActions = { selectedDocumentId, busyKey, typing, typeOptions, onOpen, onRetry, onSetType, setTyping };

  return (
    <div className="p2w-list">
      <div className="p2w-segment" role="tablist" aria-label="Stage">
        {(['BOOKING', 'DELIVERY'] as const).map((code) => {
          const items = requirements.filter((item) => item.stage === code && item.requirement !== 'OPTIONAL');
          const received = items.filter((item) => item.status === 'RECEIVED' || matched.get(item.key)?.length).length;
          return (
            <button key={code} type="button" role="tab" aria-selected={stage === code}
              className={stage === code ? 'is-active' : ''} onClick={() => setStage(code)}>
              {humanizeKey(code)} <b>{received}/{items.length}</b>
            </button>
          );
        })}
      </div>

      <section className="p2w-reqsection" aria-label={`${humanizeKey(stage)} documents`}>
        <ul className="p2w-reqgrid">
          {stageItems.map((item) => {
            const mine = matched.get(item.key) ?? [];
            const lead = mine.length ? leadRow(mine) : undefined;
            const state: CardState = lead ? cardState(pageStatus(lead.status).tone, lead.status) : 'missing';
            const optional = item.requirement === 'OPTIONAL';
            const selected = mine.some((row) => row.documentId && row.documentId === selectedDocumentId);
            return (
              <li key={item.key} className={`p2w-reqcard is-${state}${optional ? ' is-optional' : ' is-required'}${selected ? ' is-selected' : ''}`}>
                <div className="p2w-reqcard__head">
                  <span className="p2w-reqcard__label">{item.label}</span>
                  {item.conditional && item.requirement === 'REQUIRED' ? <span className="p2w-reqcard__tag">Needed for this deal</span>
                    : optional ? <span className="p2w-reqcard__tag p2w-reqcard__tag--optional">Optional</span> : null}
                </div>
                {lead ? (
                  <RowBody row={lead} actions={actions} expanded={expanded.has(lead.key)} onToggle={() => toggle(lead.key)} />
                ) : (
                  <div className="p2w-reqcard__missing">
                    <strong>Not received</strong>
                    {item.reason ? <p className="p2w-reqcard__why">{item.reason}</p> : null}
                    {onAdd ? (
                      <div className="p2w-reqcard__actions">
                        <button type="button" className={`p2w-button ${optional ? 'p2w-button--ghost' : 'p2w-button--secondary'}`} onClick={onAdd}>Add</button>
                      </div>
                    ) : null}
                  </div>
                )}
                {mine.length > 1 && lead ? (
                  <ul className="p2w-reqcard__more" aria-label="More documents for this requirement">
                    {mine.filter((row) => row !== lead).map((row) => {
                      const status = pageStatus(row.status);
                      const openable = Boolean(row.documentId) && ['READY', 'NEEDS_REVIEW', 'SUPPORTING'].includes(row.status);
                      return (
                        <li key={row.key}>
                          <button type="button" className="p2w-reqcard__open" disabled={!openable}
                            onClick={() => row.documentId && onOpen(row.documentId)}>
                            <strong>{row.name}</strong>
                            <span>{row.subtitle}</span>
                          </button>
                          <span className={`p2w-chip p2w-chip--${status.tone}`}>{status.label}</span>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
        {missingRequired.length ? (
          <p className="p2w-muted">{missingRequired.length} required document{missingRequired.length === 1 ? '' : 's'} still to upload.</p>
        ) : null}
      </section>

      {otherHere.length ? (
        <section className="p2w-reqsection" aria-label="Other uploads">
          <h3>Other uploads</h3>
          <ul className="p2w-reqgrid">
            {otherHere.map((row) => {
              const state = cardState(pageStatus(row.status).tone, row.status);
              const selected = Boolean(row.documentId && row.documentId === selectedDocumentId);
              return (
                <li key={row.key} className={`p2w-reqcard is-${state}${selected ? ' is-selected' : ''}`}>
                  <div className="p2w-reqcard__head">
                    <span className="p2w-reqcard__label">{PAGE_IN_FLIGHT.has(row.status) ? 'Being identified' : row.status === 'SUPPORTING' ? 'Supporting' : 'Upload'}</span>
                  </div>
                  <RowBody row={row} actions={actions} expanded={expanded.has(row.key)} onToggle={() => toggle(row.key)} />
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {!rows.length && !stageItems.length ? <p className="p2w-empty">Nothing uploaded yet. Add the booking documents above.</p> : null}
    </div>
  );
}
