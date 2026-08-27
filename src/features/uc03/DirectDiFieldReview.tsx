import { useEffect, useMemo, useState } from 'react';

import '../../styles/uc03-document-verification.css';
import '../../styles/uc03-step3-review.css';
import type {
  PcBookingDocumentContent,
  PcBookingExtractionFact,
} from '../../services/di/bookingDocuments';
import { displayName } from '../../utils/displayNames';

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
  const [selectedRef, setSelectedRef] = useState<string | null>(null);
  const [editingRef, setEditingRef] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [sourceUrl, setSourceUrl] = useState<string>();

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
    if (!content?.blob) {
      setSourceUrl(undefined);
      return undefined;
    }
    const url = URL.createObjectURL(content.blob);
    setSourceUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [content?.blob]);

  const selected = useMemo(
    () => facts.find((fact) => fact.sourceFactRef === selectedRef) ?? null,
    [facts, selectedRef],
  );
  const modifiedCount = Object.keys(modifiedValues).length;
  const mimeType = content?.mimeType || '';
  const isImage = mimeType.startsWith('image/');
  const isPdf = mimeType.includes('pdf');

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
          <div className="uc03-docverify-scroller">
            {contentLoading ? <div className="uc03-docverify-message">Loading source document…</div> : null}
            {contentError ? <div className="uc03-docverify-message is-error">{contentError}</div> : null}

            {!contentLoading && !contentError && sourceUrl && isImage ? (
              <div className="uc03-docverify-image-page">
                <img src={sourceUrl} alt={`${documentName} source`} draggable={false} />
              </div>
            ) : null}

            {!contentLoading && !contentError && sourceUrl && isPdf ? (
              <div className="uc03-docverify-pdf">
                <iframe
                  src={selected?.pageNo ? `${sourceUrl}#page=${selected.pageNo}` : sourceUrl}
                  title={`${documentName} source document`}
                />
                <a href={selected?.pageNo ? `${sourceUrl}#page=${selected.pageNo}` : sourceUrl} target="_blank" rel="noreferrer">
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
          <div className="uc03-docverify-source-note">
            Values and the source document are read directly from Document Intelligence. Change only values that are incorrect.
          </div>
        </div>

        <aside className="uc03-docverify-panel is-wide">
          <div className="uc03-docverify-panel__head">
            <div>
              <strong>What DI Read</strong>
              <span>All fields returned by DI are shown. Unchanged values need no action.</span>
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
