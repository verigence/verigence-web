import type { GlobalUserCreateInput, GlobalUserDirectoryItem } from '../services/security/onboardingAdmin';

export type BulkCreateStatus = 'NEW' | 'DUPLICATE' | 'EXISTS' | 'PENDING' | 'ERROR';

export type BulkCreateRow = {
  line: number;
  name: string;
  email: string;
  mobile: string;
  input: GlobalUserCreateInput | null;
  status: BulkCreateStatus;
  message: string;
};

const HEADER_WORDS = ['name', 'email', 'mobile', 'phone', 'password'];

/** The same rule as Security: 10 digits starting 6-9, optionally prefixed 91 or 0. */
export function normalizeIndianMobile(value: string): string | null {
  let digits = value.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : null;
}

function splitCells(line: string): string[] {
  const cells = line.includes('\t') ? line.split('\t') : line.split(',');
  return cells.map((cell) => cell.trim().replace(/^"(.*)"$/, '$1').trim());
}

function looksLikeHeader(cells: string[]): boolean {
  const lower = cells.map((cell) => cell.toLowerCase());
  return lower.filter((cell) => HEADER_WORDS.some((word) => cell.includes(word))).length >= 2;
}

/**
 * Rows pasted from Excel (tab-separated) or CSV: Name, Mobile, Email, Password.
 * Repeated rows for the same person are skipped; existing users are reported, not recreated.
 */
export function planBulkCreate(text: string, existing: GlobalUserDirectoryItem[]): BulkCreateRow[] {
  const byEmail = new Map(existing.filter((u) => u.primaryEmail).map((u) => [u.primaryEmail!.trim().toLowerCase(), u]));
  const byMobile = new Map(
    existing.filter((u) => u.primaryMobile).map((u) => [normalizeIndianMobile(u.primaryMobile!) ?? u.primaryMobile!, u]),
  );
  const seenEmail = new Map<string, BulkCreateRow>();
  const seenMobile = new Map<string, BulkCreateRow>();
  const rows: BulkCreateRow[] = [];

  text.split(/\r?\n/).forEach((raw, index) => {
    if (!raw.trim()) return;
    const cells = splitCells(raw);
    if (index === 0 && looksLikeHeader(cells)) return;
    const [name = '', mobileRaw = '', emailRaw = '', password = ''] = cells;
    const email = emailRaw.toLowerCase();
    const mobile = normalizeIndianMobile(mobileRaw);
    const row: BulkCreateRow = { line: index + 1, name, email, mobile: mobile ?? mobileRaw, input: null, status: 'NEW', message: '' };
    rows.push(row);

    const problems: string[] = [];
    if (!name) problems.push('Name is required.');
    if (!mobile) problems.push('Mobile must be a 10-digit Indian number.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) problems.push('Email is not valid.');
    if (!password) problems.push('Password is required.');
    if (problems.length) {
      row.status = 'ERROR';
      row.message = problems.join(' ');
      return;
    }

    const earlier = seenEmail.get(email) ?? seenMobile.get(mobile!);
    if (earlier) {
      const same = earlier.email === email && earlier.mobile === mobile;
      row.status = same ? 'DUPLICATE' : 'ERROR';
      row.message = same
        ? `Same person as line ${earlier.line}; skipped.`
        : `Email or mobile is also on line ${earlier.line} with different details.`;
      return;
    }
    seenEmail.set(email, row);
    seenMobile.set(mobile!, row);

    const owner = byEmail.get(email) ?? byMobile.get(mobile!);
    if (owner) {
      const status = owner.status.toUpperCase();
      if (status === 'PENDING') {
        row.status = 'PENDING';
        row.message = 'Already registered and waiting for approval — approve from Pending Approvals.';
        return;
      }
      if (status === 'ACTIVE' || status === 'SUSPENDED') {
        row.status = 'EXISTS';
        row.message = `Already a user (${owner.displayName}, ${status}).`;
        return;
      }
    }

    const [firstName, ...rest] = name.split(/\s+/);
    row.input = { firstName, lastName: rest.join(' '), email, mobile: mobile!, password };
  });
  return rows;
}
