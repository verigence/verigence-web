import type { P2Task } from '../../../services/audit-core/uc03P2';

/**
 * Fewer tasks for the PC (product owner 2026-10-28: "PCs are getting confused
 * by so many tasks"). Within one booking, tasks of the same kind are shown as
 * one entry -- the documents to upload, the documents in another name, the
 * values to check, the questions to answer, the pages of one file whose type
 * is to be set -- and opening it lists each one with its own actions. Each
 * underlying task still closes itself as before; only the list is shorter.
 */
export type TaskBundle = {
  bundle: true;
  /** Unique within the queue: booking + kind. */
  id: string;
  kind: BundleKind;
  title: string;
  tasks: P2Task[];
};

export type TaskEntry = P2Task | TaskBundle;

type BundleKind = 'names' | 'missing' | 'verify' | 'questions' | 'unread';

const WRONG_NAME = /^WRONG_[A-Z]+_NAME$/;
const QUESTIONS = new Set(['PC_CONFIRMATION', 'INSURANCE_SOURCE_CONFIRM']);

const LABELS: Record<BundleKind, string> = {
  names: 'Documents in another name',
  missing: 'Documents to upload',
  verify: 'Values to check',
  questions: 'Questions to answer',
  unread: 'Set the document type',
};

/** Which kind of bundle a task belongs to, and the key it shares with the
 * others of its kind on the same booking; undefined for a task that stands
 * on its own. */
export function bundleOf(task: P2Task): { kind: BundleKind; key: string } | undefined {
  if (task.source_system === 'LEGACY') return undefined;
  if (task.task_type === 'DOCUMENT_MISSING' && WRONG_NAME.test(String(task.source_code ?? ''))) {
    return { kind: 'names', key: 'names' };
  }
  if (QUESTIONS.has(task.task_type)) return { kind: 'questions', key: 'questions' };
  if (task.task_type === 'PC_VERIFY_UNRECOGNIZED_DOCUMENT') {
    return { kind: 'unread', key: `unread:${task.document?.file ?? ''}` };
  }
  if (task.document_category === 'MISSING_DOCUMENT') return { kind: 'missing', key: 'missing' };
  if (task.document_category === 'MANUAL_VERIFICATION') return { kind: 'verify', key: 'verify' };
  return undefined;
}

export function isBundle(entry: TaskEntry): entry is TaskBundle {
  return (entry as TaskBundle).bundle === true;
}

function bundleTitle(kind: BundleKind, tasks: P2Task[]): string {
  if (kind === 'unread') {
    const file = tasks[0].document?.file;
    return `${LABELS.unread}: ${tasks.length} pages${file ? ` of ${file}` : ''}`;
  }
  return `${LABELS[kind]} (${tasks.length})`;
}

/**
 * One booking's tasks (already in worklist order) as entries: tasks of one
 * kind become one bundle, placed where the first of them was; a kind with a
 * single task stays that task.
 */
export function bundleTasks(journeyId: string, tasks: P2Task[]): TaskEntry[] {
  const byKey = new Map<string, P2Task[]>();
  for (const task of tasks) {
    const of = bundleOf(task);
    if (of) byKey.set(of.key, [...(byKey.get(of.key) ?? []), task]);
  }
  const placed = new Set<string>();
  const entries: TaskEntry[] = [];
  for (const task of tasks) {
    const of = bundleOf(task);
    const members = of ? byKey.get(of.key) ?? [] : [];
    if (!of || members.length < 2) {
      entries.push(task);
      continue;
    }
    if (placed.has(of.key)) continue;
    placed.add(of.key);
    entries.push({ bundle: true, id: `bundle:${journeyId}:${of.key}`, kind: of.kind,
      title: bundleTitle(of.kind, members), tasks: members });
  }
  return entries;
}

const SEVERITY_RANK: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };

/** The most serious severity among a bundle's tasks. */
export function bundleSeverity(tasks: P2Task[]): string {
  return [...tasks].map((t) => String(t.severity ?? 'MEDIUM').toUpperCase())
    .sort((a, b) => (SEVERITY_RANK[a] ?? 2) - (SEVERITY_RANK[b] ?? 2))[0] ?? 'MEDIUM';
}

/** The earliest due time among a bundle's tasks. */
export function bundleDue(tasks: P2Task[]): string | null {
  const due = tasks.map((t) => t.due_at_utc).filter((d): d is string => Boolean(d)).sort();
  return due[0] ?? null;
}

/** How many entries the PC sees for these tasks (bundles counted once). */
export function entryCount(tasks: P2Task[]): number {
  const byJourney = new Map<string, P2Task[]>();
  for (const task of tasks) byJourney.set(task.journey_id, [...(byJourney.get(task.journey_id) ?? []), task]);
  let count = 0;
  for (const [journeyId, items] of byJourney) count += bundleTasks(journeyId, items).length;
  return count;
}
