import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';

import '../../styles/uc03-document-verification.css';
import '../../styles/uc03-step3-review.css';
import type { PcBookingExtractionFact } from '../../services/di/bookingDocuments';
import type { PcBookingDocumentPreviewSource } from '../../services/di/bookingPreview';
import { displayName } from '../../utils/displayNames';

const OptimizedPdfPageReview = lazy(() => import('./OptimizedPdfPageReview').then((module) => ({
  default: module.OptimizedPdfPageReview,
})));

interface OptimizedDirectDiFieldReviewProps {
  documentName: string;
  facts: PcBookingExtractionFact[];
  content?: PcBookingDocumentPreviewSource;
  contentLoading?: boolean;
  contentError?: string;
  modifiedValues: Record<string, string>;
  disabled?: boolean;
  onModify: (fact: PcBookingExtractionFact, value: string) => void;
  onReset: (fact: PcBookingExtractionFact) => void;
  onPreviewSettled?: () => void;
}

interface NormalizedBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

function factValue(fact: PcBookingExtractionFact): unknown {
  return fact.normalizedValue ?? fact.rawValue;
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return 'Not Found';
  if (typeof value === 'string') return value || 'Blank';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function confidencePercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'Confidence unavailable';
  const percent = value <= 1 ? value * 100 : value;
  return `${Math.round(Math.max(0, Math.min(100, percent)))}% confidence`;
}

