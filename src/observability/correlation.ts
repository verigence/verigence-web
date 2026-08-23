const CORRELATION_HEADER = 'X-Correlation-ID';
const CORRELATION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export function newCorrelationId(): string {
  return crypto.randomUUID();
}

export function ensureCorrelationHeader(headers: Headers, correlationId?: string): string {
  const existing = headers.get(CORRELATION_HEADER)?.trim();
  if (existing && CORRELATION_PATTERN.test(existing)) return existing;

  const selected = correlationId?.trim();
  const resolved = selected && CORRELATION_PATTERN.test(selected)
    ? selected
    : newCorrelationId();
  headers.set(CORRELATION_HEADER, resolved);
  return resolved;
}

export function responseCorrelationId(response: Response, fallback?: string): string | undefined {
  const echoed = response.headers.get(CORRELATION_HEADER)?.trim();
  if (echoed && CORRELATION_PATTERN.test(echoed)) return echoed;
  return fallback && CORRELATION_PATTERN.test(fallback) ? fallback : undefined;
}

export function supportReference(value: string | null | undefined): string | undefined {
  const selected = value?.trim();
  return selected && CORRELATION_PATTERN.test(selected) ? selected : undefined;
}
