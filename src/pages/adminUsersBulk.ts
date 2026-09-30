import type { GlobalUserDirectoryItem } from '../services/security/onboardingAdmin';

export const DELETABLE_STATUSES = ['ACTIVE', 'REJECTED', 'DISABLED'];

const RESERVED_DOMAINS = ['example.com', 'example.org', 'example.net'];
const RESERVED_SUFFIXES = ['.invalid', '.test', '.example', '.localhost'];

/** A user with no email, or one on a reserved test domain (RFC 2606), e.g. x@example.invalid. */
export function isTestAccount(user: Pick<GlobalUserDirectoryItem, 'primaryEmail'>): boolean {
  const email = user.primaryEmail?.trim().toLowerCase();
  if (!email) return true;
  const at = email.lastIndexOf('@');
  if (at < 1 || at === email.length - 1) return true;
  const domain = email.slice(at + 1);
  return RESERVED_DOMAINS.includes(domain) || RESERVED_SUFFIXES.some((suffix) => domain.endsWith(suffix));
}

/** Can be bulk-deleted: a deletable status and never the signed-in administrator. */
export function canBulkDelete(user: GlobalUserDirectoryItem, signedInEmail: string): boolean {
  if (!DELETABLE_STATUSES.includes(user.status.toUpperCase())) return false;
  const self = signedInEmail.trim().toLowerCase();
  return !self || (user.primaryEmail ?? '').trim().toLowerCase() !== self;
}
