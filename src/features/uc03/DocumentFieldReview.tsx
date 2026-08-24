import { useEffect, useMemo, useState } from 'react';

import {
  type EvidenceRegion,
  type ExtractionProposalView,
  getBookingEvidenceReviewContent,
} from '../../services/audit-core/uc03Booking';

interface DocumentFieldReviewProps {
  tenantId: string;
  journeyId: string;
  accessToken?: string;
  proposals: ExtractionProposalView[];
  disabled?: boolean;
  onAccept: (proposal: ExtractionProposalView) => Promise<void>;
  onCorrect: (proposal: ExtractionProposalView, value: string) => Promise<void>;
}

interface SourcePreview {
  url: string;
  mimeType: string;
}

function labelForField(fieldKey: string): string {
  return fieldKey
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return 'Not found';
  if (typeof value === 'string') return value || 'Blank';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function validBox(region?: EvidenceRegion | null): [number, number, number, number] | null {
  if (!region || region.type !== 'BOX_2D' || region.coordinateSystem !== 'NORMALIZED_1000') return null;
  if (!Array.isArray(region.box) || region.box.length !== 4) return null;
  const values = region.box.map(Number);
  if (values.some((value) => !Number.isFinite(value) || value < 0 || value > 1000)) return null;
  const [ymin, xmin, ymax, xmax] = values;
  if (ymin >= ymax || xmin >= xmax) return null;
  return [ymin, xmin, ymax, xmax];
}

function normalizedBoxStyle(box: [number, number, number, number]) {
  const [ymin, xmin, ymax, xmax] = box;
  return {
    top: `${ymin / 10}%`,
    left: `${xmin / 10}%`,
    height: `${(ymax - ymin) / 10}%`,
    width: `${(xmax - xmin) / 10}%`,
  };
}

export function DocumentFieldReview({
  tenantId,
  journeyId,
  accessToken,
  proposals,
  disabled = false,
  onAccept,
  onCorrect,
}: DocumentFieldReviewProps) {
  const pending = useMemo(
    () => proposals.filter((proposal) => proposal.status === 'PENDING'),
    [proposals],
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [editing, setEditing] = useState(false);
  const [correction, setCorrection] = useState('');
  const [source, setSource] = useState<SourcePreview | null>(null);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const safeIndex = pending.length === 0 ? 0 : Math.min(activeIndex, pending.length - 1);
  const active = pending[safeIndex] ?? null;

  useEffect(() => {
    if (activeIndex !== safeIndex) setActiveIndex(safeIndex);
  }, [activeIndex, safeIndex]);

  useEffect(() => {
    setEditing(false);
    setCorrection(active ? displayValue(active.proposedValue) : '');
  }, [active?.proposalId]);

  useEffect(() => {
    if (!active?.sourceEvidenceId) {
      setSource(null);
      setSourceError(null);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;
    setSourceLoading(true);
    setSourceError(null);

    void getBookingEvidenceReviewContent(
      tenantId,
      journeyId,
      active.sourceEvidenceId,
      accessToken,
    )
      .then((result) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(result.blob);
        setSource({ url: objectUrl, mimeType: result.mimeType });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setSource(null);
        setSourceError(error instanceof Error ? error.message : 'Unable to load source document.');
      })
      .finally(() => {
        if (!cancelled) setSourceLoading(false);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [accessToken, active?.sourceEvidenceId, journeyId, tenantId]);

  if (pending.length === 0) {
    return (
      <div className="uc03-review-empty" role="status">
        <strong>All extracted fields reviewed.</strong>
        <span>There are no pending DI values requiring a PC decision.</span>
      </div>
    );
  }

  if (!active) return null;

  const box = validBox(active.evidenceRegion);
  const isImage = source?.mimeType.startsWith('image/') ?? false;
  const isPdf = source?.mimeType.includes('pdf') ?? false;
  const pageNo = active.pageNo && active.pageNo > 0 ? active.pageNo : null;
  const fieldNumber = safeIndex + 1;

  const decide = async (mode: 'accept' | 'correct') => {
    setActionBusy(true);
    try {
      if (mode === 'accept') {
        await onAccept(active);
      } else {
        await onCorrect(active, correction);
      }
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <div className="uc03-review-shell">
      <div className="uc03-review-source">
        <header>
          <div>
            <span className="uc03-c1-eyebrow">Source document</span>
            <strong>{active.sourceDocumentTypeKey || 'Uploaded evidence'}</strong>
          </div>
          <div className="uc03-review-location">
            {pageNo ? <span>Page {pageNo}</span> : <span>Page not localized</span>}
            {box && isImage ? <span>Source highlighted</span> : null}
          </div>
        </header>

        <div className="uc03-review-preview" aria-live="polite">
          {sourceLoading ? <div className="uc03-review-preview-message">Loading source document…</div> : null}
          {sourceError ? <div className="uc03-review-preview-message is-error">{sourceError}</div> : null}

          {!sourceLoading && !sourceError && source && isImage ? (
            <div className="uc03-review-image-stage">
              <img src={source.url} alt={`Source evidence for ${labelForField(active.fieldKey)}`} />
              {box ? (
                <span
                  className="uc03-review-highlight"
                  style={normalizedBoxStyle(box)}
                  aria-label="DI source location"
                />
              ) : null}
            </div>
          ) : null}

          {!sourceLoading && !sourceError && source && isPdf ? (
            <div className="uc03-review-pdf-stage">
              <iframe
                title={`Source PDF for ${labelForField(active.fieldKey)}`}
                src={`${source.url}#page=${pageNo || 1}&view=FitH`}
              />
              <a href={`${source.url}#page=${pageNo || 1}`} target="_blank" rel="noreferrer">
                Open PDF in full viewer
              </a>
            </div>
          ) : null}

          {!sourceLoading && !sourceError && source && !isImage && !isPdf ? (
            <div className="uc03-review-preview-message">
              <span>Inline preview is not available for {source.mimeType}.</span>
              <a href={source.url} target="_blank" rel="noreferrer">Open source document</a>
            </div>
          ) : null}
        </div>

        <footer>
          {box && isImage ? (
            <span>DI highlighted the exact source region returned by extraction.</span>
          ) : pageNo ? (
            <span>DI localized this value to page {pageNo}. Compare visually if no box is shown.</span>
          ) : (
            <span>No reliable source location was returned. Compare the value visually; no location was guessed.</span>
          )}
        </footer>
      </div>

      <div className="uc03-review-field">
        <div className="uc03-review-progress-row">
          <span className="uc03-c1-eyebrow">Field {fieldNumber} of {pending.length}</span>
          <span>{Math.round((fieldNumber / pending.length) * 100)}% through pending fields</span>
        </div>
        <div className="uc03-review-progress" aria-hidden="true">
          <span style={{ width: `${(fieldNumber / pending.length) * 100}%` }} />
        </div>

        <div className="uc03-review-value-card">
          <span>{labelForField(active.fieldKey)}</span>
          <strong>{displayValue(active.proposedValue)}</strong>
          <div className="uc03-review-meta">
            <span>DI confidence {active.confidence === null ? '—' : `${active.confidence.toFixed(0)}%`}</span>
            <span>{active.valueSource || 'MACHINE'}</span>
          </div>
        </div>

        {editing ? (
          <label className="uc03-review-correction">
            <span>Correct value</span>
            <input
              autoFocus
              value={correction}
              onChange={(event) => setCorrection(event.target.value)}
              disabled={disabled || actionBusy}
            />
          </label>
        ) : null}

        <div className="uc03-review-decision-actions">
          {!editing ? (
            <>
              <button
                type="button"
                className="uc03-c1-primary"
                disabled={disabled || actionBusy || !active.canAccept}
                onClick={() => void decide('accept')}
              >
                ✓ Correct
              </button>
              <button
                type="button"
                className="uc03-c1-secondary"
                disabled={disabled || actionBusy}
                onClick={() => setEditing(true)}
              >
                Change value
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="uc03-c1-primary"
                disabled={disabled || actionBusy || correction.trim().length === 0}
                onClick={() => void decide('correct')}
              >
                Save change
              </button>
              <button
                type="button"
                className="uc03-c1-secondary"
                disabled={disabled || actionBusy}
                onClick={() => {
                  setCorrection(displayValue(active.proposedValue));
                  setEditing(false);
                }}
              >
                Cancel
              </button>
            </>
          )}
        </div>

        <div className="uc03-review-nav">
          <button
            type="button"
            className="uc03-c1-secondary"
            disabled={safeIndex === 0 || actionBusy}
            onClick={() => setActiveIndex((value) => Math.max(0, value - 1))}
          >
            ← Previous
          </button>
          <button
            type="button"
            className="uc03-c1-secondary"
            disabled={safeIndex >= pending.length - 1 || actionBusy}
            onClick={() => setActiveIndex((value) => Math.min(pending.length - 1, value + 1))}
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
