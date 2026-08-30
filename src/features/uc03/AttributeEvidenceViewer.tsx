import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';

import { getReviewDocumentContentV2, type ReviewV2SourceValue } from '../../services/audit-core/uc03DocumentReviewV2';
import '../../styles/uc03-evidence-viewer.css';
import { PdfPageReview } from './PdfPageReview';

interface NormalizedBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface AnchorPoint {
  x: number;
  y: number;
}

interface ViewerPosition {
  left: number;
  top: number;
}

function normalizedBox(region: Record<string, unknown> | null): NormalizedBox | undefined {
  if (!region || region.type !== 'BOX_2D' || region.coordinateSystem !== 'NORMALIZED_1000') return undefined;
  const box = region.box;
  if (!Array.isArray(box) || box.length !== 4 || !box.every((value) => typeof value === 'number')) return undefined;
  const [ymin, xmin, ymax, xmax] = box as number[];
  if ([ymin, xmin, ymax, xmax].some((value) => value < 0 || value > 1000)) return undefined;
  if (xmax <= xmin || ymax <= ymin) return undefined;
  return {
    x: xmin / 1000,
    y: ymin / 1000,
    w: (xmax - xmin) / 1000,
    h: (ymax - ymin) / 1000,
  };
}

function currentInteractionPoint(): AnchorPoint | null {
  if (typeof document === 'undefined') return null;
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return null;
  const rect = active.getBoundingClientRect();
  if (rect.width <= 0 && rect.height <= 0) return null;
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

export function hasBoxedEvidence(
  source: Pick<ReviewV2SourceValue, 'pageNo' | 'evidenceRegion' | 'originalFilename'>,
): boolean {
  if (!normalizedBox(source.evidenceRegion)) return false;
  const isPdf = source.originalFilename.toLowerCase().endsWith('.pdf');
  return !isPdf || Boolean(source.pageNo && source.pageNo > 0);
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Not found';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function confidence(value: number | null): string {
  if (value === null || value === undefined) return 'Not available';
  return `${value.toFixed(value % 1 === 0 ? 0 : 1)}%`;
}

export default function AttributeEvidenceViewer({
  tenantId,
  journeyId,
  accessToken,
  source,
  onClose,
}: {
  tenantId: string;
  journeyId: string;
  accessToken?: string;
  source: ReviewV2SourceValue;
  onClose: () => void;
}) {
  const anchorRef = useRef<AnchorPoint | null>(currentInteractionPoint());
  const modalRef = useRef<HTMLElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const imageBoxRef = useRef<HTMLSpanElement>(null);
  const [viewerPosition, setViewerPosition] = useState<ViewerPosition>();
  const box = useMemo(() => normalizedBox(source.evidenceRegion), [source.evidenceRegion]);
  const localized = hasBoxedEvidence(source);
  const contentQuery = useQuery({
    queryKey: ['uc03-review-document-content', tenantId, journeyId, source.documentId],
    queryFn: () => getReviewDocumentContentV2(tenantId, journeyId, source.documentId, accessToken),
    staleTime: 5 * 60 * 1000,
    enabled: localized,
  });
  const [objectUrl, setObjectUrl] = useState<string>();

  useEffect(() => {
    if (!localized || !contentQuery.data?.blob) {
      setObjectUrl(undefined);
      return undefined;
    }
    const next = URL.createObjectURL(contentQuery.data.blob);
    setObjectUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [contentQuery.data?.blob, localized]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const bodyOverflow = document.body.style.overflow;
    const htmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = htmlOverflow;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const positionViewer = () => {
      const modal = modalRef.current;
      if (!modal) return;
      const modalRect = modal.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const margin = viewportWidth <= 560 ? 0 : 12;
      const anchor = anchorRef.current;
      const desiredLeft = anchor
        ? anchor.x - modalRect.width / 2
        : (viewportWidth - modalRect.width) / 2;
      const desiredTop = anchor
        ? anchor.y - Math.min(72, modalRect.height * 0.1)
        : (viewportHeight - modalRect.height) / 2;
      const maxLeft = Math.max(margin, viewportWidth - modalRect.width - margin);
      const maxTop = Math.max(margin, viewportHeight - modalRect.height - margin);
      setViewerPosition({
        left: Math.min(Math.max(margin, desiredLeft), maxLeft),
        top: Math.min(Math.max(margin, desiredTop), maxTop),
      });
    };

    positionViewer();
    window.addEventListener('resize', positionViewer);
    return () => window.removeEventListener('resize', positionViewer);
  }, [contentQuery.isError, contentQuery.isPending, localized, objectUrl, source.documentId]);

  const contentType = contentQuery.data?.contentType || '';
  const filename = source.originalFilename.toLowerCase();
  const isPdf = contentType.includes('pdf') || filename.endsWith('.pdf');
  const isImage = contentType.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp)$/i.test(filename);

  const focusImageEvidence = () => {
    const preview = previewRef.current;
    const highlight = imageBoxRef.current;
    if (!preview || !highlight) return;
    window.requestAnimationFrame(() => {
      const previewRect = preview.getBoundingClientRect();
      const highlightRect = highlight.getBoundingClientRect();
      const top = preview.scrollTop
        + (highlightRect.top - previewRect.top)
        - Math.max(0, (preview.clientHeight - highlightRect.height) / 2);
      const left = preview.scrollLeft
        + (highlightRect.left - previewRect.left)
        - Math.max(0, (preview.clientWidth - highlightRect.width) / 2);
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      preview.scrollTo({
        top: Math.max(0, top),
        left: Math.max(0, left),
        behavior: reduceMotion ? 'auto' : 'smooth',
      });
    });
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="uc03-attribute-evidence-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.currentTarget === event.target) onClose();
    }}>
      <section
        ref={modalRef}
        className="uc03-attribute-evidence-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Evidence for ${source.fieldKey}`}
        style={viewerPosition
          ? { left: viewerPosition.left, top: viewerPosition.top, visibility: 'visible' }
          : { left: 0, top: 0, visibility: 'hidden' }}
      >
        <header className="uc03-attribute-evidence-header">
          <div>
            <span>{localized ? 'Source evidence' : 'Source location unavailable'}</span>
            <h2>{source.documentLabel}</h2>
            <p>{source.originalFilename}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close evidence viewer">×</button>
        </header>

        <div className="uc03-attribute-evidence-layout">
          <div ref={previewRef} className="uc03-attribute-evidence-preview">
            {!localized ? (
              <div className="uc03-attribute-evidence-message is-error">
                Document Intelligence returned this extracted value without a reliable source location. Verigence never invents a bounding box.
              </div>
            ) : null}
            {localized && contentQuery.isPending && <div className="uc03-attribute-evidence-message">Loading source evidence…</div>}
            {localized && contentQuery.isError && <div className="uc03-attribute-evidence-message is-error">The source evidence could not be loaded. Try again.</div>}
            {localized && objectUrl && isPdf && box ? (
              <PdfPageReview
                sourceUrl={objectUrl}
                pageNumber={source.pageNo || 1}
                box={box}
                label={source.fieldKey}
                attention={source.reviewState === 'NEEDS_REVIEW'}
              />
            ) : null}
            {localized && objectUrl && isImage && box ? (
              <div className="uc03-attribute-image-frame">
                <img src={objectUrl} alt={source.originalFilename} onLoad={focusImageEvidence} />
                <span
                  ref={imageBoxRef}
                  className={`uc03-attribute-image-box ${source.reviewState === 'NEEDS_REVIEW' ? 'needs-review' : ''}`}
                  data-evidence-highlight="true"
                  style={{
                    left: `${box.x * 100}%`,
                    top: `${box.y * 100}%`,
                    width: `${box.w * 100}%`,
                    height: `${box.h * 100}%`,
                  }}
                  aria-hidden="true"
                />
              </div>
            ) : null}
            {localized && objectUrl && !isPdf && !isImage ? (
              <div className="uc03-attribute-evidence-message is-error">
                A field-level preview is not supported for this file type.
              </div>
            ) : null}
          </div>

          <aside className="uc03-attribute-evidence-detail">
            <span className="uc03-attribute-evidence-kicker">Selected field</span>
            <h3>{source.fieldKey.replace(/[_-]+/g, ' ')}</h3>
            <strong className="uc03-attribute-evidence-value">{displayValue(source.value)}</strong>
            <dl>
              <div><dt>Confidence</dt><dd>{confidence(source.confidenceScore)}</dd></div>
              <div><dt>Source document</dt><dd>{source.documentLabel}</dd></div>
              <div><dt>Document type</dt><dd>{source.documentTypeKey || '—'}</dd></div>
              <div><dt>Page</dt><dd>{source.pageNo || (isPdf ? 'Not returned' : 'Single-page document')}</dd></div>
              <div><dt>Review state</dt><dd>{source.reviewState === 'READY' ? 'Ready' : 'Needs review'}</dd></div>
            </dl>
            <p>{localized
              ? 'The highlighted rectangle is the exact source location returned by Document Intelligence.'
              : 'The value remains visible for review, but no document location is shown until DI supplies reliable coordinates.'}</p>
          </aside>
        </div>
      </section>
    </div>,
    document.body,
  );
}
