import { useMemo } from 'react';

import type {
  AuditSourceComparisonV2,
  ReviewV2SourceValue,
} from '../../services/audit-core/uc03DocumentReviewV2';
import { hasBoxedEvidence } from './AttributeEvidenceViewer';

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function confidence(value: number | null): string {
  if (value === null || value === undefined) return 'confidence —';
  return `${value.toFixed(value % 1 === 0 ? 0 : 1)}% confidence`;
}

function resultLabel(value: string): string {
  if (value === 'MATCH') return 'Match';
  if (value === 'MISMATCH') return 'Mismatch';
  if (value === 'SINGLE_SOURCE') return 'Single source';
  return 'Not available';
}

function SourceValue({
  source,
  value,
  onEvidence,
  prefix,
}: {
  source: ReviewV2SourceValue;
  value: unknown;
  onEvidence: (source: ReviewV2SourceValue) => void;
  prefix?: string;
}) {
  const boxed = hasBoxedEvidence(source);
  return (
    <>
      {boxed ? (
        <button type="button" className="uc03-source-value-button" onClick={() => onEvidence(source)}>
          {displayValue(value)}
        </button>
      ) : (
        <strong>{displayValue(value)}</strong>
      )}
      <small>
        {prefix ? `${prefix} · ` : ''}{confidence(source.confidenceScore)} · {boxed ? 'boxed evidence' : 'source location unavailable'}
      </small>
    </>
  );
}

export default function AuditSourceComparisonTable({
  comparison,
  onEvidence,
}: {
  comparison: AuditSourceComparisonV2;
  onEvidence: (source: ReviewV2SourceValue) => void;
}) {
  const sourceColumns = useMemo(() => {
    const seen = new Map<string, { documentId: string; label: string; type: string | null }>();
    comparison.attributes.forEach((attribute) => {
      attribute.sources.forEach((source) => {
        if (!seen.has(source.documentId)) {
          seen.set(source.documentId, {
            documentId: source.documentId,
            label: source.documentLabel,
            type: source.documentTypeKey,
          });
        }
      });
    });
    return [...seen.values()].sort((left, right) => (
      left.label.localeCompare(right.label) || left.documentId.localeCompare(right.documentId)
    ));
  }, [comparison.attributes]);

  return (
    <section className="uc03-c3-section uc03-audit-source-comparison" aria-labelledby="source-comparison-heading">
      <header>
        <div>
          <span>Cross-source audit view</span>
          <h2 id="source-comparison-heading">Attribute Source Comparison</h2>
          <p>Every displayed cell is read live from Document Intelligence. Click a value only when boxed source evidence is available; missing source locations are shown explicitly and no bounding box is invented.</p>
        </div>
        {comparison.processingPending && <span className="uc03-attribute-status pending">Processing continues</span>}
      </header>

      <div className="uc03-source-comparison-wrap">
        <table className="uc03-source-comparison-table">
          <thead>
            <tr>
              <th>Attribute</th>
              <th>Resolved value</th>
              {sourceColumns.map((source) => (
                <th key={source.documentId}>
                  {source.label}
                  {source.type && <small>{source.type}</small>}
                </th>
              ))}
              <th>Audit result</th>
            </tr>
          </thead>
          <tbody>
            {comparison.attributes.map((attribute) => {
              const byDocument = new Map(attribute.sources.map((source) => [source.documentId, source]));
              return (
                <tr key={attribute.attributeKey}>
                  <td className="uc03-attribute-name-cell">
                    <strong>{attribute.label}</strong>
                    <span>{attribute.excelFieldNo ? `Excel #${attribute.excelFieldNo}` : 'Booking business field'}</span>
                  </td>
                  <td className="uc03-source-cell">
                    {attribute.resolvedSource ? (
                      <SourceValue
                        source={attribute.resolvedSource}
                        value={attribute.resolvedValue}
                        prefix={attribute.resolvedSource.documentLabel}
                        onEvidence={onEvidence}
                      />
                    ) : '—'}
                  </td>
                  {sourceColumns.map((column) => {
                    const source = byDocument.get(column.documentId);
                    return (
                      <td key={column.documentId} className="uc03-source-cell">
                        {source ? (
                          <SourceValue source={source} value={source.value} onEvidence={onEvidence} />
                        ) : '—'}
                      </td>
                    );
                  })}
                  <td>
                    <span className={`uc03-source-comparison-state ${attribute.comparisonState.toLowerCase().replace('_', '-')}`}>
                      {resultLabel(attribute.comparisonState)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {comparison.unmappedFields.length > 0 && (
        <p className="uc03-c3-note">
          {comparison.unmappedFields.length} extracted value{comparison.unmappedFields.length === 1 ? '' : 's'} remain explicitly unmapped and are excluded from resolution until an approved UC03 mapping is defined.
        </p>
      )}
    </section>
  );
}
