const securityBaseUrl = (import.meta.env.VITE_SECURITY_BASE_URL?.trim() ?? '').replace(/\/$/, '');

/**
 * The signed-in person's real name from Security. Login tokens carry no name, and the email
 * prefix is not a name, so anything that records "who did this" asks here instead.
 * Returns undefined (never a guess) when the name cannot be read.
 */
export async function getMyDisplayName(accessToken: string): Promise<string | undefined> {
  try {
    const response = await fetch(`${securityBaseUrl}/security/v1/me/profile`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });
    if (!response.ok) return undefined;
    const payload = (await response.json().catch(() => undefined)) as { displayName?: unknown } | undefined;
    const name = typeof payload?.displayName === 'string' ? payload.displayName.trim() : '';
    return name || undefined;
  } catch {
    return undefined;
  }
}
