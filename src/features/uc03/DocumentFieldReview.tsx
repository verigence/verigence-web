import { type PointerEvent as ReactPointerEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import '../../styles/uc03-document-verification.css';
import {
  type EvidenceRegion,
  type ExtractionProposalView,
  getBookingEvidenceReviewContent,
} from '../../services/audit-core/uc03Booking';
import { displayName } from '../../utils/displayNames';

type SheetSnap = 'peek' | 'half' | 'full';

type ReviewProposal = ExtractionProposalView & {
  sourceText?: string | null;
  reviewReason?: string | null;
};

interface DocumentFieldReviewProps {
  tenantId: string;
  journeyId: string;
  accessToken?: string;
  evidenceId: string;
  documentName: string;
  proposals: ExtractionProposalView[];
  decidedIds?: ReadonlySet<string>;
  disabled?: boolean;
  onAccept: (proposal: ExtractionProposalView) => Promise<void>;
  onCorrect: (proposal: ExtractionProposalView, value: string) => Promise<void>;
  onReviewCompleteChange?: (complete: boolean) => void;
}

interface SourcePreview {
  url: string;
  mimeType: string;
}

interface NormalizedBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

function proposalValue(value: unknown): string {
  if (value === null || value === undefined) return 'Not Found';
  if (typeof value === 'string') return value || 'Blank';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function confidencePercent(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const percent = value <= 1 ? value * 100 : value;
  return Math.max(0, Math.min(100, percent));
}

function normalizedBox(region?: EvidenceRegion | null): NormalizedBox | null {
  if (!region || region.type !== 'BOX_2D' || region.coordinateSystem !== 'NORMALIZED_1000') return null;
  if (!Array.isArray(region.box) || region.box.length !== 4) return null;
  const values = region.box.map(Number);
  if (values.some((value) => !Number.isFinite(value) || value < 0 || value > 1000)) return null;
  const [ymin, xmin, ymax, xmax] = values;
  if (ymin >= ymax || xmin >= xmax) return null;
  return {
    x: xmin / 1000,
    y: ymin / 1000,
    w: (xmax - xmin) / 1000,
    h: (ymax - ymin) / 1000,
  };
}

function isPersistedReview(proposal: ExtractionProposalView, decidedIds: ReadonlySet<string>): boolean {
  return decidedIds.has(proposal.proposalId)
    || proposal.status === 'ACCEPTED'
    || proposal.status === 'CORRECTED';
}

function requiresExtraAttention(proposal: ReviewProposal): boolean {
  if (proposal.reviewReason?.trim()) return true;
  const confidence = confidencePercent(proposal.confidence);
  return confidence !== null && confidence <= 90;
}

function reviewReason(proposal: ReviewProposal): string | null {
  if (proposal.reviewReason?.trim()) return proposal.reviewReason.trim();
  const confidence = confidencePercent(proposal.confidence);
  if (confidence !== null && confidence <= 90) {
    return `${Math.round(confidence)}% extraction confidence — compare carefully with the source document.`;
  }
  return null;
}

function snapVisibleHeight(snap: SheetSnap, containerHeight: number): number {
  if (snap === 'peek') return Math.min(122, Math.max(96, containerHeight * 0.16));
  if (snap === 'half') return containerHeight * 0.5;
  return containerHeight * 0.9;
}

export function DocumentFieldReview({
  tenantId,
  journeyId,
  accessToken,
  evidenceId,
  documentName,
  proposals,
  decidedIds = new Set<string>(),
  disabled = false,
  onAccept,
  onCorrect,
  onReviewCompleteChange,
}: DocumentFieldReviewProps) {
  const fields = useMemo(
    () => (proposals as ReviewProposal[]).filter((proposal) => proposal.status !== 'SUPERSEDED'),
    [proposals],
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const dragStartY = useRef<number | null>(null);
  const dragged = useRef(false);
  const [wide, setWide] = useState(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [snap, setSnap] = useState<SheetSnap>('half');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [locallyReviewedIds, setLocallyReviewedIds] = useState<Set<string>>(() => new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [correction, setCorrection] = useState('');
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [source, setSource] = useState<SourcePreview | null>(null);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [imageReady, setImageReady] = useState(false);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width, height });
      setWide(width >= 720 && height >= 520);
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setSelectedId(fields.find((field) => field.status === 'PENDING')?.proposalId ?? fields[0]?.proposalId ?? null);
    setLocallyReviewedIds(new Set());
    setEditingId(null);
    setCorrection('');
    setSnap('half');
  }, [evidenceId]);

  useEffect(() => {
    if (selectedId && fields.some((field) => field.proposalId === selectedId)) return;
    setSelectedId(fields.find((field) => field.status === 'PENDING')?.proposalId ?? fields[0]?.proposalId ?? null);
  }, [fields, selectedId]);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setSource(null);
    setSourceLoading(true);
    setSourceError(null);
    setImageReady(false);

    void getBookingEvidenceReviewContent(tenantId, journeyId, evidenceId, accessToken)
      .then((result) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(result.blob);
        setSource({ url: objectUrl, mimeType: result.mimeType });
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setSourceError(cause instanceof Error ? cause.message : 'Unable to load source document.');
      })
      .finally(() => {
        if (!cancelled) setSourceLoading(false);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [accessToken, evidenceId, journeyId, tenantId]);

  const selected = fields.find((field) => field.proposalId === selectedId) ?? null;
  const selectedBox = normalizedBox(selected?.evidenceRegion);
  const isImage = source?.mimeType.startsWith('image/') ?? false;
  const isPdf = source?.mimeType.includes('pdf') ?? false;
  const selectedPage = selected?.pageNo && selected.pageNo > 0 ? selected.pageNo : 1;
  const occludedBottom = wide ? 0 : snapVisibleHeight(snap, size.height);

  const isReviewed = (proposal: ExtractionProposalView): boolean => {
    if (isPersistedReview(proposal, decidedIds)) return true;
    return locallyReviewedIds.has(proposal.proposalId);
  };

  const reviewComplete = fields.every((field) => isReviewed(field));
  const reviewedCount = fields.filter((field) => isReviewed(field)).length;
  const attentionCount = fields.filter((field) => !isReviewed(field) && requiresExtraAttention(field)).length;

  useEffect(() => {
    onReviewCompleteChange?.(reviewComplete);
  }, [onReviewCompleteChange, reviewComplete]);

  useEffect(() => {
    if (!selectedBox || !isImage || !imageReady) return;
    const scroller = scrollerRef.current;
    const image = imageRef.current;
    if (!scroller || !image || image.clientHeight <= 0) return;

    const absoluteY = image.offsetTop + selectedBox.y * image.clientHeight;
    const usableHeight = Math.max(120, scroller.clientHeight - occludedBottom);
    const target = absoluteY - Math.max(70, usableHeight * 0.42);
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    scroller.scrollTo({ top: Math.max(0, target), behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [imageReady, isImage, occludedBottom, selectedBox?.h, selectedBox?.w, selectedBox?.x, selectedBox?.y]);

  const selectField = (proposalId: string) => {
    setSelectedId(proposalId);
    setEditingId(null);
    if (!wide && snap === 'full') setSnap('half');
  };

  const acceptField = async (proposal: ExtractionProposalView) => {
    if (disabled || actionBusyId || isReviewed(proposal)) return;
    if (!proposal.canAccept) {
      setLocallyReviewedIds((current) => new Set(current).add(proposal.proposalId));
      return;
    }
    setActionBusyId(proposal.proposalId);
    try {
      await onAccept(proposal);
    } finally {
      setActionBusyId(null);
    }
  };

  const startCorrection = (proposal: ExtractionProposalView) => {
    setSelectedId(proposal.proposalId);
    setCorrection(proposalValue(proposal.proposedValue));
    setEditingId(proposal.proposalId);
    if (!wide && snap === 'peek') setSnap('half');
  };

  const saveCorrection = async (proposal: ExtractionProposalView) => {
    const value = correction.trim();
    if (!value || disabled || actionBusyId) return;
    setActionBusyId(proposal.proposalId);
    try {
      await onCorrect(proposal, value);
      setEditingId(null);
    } finally {
      setActionBusyId(null);
    }
  };

  useEffect(() => {
    if (!wide) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (fields.length === 0) return;
      const current = Math.max(0, fields.findIndex((field) => field.proposalId === selectedId));
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const delta = event.key === 'ArrowDown' ? 1 : -1;
        const next = Math.max(0, Math.min(fields.length - 1, current + delta));
        selectField(fields[next].proposalId);
      }
      if (event.key === 'Enter' && selected && !isReviewed(selected)) {
        event.preventDefault();
        void acceptField(selected);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [actionBusyId, disabled, fields, selected, selectedId, wide]);

  const cycleSnap = () => {
    setSnap((current) => current === 'peek' ? 'half' : current === 'half' ? 'full' : 'peek');
  };

  const onGrabPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    dragStartY.current = event.clientY;
    dragged.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onGrabPointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragStartY.current === null) return;
    const delta = event.clientY - dragStartY.current;
    dragStartY.current = null;
    if (Math.abs(delta) < 36) return;
    dragged.current = true;
    const order: SheetSnap[] = ['peek', 'half', 'full'];
    const index = order.indexOf(snap);
    const next = delta < 0 ? Math.min(order.length - 1, index + 1) : Math.max(0, index - 1);
    setSnap(order[next]);
  };

  return (
    <div ref={rootRef} className={`uc03-docverify ${wide ? 'is-wide' : 'is-narrow'}`}>
      <div className="uc03-docverify-bar">
        <div>
          <strong>{documentName}</strong>
          <span>{fields.length ? `${fields.length} System Read field${fields.length === 1 ? '' : 's'}` : 'No extracted fields returned'}</span>
        </div>
        <div className="uc03-docverify-bar__status">
          <span>{reviewedCount}/{fields.length} reviewed</span>
          {attentionCount > 0 ? <span className="is-attention">{attentionCount} to check carefully</span> : null}
        </div>
      </div>

      <div className={`uc03-docverify-body ${wide ? 'is-wide' : 'is-narrow'}`}>
        <div className="uc03-docverify-canvas">
          <div ref={scrollerRef} className="uc03-docverify-scroller">
            {sourceLoading ? <div className="uc03-docverify-message">Loading source document…</div> : null}
            {sourceError ? <div className="uc03-docverify-message is-error">{sourceError}</div> : null}

            {!sourceLoading && !sourceError && source && isImage ? (
              <div className="uc03-docverify-image-page">
                <img
                  ref={imageRef}
                  src={source.url}
                  alt={`${documentName} source`}
                  draggable={false}
                  onLoad={() => setImageReady(true)}
                />
                {selectedBox ? (
                  <div
                    className={`uc03-docverify-highlight ${selected && requiresExtraAttention(selected) ? 'is-attention' : ''}`}
                    style={{
                      left: `${selectedBox.x * 100}%`,
                      top: `${selectedBox.y * 100}%`,
                      width: `${selectedBox.w * 100}%`,
                      height: `${selectedBox.h * 100}%`,
                    }}
                    aria-label={selected ? `Source location for ${displayName(selected.fieldKey)}` : 'Source location'}
                  >
                    {selected ? <span>{displayName(selected.fieldKey)}</span> : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            {!sourceLoading && !sourceError && source && isPdf ? (
              <div className="uc03-docverify-pdf">
                <iframe
                  key={selectedPage}
                  title={`${documentName} source PDF`}
                  src={`${source.url}#page=${selectedPage}&view=FitH`}
                />
                <a href={`${source.url}#page=${selectedPage}`} target="_blank" rel="noreferrer">Open PDF in full viewer</a>
              </div>
            ) : null}

            {!sourceLoading && !sourceError && source && !isImage && !isPdf ? (
              <div className="uc03-docverify-message">
                <span>Inline preview is not available for this file type.</span>
                <a href={source.url} target="_blank" rel="noreferrer">Open source document</a>
              </div>
            ) : null}

            {!sourceLoading && !sourceError && !source ? (
              <div className="uc03-docverify-message">Source document is not available.</div>
            ) : null}
            {!wide ? <div aria-hidden style={{ height: occludedBottom }} /> : null}
          </div>

          {selected ? (
            <div className="uc03-docverify-source-note">
              {selectedBox && isImage
                ? 'Selected value is highlighted on the source document.'
                : selected.pageNo
                  ? `Selected value was localized to page ${selected.pageNo}.`
                  : 'No reliable source region was returned. Compare visually; no location is guessed.'}
            </div>
          ) : null}
        </div>

        <aside className={`uc03-docverify-panel ${wide ? 'is-wide' : `is-${snap}`}`}>
          {!wide ? (
            <button
              type="button"
              className="uc03-docverify-grab"
              aria-label="Resize extracted values panel"
              onPointerDown={onGrabPointerDown}
              onPointerUp={onGrabPointerUp}
              onClick={() => {
                if (dragged.current) {
                  dragged.current = false;
                  return;
                }
                cycleSnap();
              }}
            >
              <span />
            </button>
          ) : null}

          <div className="uc03-docverify-panel__head">
            <div>
              <strong>What We Read</strong>
              <span>Select any value to verify it against the document.</span>
            </div>
            <span className={reviewComplete ? 'is-complete' : ''}>{reviewComplete ? 'All reviewed' : `${fields.length - reviewedCount} remaining`}</span>
          </div>

          {fields.length ? (
            <ul className="uc03-docverify-fields">
              {fields.map((field) => {
                const selectedField = field.proposalId === selectedId;
                const reviewed = isReviewed(field);
                const attention = requiresExtraAttention(field);
                const reason = reviewReason(field);
                const confidence = confidencePercent(field.confidence);
                const editing = editingId === field.proposalId;
                const busy = actionBusyId === field.proposalId;
                return (
                  <li
                    key={field.proposalId}
                    className={`uc03-docverify-field ${selectedField ? 'is-selected' : ''} ${attention ? 'is-attention' : ''} ${reviewed ? 'is-reviewed' : ''}`}
                  >
                    <button
                      type="button"
                      className="uc03-docverify-field__summary"
                      aria-expanded={selectedField}
                      onClick={() => selectField(field.proposalId)}
                    >
                      <span>{displayName(field.fieldKey)}</span>
                      <strong>{reviewed && field.status === 'CORRECTED' && field.acceptedValue !== null ? proposalValue(field.acceptedValue) : proposalValue(field.proposedValue)}</strong>
                      {reviewed ? <b aria-label="Reviewed">✓</b> : null}
                    </button>

                    {selectedField ? (
                      <div className="uc03-docverify-field__details">
                        <div className="uc03-docverify-field__meta">
                          {confidence !== null ? <span>{Math.round(confidence)}% confidence</span> : <span>Confidence unavailable</span>}
                          {field.pageNo ? <span>Page {field.pageNo}</span> : null}
                          {!field.canAccept ? <span>Reference field</span> : null}
                        </div>

                        {field.sourceText?.trim() ? (
                          <div className="uc03-docverify-source-text">
                            <b>Read from the document</b>
                            <span>{field.sourceText}</span>
                          </div>
                        ) : null}

                        {reason ? <div className="uc03-docverify-warning">⚠ {reason}</div> : null}

                        {editing ? (
                          <div className="uc03-docverify-edit">
                            <label>
                              <span>Correct value</span>
                              <input
                                autoFocus
                                value={correction}
                                disabled={disabled || busy}
                                onChange={(event) => setCorrection(event.target.value)}
                              />
                            </label>
                            <div>
                              <button type="button" className="is-primary" disabled={disabled || busy || !correction.trim()} onClick={() => void saveCorrection(field)}>
                                {busy ? 'Saving…' : 'Save Change'}
                              </button>
                              <button type="button" disabled={disabled || busy} onClick={() => setEditingId(null)}>Cancel</button>
                            </div>
                          </div>
                        ) : !reviewed ? (
                          <div className="uc03-docverify-actions">
                            <button type="button" className="is-primary" disabled={disabled || busy} onClick={() => void acceptField(field)}>
                              {busy ? 'Saving…' : field.canAccept ? (attention ? 'Confirm Value' : 'Accept Value') : 'Confirm Value'}
                            </button>
                            {field.canAccept ? (
                              <button type="button" disabled={disabled || busy} onClick={() => startCorrection(field)}>Change Value</button>
                            ) : null}
                          </div>
                        ) : (
                          <div className="uc03-docverify-reviewed-note">✓ Value reviewed</div>
                        )}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="uc03-docverify-empty">
              <strong>No System Read values were returned.</strong>
              <span>Review the document visually, then approve the document below.</span>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
