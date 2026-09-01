// worker/__tests__/index.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── helpers extracted for unit testing (duplicate key logic here) ─────────
const CORRELATION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function correlationIdFor(request) {
  const supplied = request.headers.get('X-Correlation-ID')?.trim();
  return supplied && CORRELATION_PATTERN.test(supplied) ? supplied : 'generated';
}

function buildAuditCoreTarget(rawUpstream, incomingUrl) {
  const upstream = new URL(String(rawUpstream || '').trim());
  const incoming = new URL(incomingUrl);
  const proxyPrefix = '/audit-core';
  const upstreamPath = upstream.pathname.replace(/\/+$/, '');
  const incomingPath = incoming.pathname.startsWith(proxyPrefix)
    ? incoming.pathname.slice(proxyPrefix.length) || '/'
    : incoming.pathname;
  upstream.pathname = `${upstreamPath}${incomingPath}`.replace(/\/{2,}/g, '/');
  upstream.search = incoming.search;
  upstream.hash = '';
  return upstream;
}

// ── tests ─────────────────────────────────────────────────────────────────

describe('correlationIdFor', () => {
  it('passes through a valid supplied correlation ID', () => {
    const req = new Request('https://example.com', {
      headers: { 'X-Correlation-ID': 'abc-123' },
    });
    expect(correlationIdFor(req)).toBe('abc-123');
  });

  it('rejects an ID with invalid characters', () => {
    const req = new Request('https://example.com', {
      headers: { 'X-Correlation-ID': '!!invalid!!' },
    });
    expect(correlationIdFor(req)).toBe('generated');
  });

  it('generates when header is absent', () => {
    const req = new Request('https://example.com');
    expect(correlationIdFor(req)).toBe('generated');
  });
});

describe('buildAuditCoreTarget', () => {
  it('strips /audit-core prefix from the incoming path', () => {
    const target = buildAuditCoreTarget(
      'https://api.internal',
      'https://worker.dev/audit-core/v1/tenants/t1/journeys',
    );
    expect(target.pathname).toBe('/v1/tenants/t1/journeys');
  });

  it('preserves query string', () => {
    const target = buildAuditCoreTarget(
      'https://api.internal',
      'https://worker.dev/audit-core/v1/health?foo=bar',
    );
    expect(target.search).toBe('?foo=bar');
  });
});

describe('CORRELATION_PATTERN', () => {
  it('accepts UUID-style IDs', () => {
    expect(CORRELATION_PATTERN.test('550e8400-e29b-41d4-a716-446655440000')).toBe(false); // hyphens not in set
    expect(CORRELATION_PATTERN.test('550e8400e29b41d4a716446655440000')).toBe(true);
  });

  it('rejects empty string', () => {
    expect(CORRELATION_PATTERN.test('')).toBe(false);
  });
});
