const CAPACITOR_ORIGINS = new Set([
  'capacitor://localhost',
  'https://localhost',
]);
const CORRELATION_HEADER = 'X-Correlation-ID';
const CORRELATION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function correlationIdFor(request) {
  const supplied = request.headers.get(CORRELATION_HEADER)?.trim();
  return supplied && CORRELATION_PATTERN.test(supplied) ? supplied : crypto.randomUUID();
}

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

function buildDiTarget(rawUpstream, incomingUrl) {
  const upstream = new URL(String(rawUpstream || '').trim());
  const incoming = new URL(incomingUrl);
  const proxyPrefix = '/di';
  const upstreamPath = upstream.pathname.replace(/\/+$/, '');
  const incomingPath = incoming.pathname.startsWith(proxyPrefix)
    ? incoming.pathname.slice(proxyPrefix.length) || '/'
    : incoming.pathname;

  upstream.pathname = `${upstreamPath}${incomingPath}`.replace(/\/{2,}/g, '/');
  upstream.search = incoming.search;
  upstream.hash = '';
  return upstream;
}

function buildWarmupTarget(rawUpstream, path) {
  const upstream = new URL(String(rawUpstream || '').trim());
  upstream.pathname = path;
  upstream.search = '';
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
  headers.set('Access-Control-Expose-Headers', CORRELATION_HEADER);
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
    'Access-Control-Allow-Headers': `Authorization,Content-Type,X-Onboarding-Key,${CORRELATION_HEADER}`,
    'Access-Control-Expose-Headers': CORRELATION_HEADER,
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  });
  return new Response(null, { status: 204, headers });
}

function proxyResponse(response, request, proxyName, correlationId) {
  const headers = applyCapacitorCors(new Headers(response.headers), request);
  const upstreamCorrelationId = headers.get(CORRELATION_HEADER)?.trim();
  headers.set(
    CORRELATION_HEADER,
    upstreamCorrelationId && CORRELATION_PATTERN.test(upstreamCorrelationId)
      ? upstreamCorrelationId
      : correlationId,
  );
  headers.set('X-Verigence-Proxy', proxyName);
  headers.set('X-Verigence-Upstream-Status', String(response.status));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function proxyError(request, proxyName, code, title, status, correlationId) {
  const headers = applyCapacitorCors(new Headers({
    'Content-Type': 'application/json',
    'X-Verigence-Proxy': proxyName,
    [CORRELATION_HEADER]: correlationId,
  }), request);
  return new Response(
    JSON.stringify({ code, title, status, correlationId }),
    { status, headers },
  );
}

function sanitizedUpstreamRequest(target, request, correlationId) {
  const upstreamRequest = new Request(target, request);
  const headers = new Headers(upstreamRequest.headers);

  // This is a server-side hop. Do not forward browser-origin routing headers.
  headers.delete('host');
  headers.delete('origin');
  headers.delete('referer');
  headers.set(CORRELATION_HEADER, correlationId);

  return new Request(upstreamRequest, { headers });
}

function logProxyFailure(proxyName, request, correlationId, errorCode, error) {
  console.error(JSON.stringify({
    event_name: 'web_proxy_upstream_failed',
    service_name: 'verigence-web',
    proxy: proxyName,
    correlation_id: correlationId,
    http_method: request.method,
    http_route: new URL(request.url).pathname,
    error_code: errorCode,
    exception_type: error instanceof Error ? error.name : undefined,
  }));
}

async function warmRuntime(env, correlationId) {
  const requests = [];
  const headers = { [CORRELATION_HEADER]: correlationId };

  if (String(env.SECURITY_UPSTREAM || '').trim()) {
    requests.push(fetch(buildWarmupTarget(env.SECURITY_UPSTREAM, '/health/ready'), {
      method: 'GET',
      headers,
      cache: 'no-store',
    }));
  }

  if (String(env.AUDIT_CORE_UPSTREAM || '').trim()) {
    requests.push(fetch(buildWarmupTarget(env.AUDIT_CORE_UPSTREAM, '/health'), {
      method: 'GET',
      headers,
      cache: 'no-store',
    }));
  }

  await Promise.allSettled(requests);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const correlationId = correlationIdFor(request);

    if (url.pathname === '/runtime-warmup' && request.method === 'GET') {
      await warmRuntime(env, correlationId);
      return new Response(null, {
        status: 204,
        headers: {
          'Cache-Control': 'no-store',
          [CORRELATION_HEADER]: correlationId,
        },
      });
    }

    if (url.pathname.startsWith('/security/')) {
      if (request.method === 'OPTIONS') {
        return preflightResponse(request);
      }

      if (!String(env.SECURITY_UPSTREAM || '').trim()) {
        logProxyFailure('security', request, correlationId, 'SECURITY_UPSTREAM_UNAVAILABLE');
        return proxyError(request, 'security', 'SECURITY_UPSTREAM_UNAVAILABLE', 'Verigence Security is not configured', 503, correlationId);
      }

      try {
        const target = buildSecurityTarget(env.SECURITY_UPSTREAM, request.url);
        const response = await fetch(sanitizedUpstreamRequest(target, request, correlationId));
        return proxyResponse(response, request, 'security', correlationId);
      } catch (error) {
        logProxyFailure('security', request, correlationId, 'SECURITY_UPSTREAM_UNAVAILABLE', error);
        return proxyError(request, 'security', 'SECURITY_UPSTREAM_UNAVAILABLE', 'Verigence Security could not be reached', 502, correlationId);
      }
    }

    if (url.pathname === '/audit-core' || url.pathname.startsWith('/audit-core/')) {
      if (!String(env.AUDIT_CORE_UPSTREAM || '').trim()) {
        logProxyFailure('audit-core', request, correlationId, 'AUDIT_CORE_UPSTREAM_UNAVAILABLE');
        return proxyError(request, 'audit-core', 'AUDIT_CORE_UPSTREAM_UNAVAILABLE', 'Verigence Audit Core is not configured', 503, correlationId);
      }

      try {
        const target = buildAuditCoreTarget(env.AUDIT_CORE_UPSTREAM, request.url);
        const response = await fetch(sanitizedUpstreamRequest(target, request, correlationId));
        return proxyResponse(response, request, 'audit-core', correlationId);
      } catch (error) {
        logProxyFailure('audit-core', request, correlationId, 'AUDIT_CORE_UPSTREAM_UNAVAILABLE', error);
        return proxyError(request, 'audit-core', 'AUDIT_CORE_UPSTREAM_UNAVAILABLE', 'Verigence Audit Core could not be reached', 502, correlationId);
      }
    }

    if (url.pathname === '/di' || url.pathname.startsWith('/di/')) {
      if (!String(env.DI_UPSTREAM || '').trim()) {
        logProxyFailure('di', request, correlationId, 'DI_UPSTREAM_UNAVAILABLE');
        return proxyError(request, 'di', 'DI_UPSTREAM_UNAVAILABLE', 'Verigence Document Intelligence is not configured', 503, correlationId);
      }

      try {
        const target = buildDiTarget(env.DI_UPSTREAM, request.url);
        const response = await fetch(sanitizedUpstreamRequest(target, request, correlationId));
        return proxyResponse(response, request, 'di', correlationId);
      } catch (error) {
        logProxyFailure('di', request, correlationId, 'DI_UPSTREAM_UNAVAILABLE', error);
        return proxyError(request, 'di', 'DI_UPSTREAM_UNAVAILABLE', 'Verigence Document Intelligence could not be reached', 502, correlationId);
      }
    }

    return env.ASSETS.fetch(request);
  },
};
