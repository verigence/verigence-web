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

const FAILED = new Set(['FAILED', 'DEAD_LETTER']);
const OPENABLE = new Set(['READY', 'NEEDS_REVIEW', 'SUPPORTING']);

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
  if (tone === 'success' || tone === 'info') return 'ready';
  if (tone === 'warning' || status === 'NEEDS_REVIEW') return 'review';
  return 'progress';
}

/** The status line of a card, in three plain words: a document is missing,
 * uploaded (still being read), or extracted (read; "check" when a value
 * needs a look). */
function stateLabel(state: CardState, status: string): string {
  switch (state) {
    case 'missing': return 'Missing';
    case 'ready': return status === 'SUPPORTING' ? 'Uploaded · supporting' : 'Extracted';
    case 'review': return 'Extracted · check';
    case 'failed': return 'Failed';
    default: return `Uploaded · ${pageStatus(status).label.toLowerCase()}…`;
  }
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

/**
 * One document card, the way the Phase 1 capture screen showed them: the
 * document's name, a status dot, and nothing else unless something needs
 * doing. Tapping the card opens the document.
 */
function DocumentCard({ title, level, rows, reason, actions, onAdd }: {
  title: string;
  /** How the card is marked: required (navy), conditional (teal), optional
   * (mint, tagged), or an extra upload that answers no requirement. */
  level: 'required' | 'conditional' | 'optional' | 'extra';
  rows: DocumentRow[];
  reason?: string | null;
  actions: RowActions;
  onAdd?: () => void;
}) {
  const lead = rows.length ? leadRow(rows) : undefined;
  const state: CardState = lead ? cardState(pageStatus(lead.status).tone, lead.status) : 'missing';
  const selected = rows.some((row) => row.documentId && row.documentId === actions.selectedDocumentId);
  const openable = Boolean(lead?.documentId && OPENABLE.has(lead.status));
  const retryable = Boolean(lead?.unit && FAILED.has(lead.status));
  const typeable = Boolean(lead?.unit && ['SUPPORTING', 'NEEDS_REVIEW'].includes(lead.status));
  const busy = Boolean(lead && actions.busyKey === lead.key);
  const why = lead?.reason || (!lead ? reason : null);
  const more = lead ? rows.filter((row) => row !== lead) : [];
  // What was received, unless the title already says it.
  const file = lead ? [lead.name !== title ? lead.name : '', lead.subtitle !== title ? lead.subtitle : ''].filter(Boolean).join(' · ') : '';

  const open = () => {
    if (lead?.documentId && openable) actions.onOpen(lead.documentId);
    else if (!lead && onAdd) onAdd();
  };
  const clickable = openable || (!lead && Boolean(onAdd));

  return (
    <li className={`p2w-dcard is-${state} is-${level}${selected ? ' is-selected' : ''}`}>
      <button type="button" className="p2w-dcard__main" disabled={!clickable} onClick={open}
        aria-current={selected ? 'true' : undefined}
        aria-label={!lead ? `Add ${title}` : openable ? `Open ${title}` : undefined}>
        <span className="p2w-dcard__head">
          <strong className="p2w-dcard__name">{title}</strong>
          {level === 'optional' ? <em className="p2w-dcard__level">Optional</em> : null}
        </span>
        {file ? <span className="p2w-dcard__file">{file}</span> : null}
        <span className="p2w-dcard__status">
          {state === 'progress' ? <i className="p2w-spinner" aria-hidden="true" /> : <i className="p2w-dcard__dot" aria-hidden="true" />}
          {stateLabel(state, lead?.status ?? '')}
          {!lead && onAdd ? <b className="p2w-dcard__add">+ Add</b> : null}
        </span>
        {why ? <span className="p2w-dcard__why">{why}</span> : null}
      </button>

      {lead && actions.typing === lead.key && lead.unit ? (
        <div className="p2w-doc__type">
          <label>
            <span>What is this document?</span>
            <select defaultValue="" onChange={(event) => {
              if (event.target.value && lead.unit) {
                actions.onSetType(lead.unit.queueId, event.target.value);
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

      {(retryable || (typeable && actions.typing !== lead?.key) || more.length) ? (
        <div className="p2w-dcard__actions">
          {retryable && lead?.unit ? (
            <button type="button" className="p2w-link" disabled={busy} onClick={() => actions.onRetry(lead.unit!.queueId)}>
              {busy ? 'Retrying…' : 'Retry'}
            </button>
          ) : null}
          {typeable && lead && actions.typing !== lead.key ? (
            <button type="button" className="p2w-link" onClick={() => actions.setTyping(lead.key)}>Set type</button>
          ) : null}
          {more.map((row) => {
            const rowOpenable = Boolean(row.documentId && OPENABLE.has(row.status));
            return (
              <button key={row.key} type="button" className="p2w-link" disabled={!rowOpenable}
                onClick={() => row.documentId && actions.onOpen(row.documentId)}>
                {row.name}{rowOpenable ? '' : ` (${pageStatus(row.status).label.toLowerCase()})`}
              </button>
            );
          })}
        </div>
      ) : null}
    </li>
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
  const [typing, setTyping] = useState<string>();
  const typeOptions = useMemo(
    () => templates.filter((t) => t.requirement !== 'SUPPORTING' || t.key === 'upi_screenshot')
      .filter((t) => t.diTypes.length)
      .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [templates],
  );
  const requirements = useMemo(() => checklistRequirements(checklist), [checklist]);
  const { matched, other } = useMemo(() => assignRowsToRequirements(requirements, rows), [requirements, rows]);
  const actions: RowActions = { selectedDocumentId, busyKey, typing, typeOptions, onOpen, onRetry, onSetType, setTyping };

  const stages = (['BOOKING', 'DELIVERY'] as const)
    .map((code) => {
      const items = requirements.filter((item) => item.stage === code);
      const required = items.filter((item) => item.requirement !== 'OPTIONAL');
      const received = required.filter((item) => item.status === 'RECEIVED' || matched.get(item.key)?.length).length;
      const extras = other.filter((row) => row.stage === code);
      return { code, items, required: required.length, received, extras };
    })
    .filter((stage) => stage.items.length || stage.extras.length);
  const unplaced = other.filter((row) => !row.stage || !['BOOKING', 'DELIVERY'].includes(row.stage));

  if (!rows.length && !requirements.length) {
    return <div className="p2w-list"><p className="p2w-empty">Nothing uploaded yet. Add the booking documents above.</p></div>;
  }

  return (
    <div className="p2w-list">
      {stages.map((stage) => (
        <section key={stage.code} className="p2w-dsection" aria-label={`${humanizeKey(stage.code)} documents`}>
          <h3>{humanizeKey(stage.code)} {stage.required ? <span>{stage.received} of {stage.required} received</span> : null}</h3>
          <ul className="p2w-dgrid">
            {stage.items.map((item) => (
              <DocumentCard key={item.key} title={item.label}
                level={item.requirement === 'OPTIONAL' ? 'optional' : item.conditional ? 'conditional' : 'required'}
                rows={matched.get(item.key) ?? []} reason={item.reason} actions={actions} onAdd={onAdd} />
            ))}
            {stage.extras.map((row) => (
              <DocumentCard key={row.key} title={PAGE_IN_FLIGHT.has(row.status) ? row.subtitle : row.name} level="extra" rows={[row]} actions={actions} />
            ))}
          </ul>
        </section>
      ))}
      {unplaced.length ? (
        <section className="p2w-dsection" aria-label="Other uploads">
          <h3>Other uploads</h3>
          <ul className="p2w-dgrid">
            {unplaced.map((row) => (
              <DocumentCard key={row.key} title={PAGE_IN_FLIGHT.has(row.status) ? row.subtitle : row.name} level="extra" rows={[row]} actions={actions} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
