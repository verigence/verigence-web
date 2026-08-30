import { useEffect, useMemo, useRef, useState } from 'react';

import '../../styles/uc03-document-verification.css';
import '../../styles/uc03-step3-review.css';
import type {
  PcBookingDocumentContent,
  PcBookingExtractionFact,
} from '../../services/di/bookingDocuments';
import { displayName } from '../../utils/displayNames';
import { PdfPageReview } from './PdfPageReview';

interface DirectDiFieldReviewProps {
  documentName: string;
  facts: PcBookingExtractionFact[];
  content?: PcBookingDocumentContent;
  contentLoading?: boolean;
  contentError?: string;
  modifiedValues: Record<string, string>;
  disabled?: boolean;
  onModify: (fact: PcBookingExtractionFact, value: string) => void;
  onReset: (fact: PcBookingExtractionFact) => void;
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

function reviewFieldGroup(fieldKey: string): number {
  const key = fieldKey.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const has = (...tokens: string[]) => tokens.some((token) => key.includes(token));

  // Keep document-specific identity fields together before applying generic
  // name/contact matching (for example PAN Name + PAN Number).
  if (has(
    'pan_', '_pan', 'pan_number',
    'aadhaar', 'aadhar',
    'passport',
    'driving_licence', 'driving_license', 'licence_number', 'license_number',
    'identity_', '_identity',
  )) return 3;

  if (has('customer', 'applicant', 'buyer', 'owner', 'contact_person')) return 0;
  if (has('booking', 'order_', '_order', 'enquiry', 'inquiry', 'quotation', 'quote_')) return 1;
  if (has(
    'vehicle', 'make_', '_make', 'model', 'variant', 'colour', 'color',
    'vin', 'chassis', 'engine', 'registration', 'reg_no', 'registration_no',
  )) return 2;
  if (has(
    'amount', 'price', 'discount', 'payment', 'finance', 'loan', 'emi',
    'bank', 'tax', 'gst', 'invoice', 'receipt',
  )) return 4;
  if (has('dealer', 'outlet', 'showroom', 'branch', 'salesperson', 'sales_person', 'consultant')) return 5;
  if (has('insurance', 'insurer', 'policy', 'premium')) return 6;

  // Generic contact/person fields that do not carry a stronger business prefix.
  if (has(
    'name', 'phone', 'mobile', 'email', 'address', 'city', 'state',
    'pincode', 'pin_code', 'postal', 'dob', 'date_of_birth', 'gender',
  )) return 0;

  return 7;
}

function orderReviewFacts(facts: PcBookingExtractionFact[]): PcBookingExtractionFact[] {
  return facts
    .map((fact, index) => ({ fact, index, group: reviewFieldGroup(fact.fieldKey) }))
    .sort((left, right) => left.group - right.group || left.index - right.index)
    .map(({ fact }) => fact);
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

export function DirectDiFieldReview({
  documentName,
  facts,
  content,
  contentLoading = false,
  contentError,
  modifiedValues,
  disabled = false,
  onModify,
  onReset,
}: DirectDiFieldReviewProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [selectedRef, setSelectedRef] = useState<string | null>(null);
  const [editingRef, setEditingRef] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [sourceUrl, setSourceUrl] = useState<string>();
  const [imageReady, setImageReady] = useState(false);
  const orderedFacts = useMemo(() => orderReviewFacts(facts), [facts]);

  useEffect(() => {
    if (!orderedFacts.length) {
      setSelectedRef(null);
      return;
    }
    if (!selectedRef || !orderedFacts.some((fact) => fact.sourceFactRef === selectedRef)) {
      setSelectedRef(orderedFacts[0].sourceFactRef);
    }
  }, [orderedFacts, selectedRef]);

  useEffect(() => {
    setImageReady(false);
    if (!content?.blob) {
      setSourceUrl(undefined);
      return undefined;
    }
    const url = URL.createObjectURL(content.blob);
    setSourceUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [content?.blob]);

  const selected = useMemo(
    () => orderedFacts.find((fact) => fact.sourceFactRef === selectedRef) ?? null,
    [orderedFacts, selectedRef],
  );
  const selectedBox = normalizedBox(selected?.evidenceRegion ?? null);
  const selectedPage = selected?.pageNo && selected.pageNo > 0 ? selected.pageNo : 1;
  const modifiedCount = Object.keys(modifiedValues).length;
  const mimeType = content?.mimeType || '';
  const isImage = mimeType.startsWith('image/');
  const isPdf = mimeType.includes('pdf');

  useEffect(() => {
    if (!selectedBox || !isImage || !imageReady) return;
    const scroller = scrollerRef.current;
    const image = imageRef.current;
    if (!scroller || !image || image.clientHeight <= 0) return;
    const absoluteY = image.offsetTop + selectedBox.y * image.clientHeight;
    const target = absoluteY - Math.max(70, scroller.clientHeight * 0.42);
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    scroller.scrollTo({ top: Math.max(0, target), behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [imageReady, isImage, selectedBox?.h, selectedBox?.w, selectedBox?.x, selectedBox?.y]);

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
    ? selectedBox
      ? `Selected value is highlighted on ${isPdf ? `PDF page ${selectedPage}` : 'the source document'}.`
      : selected.pageNo
        ? `Selected value was localized to page ${selected.pageNo}; no reliable box was returned.`
        : 'No reliable source region was returned for this value.'
    : 'Values and the source document are read directly from Document Intelligence.';

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
            {contentLoading ? <div className="uc03-docverify-message">Loading source document…</div> : null}
            {contentError ? <div className="uc03-docverify-message is-error">{contentError}</div> : null}

            {!contentLoading && !contentError && sourceUrl && isImage ? (
              <div className="uc03-docverify-image-page">
                <img
                  ref={imageRef}
                  src={sourceUrl}
                  alt={`${documentName} source`}
                  draggable={false}
                  onLoad={() => setImageReady(true)}
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

            {!contentLoading && !contentError && sourceUrl && isPdf ? (
              <div className="uc03-docverify-pdf">
                <PdfPageReview
                  sourceUrl={sourceUrl}
                  pageNumber={selectedPage}
                  box={selectedBox}
                  label={selected ? displayName(selected.fieldKey) : null}
                />
                <a href={`${sourceUrl}#page=${selectedPage}`} target="_blank" rel="noreferrer">
                  Open PDF in full viewer
                </a>
              </div>
            ) : null}

            {!contentLoading && !contentError && sourceUrl && !isImage && !isPdf ? (
              <div className="uc03-docverify-message">
                <span>Inline preview is not available for this file type.</span>
                <a href={sourceUrl} target="_blank" rel="noreferrer">Open source document</a>
              </div>
            ) : null}

            {!contentLoading && !contentError && !sourceUrl ? (
              <div className="uc03-docverify-message">Source document is not available.</div>
            ) : null}
          </div>
          <div className="uc03-docverify-source-note">{sourceNote}</div>
        </div>

        <aside className="uc03-docverify-panel is-wide">
          <div className="uc03-docverify-panel__head">
            <div>
              <strong>What DI Read</strong>
              <span>All fields returned by DI are shown. Unchanged values need no action.</span>
            </div>
            <span>{facts.length} fields</span>
          </div>

          {orderedFacts.length ? (
            <ul className="uc03-docverify-fields">
              {orderedFacts.map((fact) => {
                const selectedField = fact.sourceFactRef === selectedRef;
                const editing = fact.sourceFactRef === editingRef;
                const modified = Object.prototype.hasOwnProperty.call(modifiedValues, fact.sourceFactRef);
                const shownValue = modified ? modifiedValues[fact.sourceFactRef] : displayValue(factValue(fact));
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