function normalizedBox(region: PcBookingExtractionFact['evidenceRegion']): NormalizedBox | null {
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

export function OptimizedDirectDiFieldReview({
  documentName,
  facts,
  content,
  contentLoading = false,
  contentError,
  modifiedValues,
  disabled = false,
  onModify,
  onReset,
  onPreviewSettled,
}: OptimizedDirectDiFieldReviewProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const previewSettledRef = useRef(false);
  const [selectedRef, setSelectedRef] = useState<string | null>(null);
  const [editingRef, setEditingRef] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [sourceUrl, setSourceUrl] = useState<string>();
  const [imageReady, setImageReady] = useState(false);

  const notifyPreviewSettled = () => {
    if (previewSettledRef.current) return;
    previewSettledRef.current = true;
    onPreviewSettled?.();
  };

  useEffect(() => {
    if (!facts.length) {
      setSelectedRef(null);
      return;
    }
    if (!selectedRef || !facts.some((fact) => fact.sourceFactRef === selectedRef)) {
      setSelectedRef(facts[0].sourceFactRef);
    }
  }, [facts, selectedRef]);

  useEffect(() => {
    previewSettledRef.current = false;
    setImageReady(false);
    if (content?.directUrl) {
      setSourceUrl(content.directUrl);
      return undefined;
    }
    if (!content?.blob) {
      setSourceUrl(undefined);
      return undefined;
    }
    const url = URL.createObjectURL(content.blob);
    setSourceUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [content?.blob, content?.directUrl]);

  const selected = useMemo(
    () => facts.find((fact) => fact.sourceFactRef === selectedRef) ?? null,
    [facts, selectedRef],
  );
  const selectedBox = normalizedBox(selected?.evidenceRegion ?? null);
  const selectedPage = selected?.pageNo && selected.pageNo > 0 ? selected.pageNo : 1;
  const modifiedCount = Object.keys(modifiedValues).length;
  const mimeType = content?.mimeType || '';
  const isImage = mimeType.startsWith('image/');
  const isPdf = mimeType.includes('pdf');
  const selectedLocalized = Boolean(selectedBox && (!isPdf || Boolean(selected?.pageNo && selected.pageNo > 0)));
  const fieldEvidenceVisible = !selected || selectedLocalized;

  useEffect(() => {
    if (contentError || (!contentLoading && content && !sourceUrl)) notifyPreviewSettled();
  }, [content, contentError, contentLoading, sourceUrl]);

  useEffect(() => {
    if (selected && !selectedLocalized) notifyPreviewSettled();
  }, [selected, selectedLocalized]);

  useEffect(() => {
    if (!contentLoading && sourceUrl && fieldEvidenceVisible && !isImage && !isPdf) notifyPreviewSettled();
  }, [contentLoading, fieldEvidenceVisible, isImage, isPdf, sourceUrl]);

  useEffect(() => {
    if (!selectedLocalized || !selectedBox || !isImage || !imageReady) return;
    const scroller = scrollerRef.current;
    const image = imageRef.current;
    if (!scroller || !image || image.clientHeight <= 0) return;
    const absoluteY = image.offsetTop + selectedBox.y * image.clientHeight;
    const target = absoluteY - Math.max(70, scroller.clientHeight * 0.42);
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    scroller.scrollTo({ top: Math.max(0, target), behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [imageReady, isImage, selectedBox?.h, selectedBox?.w, selectedBox?.x, selectedBox?.y, selectedLocalized]);

  const startEdit = (fact: PcBookingExtractionFact) => {
    setSelectedRef(fact.sourceFactRef);
    setEditValue(modifiedValues[fact.sourceFactRef] ?? displayValue(factValue(fact)));
    setEditingRef(fact.sourceFactRef);
  };

  const saveEdit = (fact: PcBookingExtractionFact) => {
    const value = editValue.trim();
    if (!value || disabled) return;
    const original = displayValue(factValue(fact));
    if (value === original) {
      onReset(fact);
    } else {
      onModify(fact, value);
    }
    setEditingRef(null);
  };

  const sourceNote = selected
    ? selectedLocalized
      ? `Selected value is boxed on ${isPdf ? `PDF page ${selectedPage}` : 'the source document'}.`
      : 'Source location unavailable. The unboxed document is intentionally not shown for this extracted-field review.'
    : 'No extracted field is selected, so the source document can be viewed normally without a field box.';

  return (
    <div className="uc03-docverify is-wide">
      <div className="uc03-docverify-bar">
        <div>
          <strong>{documentName}</strong>
          <span>{facts.length} DI extracted field{facts.length === 1 ? '' : 's'}</span>
        </div>
        <div className="uc03-docverify-bar__status">
          <span>{modifiedCount} changed</span>
        </div>
      </div>

      <div className="uc03-docverify-body is-wide">
        <div className="uc03-docverify-canvas">
          <div ref={scrollerRef} className="uc03-docverify-scroller">
            {selected && !selectedLocalized ? (
              <div className="uc03-docverify-message is-error">
                Source location unavailable. Document Intelligence returned this value without a reliable page/bounding box. Verigence does not show an unboxed document as extracted-field evidence and does not invent a box.
              </div>
            ) : null}
            {fieldEvidenceVisible && contentLoading ? <div className="uc03-docverify-message">Loading source document…</div> : null}
            {fieldEvidenceVisible && contentError ? <div className="uc03-docverify-message is-error">{contentError}</div> : null}

            {fieldEvidenceVisible && !contentLoading && !contentError && sourceUrl && isImage ? (
              <div className="uc03-docverify-image-page">
                <img
                  ref={imageRef}
                  src={sourceUrl}
                  alt={`${documentName} source`}
                  draggable={false}
                  onLoad={() => {
                    setImageReady(true);
                    notifyPreviewSettled();
                  }}
                  onError={notifyPreviewSettled}
                />
                {selectedBox ? (
                  <div
                    className="uc03-docverify-highlight"
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

            {fieldEvidenceVisible && !contentLoading && !contentError && sourceUrl && isPdf ? (
              <div className="uc03-docverify-pdf">
                <Suspense fallback={<div className="uc03-docverify-message">Preparing PDF viewer…</div>}>
                  <OptimizedPdfPageReview
                    sourceUrl={sourceUrl}
                    pageNumber={selectedPage}
                    box={selectedBox}
                    label={selected ? displayName(selected.fieldKey) : null}
                    rangeCapable={content?.rangeCapable ?? false}
                    onFirstRenderSettled={notifyPreviewSettled}
                  />
                </Suspense>
                {!selected ? (
                  <a href={`${sourceUrl}#page=${selectedPage}`} target="_blank" rel="noreferrer">
                    Open PDF in full viewer
                  </a>
                ) : null}
              </div>
            ) : null}

            {fieldEvidenceVisible && !contentLoading && !contentError && sourceUrl && !isImage && !isPdf ? (
              <div className="uc03-docverify-message">
                <span>{selected ? 'Boxed preview is not supported for this file type.' : 'Inline preview is not available for this file type.'}</span>
                {!selected ? <a href={sourceUrl} target="_blank" rel="noreferrer">Open source document</a> : null}
              </div>
            ) : null}

            {fieldEvidenceVisible && !contentLoading && !contentError && !sourceUrl ? (
              <div className="uc03-docverify-message">Source document is not available.</div>
            ) : null}
          </div>
          <div className="uc03-docverify-source-note">{sourceNote}</div>
        </div>

        <aside className="uc03-docverify-panel is-wide">
          <div className="uc03-docverify-panel__head">
            <div>
              <strong>What DI Read</strong>
              <span>All fields returned by DI are shown. Select a field to see its boxed source location.</span>
            </div>
            <span>{facts.length} fields</span>
          </div>

          {facts.length ? (
            <ul className="uc03-docverify-fields">
              {facts.map((fact) => {
                const selectedField = fact.sourceFactRef === selectedRef;
                const editing = fact.sourceFactRef === editingRef;
                const modified = Object.prototype.hasOwnProperty.call(modifiedValues, fact.sourceFactRef);
                const shownValue = modified ? modifiedValues[fact.sourceFactRef] : displayValue(factValue(fact));
                const factLocalized = Boolean(normalizedBox(fact.evidenceRegion) && (!isPdf || Boolean(fact.pageNo && fact.pageNo > 0)));
                return (
                  <li
                    key={`${fact.sourceFactRef}:${fact.sourceFactVersion}`}
                    className={`uc03-docverify-field ${selectedField ? 'is-selected' : ''} ${modified ? 'is-reviewed' : ''}`}
                  >
                    <button
                      type="button"
                      className="uc03-docverify-field__summary"
                      aria-expanded={selectedField}
                      onClick={() => {
                        setSelectedRef(fact.sourceFactRef);
                        setEditingRef(null);
                      }}
                    >
                      <span>{displayName(fact.fieldKey)}</span>
                      <strong>{shownValue}</strong>
                      {modified ? <b aria-label="Changed">✎</b> : null}
                    </button>

                    {selectedField ? (
                      <div className="uc03-docverify-field__details">
                        <div className="uc03-docverify-field__meta">
                          <span>{confidencePercent(fact.confidenceScore)}</span>
                          <span>{fact.foundStatus}</span>
                          {fact.pageNo ? <span>Page {fact.pageNo}</span> : null}
                          <span>{factLocalized ? 'Boxed source' : 'Source location unavailable'}</span>
                          {modified ? <span>PC changed</span> : null}
                        </div>

                        {editing ? (
                          <div className="uc03-docverify-edit">
                            <label>
                              <span>Correct value</span>
                              <input
                                autoFocus
                                value={editValue}
                                disabled={disabled}
                                onChange={(event) => setEditValue(event.target.value)}
                              />
                            </label>
                            <div>
                              <button type="button" className="is-primary" disabled={disabled || !editValue.trim()} onClick={() => saveEdit(fact)}>
                                Save Change
                              </button>
                              <button type="button" disabled={disabled} onClick={() => setEditingRef(null)}>Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <div className="uc03-docverify-actions">
                            <button type="button" disabled={disabled} onClick={() => startEdit(fact)}>Change Value</button>
                            {modified ? (
                              <button type="button" disabled={disabled} onClick={() => onReset(fact)}>Use DI Value</button>
                            ) : null}
                          </div>
                        )}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="uc03-docverify-empty">
              <strong>DI returned no extracted fields.</strong>
              <span>You can still save the document review after checking the source document.</span>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
