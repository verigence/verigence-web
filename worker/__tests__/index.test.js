// worker/__tests__/index.test.js
import { describe, it, expect, vi } from 'vitest';
import worker from '../index.js';

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

describe('Audit Core Capacitor CORS', () => {
  it('answers native workspace preflight at the Worker without calling upstream', async () => {
    const request = new Request(
      'https://verigence-web-dev.example/audit-core/v1/me/projects',
      {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://localhost',
          'Access-Control-Request-Method': 'GET',
          'Access-Control-Request-Headers': 'authorization,x-correlation-id',
          'X-Correlation-ID': 'native-preflight-test',
        },
      },
    );

    const response = await worker.fetch(request, {});

    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://localhost');
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET');
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain('X-Correlation-ID');
  });

  it('allows the command headers used by native Booking create and start/update requests', async () => {
    const request = new Request(
      'https://verigence-web-dev.example/audit-core/v1/tenants/t1/uc03/bookings',
      {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://localhost',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'authorization,content-type,idempotency-key,if-match,x-correlation-id',
          'X-Correlation-ID': 'native-booking-command-preflight',
        },
      },
    );

    const response = await worker.fetch(request, {});
    const allowed = response.headers.get('Access-Control-Allow-Headers') || '';

    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://localhost');
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    expect(allowed).toContain('Idempotency-Key');
    expect(allowed).toContain('If-Match');
    expect(allowed).toContain('Authorization');
    expect(allowed).toContain('Content-Type');
    expect(allowed).toContain('X-Correlation-ID');
  });

  it('rejects an unapproved origin', async () => {
    const request = new Request(
      'https://verigence-web-dev.example/audit-core/v1/me/projects',
      {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://evil.example',
          'Access-Control-Request-Method': 'GET',
          'Access-Control-Request-Headers': 'authorization',
          'X-Correlation-ID': 'native-preflight-reject-test',
        },
      },
    );

    const response = await worker.fetch(request, {});
    expect(response.status).toBe(403);
  });
});

describe('authenticated app distribution', () => {
  it('rejects unauthenticated release metadata requests', async () => {
    const upstream = vi.spyOn(globalThis, 'fetch');
    const response = await worker.fetch(
      new Request('https://verigence-web-dev.example/app-distribution/metadata'),
      { SECURITY_UPSTREAM: 'https://security.example' },
    );

    expect(response.status).toBe(401);
    expect(upstream).not.toHaveBeenCalled();
    upstream.mockRestore();
  });

  it('allows any valid authenticated user to read release metadata without role or project context', async () => {
    const upstream = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ accessToken: 'refreshed' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const response = await worker.fetch(
      new Request('https://verigence-web-dev.example/app-distribution/metadata', {
        headers: { Authorization: 'Bearer valid-user-token' },
      }),
      {
        SECURITY_UPSTREAM: 'https://security.example',
        ANDROID_APK_URL: 'https://downloads.example/Verigence.apk',
        ANDROID_APP_VERSION: '1.2.3',
        ANDROID_APP_BUILD: '456',
        ANDROID_APP_SHA256: 'abc123',
      },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      available: true,
      appName: 'Verigence',
      platform: 'Android',
      version: '1.2.3',
      build: '456',
      sha256: 'abc123',
      packageName: 'com.verigence.app',
    });
    expect(upstream).toHaveBeenCalledTimes(1);
    upstream.mockRestore();
  });

  it('streams the configured APK only after Security validates the bearer token', async () => {
    const apkBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    const upstream = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(new Response(apkBytes, {
        status: 200,
        headers: { 'Content-Length': String(apkBytes.byteLength) },
      }));

    const response = await worker.fetch(
      new Request('https://verigence-web-dev.example/app-distribution/latest', {
        headers: { Authorization: 'Bearer valid-user-token' },
      }),
      {
        SECURITY_UPSTREAM: 'https://security.example',
        ANDROID_APK_URL: 'https://downloads.example/Verigence.apk',
        ANDROID_APP_VERSION: '1.2.3',
        ANDROID_APP_SHA256: 'abc123',
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/vnd.android.package-archive');
    expect(response.headers.get('Content-Disposition')).toContain('Verigence-1.2.3.apk');
    expect(response.headers.get('X-Verigence-SHA256')).toBe('abc123');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(apkBytes);
    expect(upstream).toHaveBeenCalledTimes(2);
    upstream.mockRestore();
  });

  it('reports not-published when a valid user has no configured APK object', async () => {
    const upstream = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const response = await worker.fetch(
      new Request('https://verigence-web-dev.example/app-distribution/latest', {
        headers: { Authorization: 'Bearer valid-user-token' },
      }),
      { SECURITY_UPSTREAM: 'https://security.example' },
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: 'ANDROID_RELEASE_NOT_PUBLISHED' });
    upstream.mockRestore();
  });
});

describe('CORRELATION_PATTERN', () => {
  it('accepts UUID-style IDs and compact IDs', () => {
    expect(CORRELATION_PATTERN.test('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(CORRELATION_PATTERN.test('550e8400e29b41d4a716446655440000')).toBe(true);
  });

  it('rejects empty string', () => {
    expect(CORRELATION_PATTERN.test('')).toBe(false);
  });
});
