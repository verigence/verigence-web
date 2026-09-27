import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';

import { PdfPageReview } from '../uc03/PdfPageReview';
import { getP2DocumentContent, type P2DocumentReviewField } from '../../services/audit-core/uc03P2';
import '../../styles/uc03-p2.css';

type Box = { x: number; y: number; w: number; h: number };

function normalizedBox(region: Record<string, unknown> | null): Box | null {
  if (!region || region.type !== 'BOX_2D' || region.coordinateSystem !== 'NORMALIZED_1000') return null;
  const raw = region.box;
  if (!Array.isArray(raw) || raw.length !== 4 || !raw.every((value) => typeof value === 'number')) return null;
  const [ymin, xmin, ymax, xmax] = raw as number[];
  if ([ymin, xmin, ymax, xmax].some((value) => value < 0 || value > 1000)) return null;
  if (xmax <= xmin || ymax <= ymin) return null;
  return {
    x: xmin / 1000,
    y: ymin / 1000,
    w: (xmax - xmin) / 1000,
    h: (ymax - ymin) / 1000,
  };
}

export function hasP2BoxedEvidence(
  field: Pick<P2DocumentReviewField, 'pageNo' | 'evidenceRegion'>,
): boolean {
  return Boolean(normalizedBox(field.evidenceRegion) && field.pageNo && field.pageNo > 0);
}

function displayField(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export default function P2EvidenceViewer({
  tenantId,
  journeyId,
  documentId,
  originalFilename,
  accessToken,
  field,
  onClose,
}: {
  tenantId: string;
  journeyId: string;
  documentId: string;
  originalFilename: string;
  accessToken?: string;
  field: P2DocumentReviewField;
  onClose: () => void;
}) {
  const box = useMemo(() => normalizedBox(field.evidenceRegion), [field.evidenceRegion]);
  const query = useQuery({
    queryKey: ['p2-document-content', tenantId, journeyId, documentId],
    queryFn: () => getP2DocumentContent(tenantId, journeyId, documentId, accessToken),
    staleTime: 5 * 60 * 1000,
  });
  const [objectUrl, setObjectUrl] = useState<string>();

  useEffect(() => {
    if (!query.data?.blob) {
      setObjectUrl(undefined);
      return undefined;
    }
    const next = URL.createObjectURL(query.data.blob);
    setObjectUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [query.data?.blob]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handler);
      document.body.style.overflow = old;
    };
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  const contentType = query.data?.contentType || '';
  const isPdf = contentType.includes('pdf') || originalFilename.toLowerCase().endsWith('.pdf');
  const isImage = contentType.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(originalFilename);

  return createPortal(
    <div className="p2-evidence-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.currentTarget === event.target) onClose();
    }}>
      <section className="p2-evidence-modal" role="dialog" aria-modal="true" aria-label={'Evidence for ' + field.fieldKey}>
        <header className="p2-evidence-modal__header">
          <div>
            <span className="eyebrow">Source evidence</span>
            <h2>{displayField(field.fieldKey)}</h2>
            <p>{originalFilename}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close evidence viewer">×</button>
        </header>

        <div className="p2-evidence-modal__body">
          {query.isLoading ? <div className="p2-preview-message">Loading source document…</div> : null}
          {query.isError ? <div className="p2-preview-message p2-attention">Source document is temporarily unavailable.</div> : null}

          {objectUrl && isPdf ? (
            <PdfPageReview
              sourceUrl={objectUrl}
              pageNumber={field.pageNo || 1}
              box={box}
              label={displayField(field.fieldKey)}
              attention={field.confidenceScore !== null && field.confidenceScore >= 90}
            />
          ) : null}

          {objectUrl && isImage ? (
            <div className="p2-evidence-image-wrap">
              <div className="p2-evidence-image-stage">
                <img src={objectUrl} alt={originalFilename} />
                {box ? (
                  <span
                    className="p2-evidence-image-box"
                    style={{
                      left: String(box.x * 100) + '%',
                      top: String(box.y * 100) + '%',
                      width: String(box.w * 100) + '%',
                      height: String(box.h * 100) + '%',
                    }}
                  />
                ) : null}
              </div>
            </div>
          ) : null}

          {objectUrl && !isPdf && !isImage ? (
            <div className="p2-preview-message">Preview is not available for this file type.</div>
          ) : null}
        </div>

        <footer className="p2-evidence-modal__footer">
          <div>
            <span>Extracted</span>
            <strong>{String(field.extractedValue ?? 'Not extracted')}</strong>
          </div>
          <div>
            <span>Effective</span>
            <strong>{String(field.effectiveValue ?? 'Not extracted')}</strong>
          </div>
          <div>
            <span>Confidence</span>
            <strong>{field.confidenceScore === null ? '—' : String(field.confidenceScore) + '%'}</strong>
          </div>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
