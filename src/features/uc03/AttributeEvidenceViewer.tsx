import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { getReviewDocumentContentV2, type ReviewV2SourceValue } from '../../services/audit-core/uc03DocumentReviewV2';
import PdfPageReview from './PdfPageReview';

interface NormalizedBox {
  x: number;
  y: number;
  width: number;
  height: number;
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
    width: (xmax - xmin) / 1000,
    height: (ymax - ymin) / 1000,
  };
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
  const contentQuery = useQuery({
    queryKey: ['uc03-review-document-content', tenantId, journeyId, source.documentId],
    queryFn: () => getReviewDocumentContentV2(tenantId, journeyId, source.documentId, accessToken),
    staleTime: 5 * 60 * 1000,
  });
  const [objectUrl, setObjectUrl] = useState<string>();

  useEffect(() => {
    if (!contentQuery.data?.blob) {
      setObjectUrl(undefined);
      return undefined;
    }
    const next = URL.createObjectURL(contentQuery.data.blob);
    setObjectUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [contentQuery.data?.blob]);

  const box = useMemo(() => normalizedBox(source.evidenceRegion), [source.evidenceRegion]);
  const contentType = contentQuery.data?.contentType || '';
  const filename = source.originalFilename.toLowerCase();
  const isPdf = contentType.includes('pdf') || filename.endsWith('.pdf');
  const isImage = contentType.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp)$/i.test(filename);

  return (
    <div className="uc03-attribute-evidence-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.currentTarget === event.target) onClose();
    }}>
      <section className="uc03-attribute-evidence-modal" role="dialog" aria-modal="true" aria-label={`Evidence for ${source.fieldKey}`}>
        <header className="uc03-attribute-evidence-header">
          <div>
            <span>Source evidence</span>
            <h2>{source.documentLabel}</h2>
            <p>{source.originalFilename}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close evidence viewer">×</button>
        </header>

        <div className="uc03-attribute-evidence-layout">
          <div className="uc03-attribute-evidence-preview">
            {contentQuery.isPending && <div className="uc03-attribute-evidence-message">Loading source document…</div>}
            {contentQuery.isError && <div className="uc03-attribute-evidence-message is-error">The source document could not be loaded. Try again.</div>}
            {objectUrl && isPdf && (
              <PdfPageReview
                sourceUrl={objectUrl}
                pageNumber={source.pageNo || 1}
                box={box}
                label={source.fieldKey}
                attention={source.reviewState === 'NEEDS_REVIEW'}
              />
            )}
            {objectUrl && isImage && (
              <div className="uc03-attribute-image-frame">
                <img src={objectUrl} alt={source.originalFilename} />
                {box && (
                  <span
                    className={`uc03-attribute-image-box ${source.reviewState === 'NEEDS_REVIEW' ? 'needs-review' : ''}`}
                    style={{
                      left: `${box.x * 100}%`,
                      top: `${box.y * 100}%`,
                      width: `${box.width * 100}%`,
                      height: `${box.height * 100}%`,
                    }}
                    aria-hidden="true"
                  />
                )}
              </div>
            )}
            {objectUrl && !isPdf && !isImage && (
              <div className="uc03-attribute-evidence-message">
                Preview is not available for this file type.
                <a href={objectUrl} target="_blank" rel="noreferrer">Open source document</a>
              </div>
            )}
          </div>

          <aside className="uc03-attribute-evidence-detail">
            <span className="uc03-attribute-evidence-kicker">Extracted field</span>
            <h3>{source.fieldKey.replace(/[_-]+/g, ' ')}</h3>
            <strong className="uc03-attribute-evidence-value">{displayValue(source.value)}</strong>
            <dl>
              <div><dt>Confidence</dt><dd>{confidence(source.confidenceScore)}</dd></div>
              <div><dt>Document type</dt><dd>{source.documentTypeKey || source.documentLabel}</dd></div>
              <div><dt>Page</dt><dd>{source.pageNo || '—'}</dd></div>
              <div><dt>Evidence box</dt><dd>{box ? 'Located' : 'Not returned'}</dd></div>
              <div><dt>Review state</dt><dd>{source.reviewState === 'READY' ? 'Ready' : 'Needs review'}</dd></div>
            </dl>
            <p>Verigence is displaying the value directly from Document Intelligence. The source document and machine extraction remain unchanged.</p>
          </aside>
        </div>
      </section>
    </div>
  );
}
