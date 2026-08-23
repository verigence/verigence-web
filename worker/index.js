const CAPACITOR_ORIGINS = new Set([
  'capacitor://localhost',
  'https://localhost',
]);

function buildSecurityTarget(rawUpstream, incomingUrl) {
  const upstream = new URL(String(rawUpstream || '').trim());
  const incoming = new URL(incomingUrl);

  const upstreamPath = upstream.pathname.replace(/\/+$/, '');
  const incomingPath = incoming.pathname;

  // Be tolerant of an existing SECURITY_URL secret that already includes /security
  // or /security/v1. Do not duplicate that prefix when proxying the browser request.
  const targetPath = upstreamPath && incomingPath.startsWith(`${upstreamPath}/`)
    ? incomingPath
    : `${upstreamPath}${incomingPath}`;

  upstream.pathname = targetPath.replace(/\/{2,}/g, '/');
  upstream.search = incoming.search;
  upstream.hash = '';
  return upstream;
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

function capacitorOrigin(request) {
  const origin = request.headers.get('Origin');
  return origin && CAPACITOR_ORIGINS.has(origin) ? origin : null;
}

function applyCapacitorCors(headers, request) {
  const origin = capacitorOrigin(request);
  if (!origin) return headers;

  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Allow-Credentials', 'true');
  headers.set('Vary', 'Origin');
  return headers;
}

function preflightResponse(request) {
  const origin = capacitorOrigin(request);
  if (!origin) return new Response(null, { status: 403 });

  const headers = new Headers({
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type,X-Onboarding-Key',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  });
  return new Response(null, { status: 204, headers });
}

function proxyResponse(response, request, proxyName) {
  const headers = applyCapacitorCors(new Headers(response.headers), request);
  headers.set('X-Verigence-Proxy', proxyName);
  headers.set('X-Verigence-Upstream-Status', String(response.status));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function proxyError(request, proxyName, code, title, status) {
  const headers = applyCapacitorCors(new Headers({
    'Content-Type': 'application/json',
    'X-Verigence-Proxy': proxyName,
  }), request);
  return new Response(JSON.stringify({ code, title, status }), { status, headers });
}

function sanitizedUpstreamRequest(target, request) {
  const upstreamRequest = new Request(target, request);
  const headers = new Headers(upstreamRequest.headers);

  // This is a server-side hop. Do not forward browser-origin routing headers.
  headers.delete('host');
  headers.delete('origin');
  headers.delete('referer');

  return new Request(upstreamRequest, { headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/security/')) {
      if (request.method === 'OPTIONS') {
        return preflightResponse(request);
      }

      if (!String(env.SECURITY_UPSTREAM || '').trim()) {
        return proxyError(
          request,
          'security',
          'SECURITY_UPSTREAM_UNAVAILABLE',
          'Verigence Security is not configured',
          503,
        );
      }

      try {
        const target = buildSecurityTarget(env.SECURITY_UPSTREAM, request.url);
        const response = await fetch(sanitizedUpstreamRequest(target, request));
        return proxyResponse(response, request, 'security');
      } catch (error) {
        console.error('Security upstream request failed', error);
        return proxyError(
          request,
          'security',
          'SECURITY_UPSTREAM_UNAVAILABLE',
          'Verigence Security could not be reached',
          502,
        );
      }
    }

    if (url.pathname === '/audit-core' || url.pathname.startsWith('/audit-core/')) {
      if (!String(env.AUDIT_CORE_UPSTREAM || '').trim()) {
        return proxyError(
          request,
          'audit-core',
          'AUDIT_CORE_UPSTREAM_UNAVAILABLE',
          'Verigence Audit Core is not configured',
          503,
        );
      }

      try {
        const target = buildAuditCoreTarget(env.AUDIT_CORE_UPSTREAM, request.url);
        const response = await fetch(sanitizedUpstreamRequest(target, request));
        return proxyResponse(response, request, 'audit-core');
      } catch (error) {
        console.error('Audit Core upstream request failed', error);
        return proxyError(
          request,
          'audit-core',
          'AUDIT_CORE_UPSTREAM_UNAVAILABLE',
          'Verigence Audit Core could not be reached',
          502,
        );
      }
    }

    return env.ASSETS.fetch(request);
  },
};
