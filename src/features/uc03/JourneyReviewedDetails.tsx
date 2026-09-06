import SectionCard from '../../components/SectionCard';
import type { JourneyReviewedField } from '../../services/audit-core/uc03JourneySearch';

const CATEGORY_ORDER = [
  'CUSTOMER',
  'BOOKING',
  'VEHICLE_INVOICE',
  'DELIVERY',
  'REGISTRATION',
  'INSURANCE',
  'PAYMENTS',
  'EXTENDED_WARRANTY',
  'RSA',
  'ACCESSORIES',
  'TRADE_IN',
  'FINANCE',
  'GST',
  'CORPORATE',
  'OTHER',
];

const CATEGORY_LABELS: Record<string, string> = {
  CUSTOMER: 'Customer / KYC',
  BOOKING: 'Booking',
  VEHICLE_INVOICE: 'Vehicle / Invoice',
  DELIVERY: 'Delivery',
  REGISTRATION: 'Registration',
  INSURANCE: 'Insurance',
  PAYMENTS: 'Payments / Receipts',
  EXTENDED_WARRANTY: 'Extended Warranty',
  RSA: 'RSA',
  ACCESSORIES: 'Accessories',
  TRADE_IN: 'Trade-in / Exchange',
  FINANCE: 'Finance',
  GST: 'GST',
  CORPORATE: 'Corporate',
  OTHER: 'Other reviewed data',
};

function readable(value: string | null | undefined): string {
  if (!value) return 'Not available';
  return value
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function fieldStatus(field: JourneyReviewedField): string {
  if (!field.hasEffectiveValue) return 'Rejected / source only';
  if (field.isPreferred) return 'Current value';
  if (field.isModified) return 'Corrected source';
  return 'Alternate source';
}

function precedenceLabel(field: JourneyReviewedField): string | null {
  if (!field.isPreferred) return null;
  switch (field.precedenceReason) {
    case 'CUSTOMER_KYC_SOURCE_OF_TRUTH':
      return 'PAN / Aadhaar source of truth';
    case 'DELIVERY_OVER_BOOKING':
      return 'Delivery takes precedence';
    case 'DELIVERY_CURRENT_SOURCE':
      return 'Delivery current source';
    case 'BOOKING_CURRENT_SOURCE':
      return 'Booking current source';
    case 'ONLY_REVIEWED_SOURCE':
      return 'Only reviewed source';
    default:
      return null;
  }
}

function sourceLabel(field: JourneyReviewedField): string {
  const stage = readable(field.stageCode);
  const document = readable(field.documentTypeKey || field.requirementKey || 'document');
  const filename = field.originalFilename ? ` · ${field.originalFilename}` : '';
  return `${stage} · ${document}${filename}`;
}

function categorySort(left: string, right: string): number {
  const leftIndex = CATEGORY_ORDER.indexOf(left);
  const rightIndex = CATEGORY_ORDER.indexOf(right);
  return (leftIndex < 0 ? CATEGORY_ORDER.length : leftIndex)
    - (rightIndex < 0 ? CATEGORY_ORDER.length : rightIndex);
}

export default function JourneyReviewedDetails({ fields }: { fields: JourneyReviewedField[] }) {
  if (fields.length === 0) return null;

  const grouped = new Map<string, JourneyReviewedField[]>();
  for (const field of fields) {
    const category = field.businessCategory || 'OTHER';
    const existing = grouped.get(category) || [];
    existing.push(field);
    grouped.set(category, existing);
  }

  const categories = [...grouped.keys()].sort(categorySort);

  return (
    <SectionCard
      title="Complete Reviewed Document Data"
      description="Every DI field retained in Audit Core. PAN/Aadhaar are the customer source of truth; after Delivery review, Delivery values take precedence over overlapping Booking values. Alternate and rejected source values remain visible for audit traceability."
    >
      {categories.map((category) => {
        const rows = [...(grouped.get(category) || [])].sort((left, right) => {
          if (left.isPreferred !== right.isPreferred) return left.isPreferred ? -1 : 1;
          const semantic = left.semanticKey.localeCompare(right.semanticKey);
          if (semantic !== 0) return semantic;
          const stage = String(left.stageCode).localeCompare(String(right.stageCode));
          if (stage !== 0) return stage;
          return String(left.documentTypeKey || '').localeCompare(String(right.documentTypeKey || ''));
        });

        return (
          <div className="journey-360-subsection" key={category}>
            <strong>{CATEGORY_LABELS[category] || readable(category)}</strong>
            <div className="journey-360-table-wrap">
              <table className="journey-360-table">
                <thead>
                  <tr>
                    <th>Attribute</th>
                    <th>Reviewed value</th>
                    <th>Source</th>
                    <th>Resolution</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((field) => {
                    const precedence = precedenceLabel(field);
                    return (
                      <tr key={field.reviewedFieldId}>
                        <td>
                          <strong>{readable(field.semanticKey)}</strong>
                          {field.fieldKey !== field.semanticKey && (
                            <small>{readable(field.fieldKey)}</small>
                          )}
                        </td>
                        <td>{formatValue(field.displayValue)}</td>
                        <td>
                          {sourceLabel(field)}
                          {field.confidenceScore !== null && field.confidenceScore !== undefined && (
                            <small>Confidence: {String(field.confidenceScore)} {field.confidenceScale || ''}</small>
                          )}
                        </td>
                        <td>
                          <strong>{fieldStatus(field)}</strong>
                          {precedence && <small>{precedence}</small>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </SectionCard>
  );
}
