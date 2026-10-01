import type { P2DocumentDefect, P2DocumentHealthSummary, P2UploadCounts } from '../../../services/audit-core/uc03P2';
import type { DocumentRow } from './P2DocumentList';
import { PAGE_IN_FLIGHT } from './p2Format';

const BEFORE_CLASSIFICATION = new Set(['QUEUED', 'PREPARING_PAGE', 'DI_UPLOAD_PREPARING', 'DI_UPLOADING', 'DI_FINALIZING', 'CLASSIFYING', 'RETRY_WAIT']);

export type ProcessingItem = { key: string; name: string; status: string };
export type DocumentHealth = { summary: P2DocumentHealthSummary; defects: P2DocumentDefect[] };

const pages = (n: number) => (n === 1 ? '1 page' : `${n} pages`);

/** The issues the pipeline owes an answer for, in the order a PC acts on
 * them (decision 2026-10-01). Each names its action; the cards offer it. */
export function healthIssues(summary?: P2DocumentHealthSummary | null): string[] {
  if (!summary) return [];
  const issues: string[] = [];
  if (summary.stuck) issues.push(`${pages(summary.stuck)} waiting on the document service for over 8 hours (Re-sync asks again; retried tonight)`);
  if (summary.notRead) issues.push(`${pages(summary.notRead)} classified but not read (Read again)`);
  if (summary.nothingRead) issues.push(`${pages(summary.nothingRead)} read with nothing found (Read again)`);
  if (summary.rejected) issues.push(`${pages(summary.rejected)} rejected for quality (Upload again)`);
  if (summary.failed) issues.push(`${pages(summary.failed)} failed (Retry)`);
  if (summary.unclassified) issues.push(`${pages(summary.unclassified)} not classified (Set type)`);
  return issues;
}

/**
 * The five numbers a PC or TL watches while documents are processed
 * (uploaded, classified, extracted, duplicates, not classified), how many
 * pages are being worked on right now, and the issues the pipeline still
 * owes an answer for. The cards below show each page's own state, so the
 * strip never lists pages one by one (issue 16). There is no submit step:
 * Booking and Delivery complete from the documents and the rules.
 */
export default function P2UploadStatus({ counts, rows, live, processing = [], health }: {
  counts?: P2UploadCounts; rows?: DocumentRow[]; live?: boolean; processing?: ProcessingItem[]; health?: DocumentHealth | null;
}) {
  if (!counts) return null;
  const issues = healthIssues(health?.summary);
  // Count what the screen lists. The server's counts cover the Phase 2
  // upload queue only, so documents linked earlier (an existing journey,
  // a re-linked evidence) showed a row of zeros above a full grid.
  const listed = rows ?? [];
  const uploaded = listed.length + counts.uploading;
  const classified = listed.filter((row) => !BEFORE_CLASSIFICATION.has(row.status) && row.status !== 'FAILED' && row.status !== 'DEAD_LETTER').length;
  // Extracted means Audit Core holds the page's values; a page read empty is not extracted.
  const extracted = listed.filter((row) => row.status === 'READY').length;
  const notClassified = listed.filter((row) => PAGE_IN_FLIGHT.has(row.status) && BEFORE_CLASSIFICATION.has(row.status)).length + counts.uploading;
  return (
    <section className="p2w-statusbar" aria-label="Upload status" aria-live="polite">
      <div><span>Uploaded</span><strong>{uploaded}</strong></div>
      <div><span>Classified</span><strong>{classified}</strong></div>
      <div className={extracted ? 'is-good' : ''}><span>Extracted</span><strong>{extracted}</strong></div>
      <div className={counts.duplicates ? 'is-warn' : ''}><span>Duplicates</span><strong>{counts.duplicates}</strong></div>
      <div className={notClassified ? 'is-warn' : ''}><span>Not classified</span><strong>{notClassified}</strong></div>
      <p className="p2w-statusbar__note" role="status">
        <span className={`p2w-live${live ? ' is-on' : ''}`} title={live ? 'Updates arrive the moment a document changes' : 'Refreshing every few seconds'}>
          ● {live ? 'Live' : 'Auto-refresh'}
        </span>
        {processing.length ? (
          <span className="p2w-statusbar__working">
            <span className="p2w-statusbar__item">
              <i className="p2w-spinner" aria-hidden="true" />{pages(processing.length)} being identified or read…
            </span>
            {processing.length > 1 ? (
              <span className="p2w-muted">
                A file with many pages takes a few minutes. You can leave this page: if it is still not done after an hour, a task tells you.
              </span>
            ) : null}
          </span>
        ) : issues.length ? null : <span className="p2w-muted">Nothing being processed. Add a document and its progress shows here.</span>}
      </p>
      {issues.length ? (
        <ul className="p2w-statusbar__issues" aria-label="Document issues">
          {issues.map((issue) => <li key={issue}>{issue}</li>)}
        </ul>
      ) : null}
    </section>
  );
}
