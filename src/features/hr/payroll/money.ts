/**
 * Money is shown, never calculated, on these screens. The server sends amounts as strings (or, for a
 * few fields, JSON numbers) and every figure is worked out there. These helpers only format and
 * compare, using whole-number (BigInt) arithmetic on the digits so no floating point is involved.
 */

export interface DecimalParts {
  negative: boolean;
  whole: string;
  fraction: string;
}

const PLAIN = /^([+-])?(\d+)(?:\.(\d+))?$/;

/** Reads "1234", "1234.5", "-12.30" or a JSON number. Returns null for anything else. */
export function parseDecimal(value: unknown): DecimalParts | null {
  if (value === null || value === undefined) return null;
  const text = typeof value === 'number' ? (Number.isFinite(value) ? numberText(value) : '') : String(value).trim();
  const match = PLAIN.exec(text);
  if (!match) return null;
  return { negative: match[1] === '-', whole: match[2].replace(/^0+(?=\d)/, ''), fraction: match[3] ?? '' };
}

function numberText(value: number): string {
  const text = String(value);
  if (!/e/i.test(text)) return text;
  return value.toFixed(2); // very large or very small numbers only; never used for arithmetic
}

/** Whole paise (hundredths) as a BigInt, rounded half-up on the third decimal place. */
export function toPaise(value: unknown): bigint | null {
  const parts = parseDecimal(value);
  if (!parts) return null;
  const fraction = (parts.fraction + '000').slice(0, 3);
  let paise = BigInt(parts.whole + fraction.slice(0, 2));
  if (fraction[2] >= '5') paise += 1n;
  return parts.negative ? -paise : paise;
}

function groupIndian(whole: string): string {
  if (whole.length <= 3) return whole;
  const last3 = whole.slice(-3);
  const rest = whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${rest},${last3}`;
}

/** 1234567.5 -> "12,34,567.50" (no currency sign). */
export function formatIndian(value: unknown): string {
  const paise = toPaise(value);
  if (paise === null) return '—';
  const negative = paise < 0n;
  const abs = (negative ? -paise : paise).toString().padStart(3, '0');
  const whole = abs.slice(0, -2);
  const fraction = abs.slice(-2);
  return `${negative ? '-' : ''}${groupIndian(whole)}.${fraction}`;
}

/** 1234567.5 -> "₹12,34,567.50". Anything that is not an amount shows as an em dash. */
export function formatRupees(value: unknown): string {
  const text = formatIndian(value);
  if (text === '—') return text;
  return text.startsWith('-') ? `-₹${text.slice(1)}` : `₹${text}`;
}

/** An amount with its sign always shown, for adjustments: +₹1,000.00 / -₹250.00. */
export function formatSignedRupees(value: unknown): string {
  const paise = toPaise(value);
  if (paise === null) return '—';
  return paise > 0n ? `+${formatRupees(value)}` : formatRupees(value);
}

/** Days and other plain numbers: "28", "27.5". Never rounds. */
export function formatDays(value: unknown): string {
  const parts = parseDecimal(value);
  if (!parts) return '—';
  const fraction = parts.fraction.replace(/0+$/, '');
  return `${parts.negative ? '-' : ''}${parts.whole}${fraction ? `.${fraction}` : ''}`;
}

/** -1, 0 or 1; null when either side is not a number. Compares exactly, whatever the decimals. */
export function compareDecimal(a: unknown, b: unknown): -1 | 0 | 1 | null {
  const x = parseDecimal(a);
  const y = parseDecimal(b);
  if (!x || !y) return null;
  const scale = Math.max(x.fraction.length, y.fraction.length);
  const big = (p: DecimalParts) => {
    const n = BigInt(p.whole + p.fraction.padEnd(scale, '0'));
    return p.negative ? -n : n;
  };
  const left = big(x);
  const right = big(y);
  return left < right ? -1 : left > right ? 1 : 0;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** "2026-10" -> "October 2026". */
export function formatPayMonth(value: string): string {
  const match = /^(\d{4})-(\d{2})/.exec(value);
  if (!match) return value;
  const name = MONTH_NAMES[Number(match[2]) - 1];
  return name ? `${name} ${match[1]}` : value;
}

/** Today's date in India as YYYY-MM-DD (the server judges "not in the future" by this date). */
export function todayInIndia(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
