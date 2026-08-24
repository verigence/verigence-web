const TOKEN_LABELS: Record<string, string> = {
  aadhaar: 'Aadhaar',
  aadhar: 'Aadhaar',
  api: 'API',
  crm: 'CRM',
  di: 'DI',
  email: 'Email',
  gst: 'GST',
  gstin: 'GSTIN',
  id: 'ID',
  kyc: 'KYC',
  oem: 'OEM',
  pan: 'PAN',
  pc: 'PC',
  pdf: 'PDF',
  pm: 'PM',
  rc: 'RC',
  tl: 'TL',
  vin: 'VIN',
};

export function displayName(value?: string | null, fallback = 'Not Available'): string {
  const source = value?.trim();
  if (!source) return fallback;

  return source
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLowerCase();
      return TOKEN_LABELS[lower] ?? `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
    })
    .join(' ');
}

export function valueToCode(value: string): string {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}
