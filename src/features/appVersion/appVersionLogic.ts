/** Version arithmetic for the "Update required" check. The server makes the same decision at sign-in. */

const VERSION = /^(\d+)\.(\d+)\.(\d+)$/;

export function parseVersion(value: string | null | undefined): [number, number, number] | null {
  const match = VERSION.exec((value ?? '').trim());
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

/** True when `version` is below `minimum`. An unreadable version is below any minimum. */
export function isBelow(version: string | null | undefined, minimum: string | null | undefined): boolean {
  const min = parseVersion(minimum);
  if (!min) return false;
  const found = parseVersion(version);
  if (!found) return true;
  for (let i = 0; i < 3; i += 1) {
    if (found[i] !== min[i]) return found[i] < min[i];
  }
  return false;
}

export const isVersion = (value: string) => parseVersion(value) !== null;
