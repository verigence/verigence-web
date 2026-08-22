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

function proxyResponse(response, request) {
  const headers = applyCapacitorCors(new Headers(response.headers), request);
  headers.set('X-Verigence-Proxy', 'security');
  headers.set('X-Verigence-Upstream-Status', String(response.status));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function securityError(request, body, status) {
  const headers = applyCapacitorCors(new Headers({
    'Content-Type': 'application/json',
    'X-Verigence-Proxy': 'security',
  }), request);
  return new Response(JSON.stringify(body), { status, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/security/')) {
      if (request.method === 'OPTIONS') {
        return preflightResponse(request);
      }

      if (!String(env.SECURITY_UPSTREAM || '').trim()) {
        return securityError(request, {
          code: 'SECURITY_UPSTREAM_UNAVAILABLE',
          title: 'Verigence Security is not configured',
          status: 503,
        }, 503);
      }

      try {
        const target = buildSecurityTarget(env.SECURITY_UPSTREAM, request.url);

        // Clone the incoming request so Workers preserves the request body correctly.
        const upstreamRequest = new Request(target, request);
        const headers = new Headers(upstreamRequest.headers);

        // This is a server-side hop. Do not forward browser-origin routing headers.
        headers.delete('host');
        headers.delete('origin');
        headers.delete('referer');

        const sanitizedRequest = new Request(upstreamRequest, { headers });
        const response = await fetch(sanitizedRequest);
        return proxyResponse(response, request);
      } catch (error) {
        console.error('Security upstream request failed', error);
        return securityError(request, {
          code: 'SECURITY_UPSTREAM_UNAVAILABLE',
          title: 'Verigence Security could not be reached',
          status: 502,
        }, 502);
      }
    }

    return env.ASSETS.fetch(request);
  },
};
