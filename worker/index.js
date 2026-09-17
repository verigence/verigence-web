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

function buildAnalyticsTarget(rawUpstream, incomingUrl) {
  const upstream = new URL(String(rawUpstream || '').trim());
  const incoming = new URL(incomingUrl);
  const proxyPrefix = '/analytics-api';
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
    'Access-Control-Allow-Headers': `Authorization,Content-Type,X-Onboarding-Key,Idempotency-Key,If-Match,${CORRELATION_HEADER}`,
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

  // Security's trusted ingress contract reads X-Real-IP. Cloudflare gives the Worker the actual
  // client address as CF-Connecting-IP, so map it server-side instead of trusting a browser value.
  const connectingIp = request.headers.get('CF-Connecting-IP')?.trim();
  if (connectingIp) headers.set('X-Real-IP', connectingIp);

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

  if (String(env.ANALYTICS_UPSTREAM || '').trim()) {
    requests.push(fetch(buildWarmupTarget(env.ANALYTICS_UPSTREAM, '/health'), {
      method: 'GET',
      headers,
      cache: 'no-store',
    }));
  }

  await Promise.allSettled(requests);
}

function appDistributionJson(payload, status, correlationId) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      [CORRELATION_HEADER]: correlationId,
    },
  });
}

async function appDistributionAuthorization(request, env, correlationId) {
  const authorization = request.headers.get('Authorization')?.trim();
  if (!authorization?.startsWith('Bearer ')) {
    return { ok: false, status: 401 };
  }
  if (!String(env.SECURITY_UPSTREAM || '').trim()) {
    return { ok: false, status: 503 };
  }

  try {
    // Security already owns USER authentication and account-state validation. Reuse its
    // existing refresh boundary strictly as a token-validity check instead of duplicating
    // JWT verification logic or introducing a role/project requirement in this Worker.
    const origin = new URL(request.url).origin;
    const target = buildSecurityTarget(env.SECURITY_UPSTREAM, `${origin}/security/v1/auth/refresh`);
    const headers = new Headers({
      Authorization: authorization,
      [CORRELATION_HEADER]: correlationId,
    });
    const connectingIp = request.headers.get('CF-Connecting-IP')?.trim();
    if (connectingIp) headers.set('X-Real-IP', connectingIp);

    const response = await fetch(target, {
      method: 'POST',
      headers,
      cache: 'no-store',
    });
    if (response.ok) return { ok: true, status: 200 };
    if (response.status === 401 || response.status === 403) return { ok: false, status: 401 };
    return { ok: false, status: 503 };
  } catch (error) {
    logProxyFailure('app-distribution-auth', request, correlationId, 'APP_DISTRIBUTION_AUTH_UNAVAILABLE', error);
    return { ok: false, status: 503 };
  }
}

function appDistributionMetadata(env) {
  const apkUrl = String(env.ANDROID_APK_URL || '').trim();
  return {
    available: Boolean(apkUrl),
    appName: 'Verigence',
    platform: 'Android',
    version: String(env.ANDROID_APP_VERSION || '').trim() || null,
    build: String(env.ANDROID_APP_BUILD || '').trim() || null,
    size: String(env.ANDROID_APP_SIZE || '').trim() || null,
    sha256: String(env.ANDROID_APP_SHA256 || '').trim() || null,
    minAndroid: String(env.ANDROID_MIN_ANDROID || '').trim() || null,
    releasedAt: String(env.ANDROID_APP_RELEASED_AT || '').trim() || null,
    packageName: 'com.verigence.app',
  };
}

async function handleAppDistribution(request, env, correlationId) {
  if (request.method !== 'GET') {
    return appDistributionJson({ code: 'METHOD_NOT_ALLOWED', status: 405 }, 405, correlationId);
  }

  const auth = await appDistributionAuthorization(request, env, correlationId);
  if (!auth.ok) {
    const code = auth.status === 401 ? 'AUTH_REQUIRED' : 'APP_DISTRIBUTION_AUTH_UNAVAILABLE';
    const title = auth.status === 401
      ? 'A valid Verigence sign-in is required.'
      : 'Verigence authentication is temporarily unavailable.';
    return appDistributionJson({ code, title, status: auth.status, correlationId }, auth.status, correlationId);
  }

  const url = new URL(request.url);
  if (url.pathname === '/app-distribution/metadata') {
    return appDistributionJson(appDistributionMetadata(env), 200, correlationId);
  }

  if (url.pathname !== '/app-distribution/latest') {
    return appDistributionJson({ code: 'NOT_FOUND', status: 404 }, 404, correlationId);
  }

  const apkUrl = String(env.ANDROID_APK_URL || '').trim();
  if (!apkUrl) {
    return appDistributionJson({
      code: 'ANDROID_RELEASE_NOT_PUBLISHED',
      title: 'No Android release has been published to the Verigence App Portal yet.',
      status: 503,
      correlationId,
    }, 503, correlationId);
  }

  try {
    const upstream = await fetch(apkUrl, {
      method: 'GET',
      cache: 'no-store',
      redirect: 'follow',
    });
    if (!upstream.ok || !upstream.body) {
      return appDistributionJson({
        code: 'ANDROID_RELEASE_UNAVAILABLE',
        title: 'The current Android release could not be retrieved.',
        status: 502,
        correlationId,
      }, 502, correlationId);
    }

    const metadata = appDistributionMetadata(env);
    const safeVersion = metadata.version ? `-${metadata.version.replace(/[^A-Za-z0-9._-]/g, '-')}` : '';
    const filename = `Verigence${safeVersion}.apk`;
    const headers = new Headers({
      'Content-Type': 'application/vnd.android.package-archive',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Verigence-Filename': filename,
      [CORRELATION_HEADER]: correlationId,
    });
    const contentLength = upstream.headers.get('Content-Length');
    if (contentLength) headers.set('Content-Length', contentLength);
    if (metadata.sha256) headers.set('X-Verigence-SHA256', metadata.sha256);

    return new Response(upstream.body, { status: 200, headers });
  } catch (error) {
    logProxyFailure('app-distribution', request, correlationId, 'ANDROID_RELEASE_UNAVAILABLE', error);
    return appDistributionJson({
      code: 'ANDROID_RELEASE_UNAVAILABLE',
      title: 'The current Android release could not be retrieved.',
      status: 502,
      correlationId,
    }, 502, correlationId);
  }
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

    if (url.pathname === '/app-distribution' || url.pathname.startsWith('/app-distribution/')) {
      return handleAppDistribution(request, env, correlationId);
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
        const proxyStart = performance.now();
        const response = await fetch(sanitizedUpstreamRequest(target, request, correlationId));
        if (String(env.LOG_PROXY_SUCCESS || '').toLowerCase() === 'true') {
          console.log(JSON.stringify({
            event_name: 'web_proxy_success',
            service_name: 'verigence-web',
            proxy: 'security',
            correlation_id: correlationId,
            http_method: request.method,
            http_route: new URL(request.url).pathname,
            upstream_status: response.status,
            duration_ms: Math.round(performance.now() - proxyStart),
          }));
        }
        return proxyResponse(response, request, 'security', correlationId);
      } catch (error) {
        logProxyFailure('security', request, correlationId, 'SECURITY_UPSTREAM_UNAVAILABLE', error);
        return proxyError(request, 'security', 'SECURITY_UPSTREAM_UNAVAILABLE', 'Verigence Security could not be reached', 502, correlationId);
      }
    }

    if (url.pathname === '/audit-core' || url.pathname.startsWith('/audit-core/')) {
      if (request.method === 'OPTIONS') {
        return preflightResponse(request);
      }

      if (!String(env.AUDIT_CORE_UPSTREAM || '').trim()) {
        logProxyFailure('audit-core', request, correlationId, 'AUDIT_CORE_UPSTREAM_UNAVAILABLE');
        return proxyError(request, 'audit-core', 'AUDIT_CORE_UPSTREAM_UNAVAILABLE', 'Verigence Audit Core is not configured', 503, correlationId);
      }

      try {
        const target = buildAuditCoreTarget(env.AUDIT_CORE_UPSTREAM, request.url);
        const proxyStart = performance.now();
        const response = await fetch(sanitizedUpstreamRequest(target, request, correlationId));
        if (String(env.LOG_PROXY_SUCCESS || '').toLowerCase() === 'true') {
          console.log(JSON.stringify({
            event_name: 'web_proxy_success',
            service_name: 'verigence-web',
            proxy: 'audit-core',
            correlation_id: correlationId,
            http_method: request.method,
            http_route: new URL(request.url).pathname,
            upstream_status: response.status,
            duration_ms: Math.round(performance.now() - proxyStart),
          }));
        }
        return proxyResponse(response, request, 'audit-core', correlationId);
      } catch (error) {
        logProxyFailure('audit-core', request, correlationId, 'AUDIT_CORE_UPSTREAM_UNAVAILABLE', error);
        return proxyError(request, 'audit-core', 'AUDIT_CORE_UPSTREAM_UNAVAILABLE', 'Verigence Audit Core could not be reached', 502, correlationId);
      }
    }

    if (url.pathname === '/analytics-api' || url.pathname.startsWith('/analytics-api/')) {
      if (request.method === 'OPTIONS') {
        return preflightResponse(request);
      }

      if (!String(env.ANALYTICS_UPSTREAM || '').trim()) {
        logProxyFailure('analytics', request, correlationId, 'ANALYTICS_UPSTREAM_UNAVAILABLE');
        return proxyError(request, 'analytics', 'ANALYTICS_UPSTREAM_UNAVAILABLE', 'Verigence Analytics is not configured', 503, correlationId);
      }

      try {
        const target = buildAnalyticsTarget(env.ANALYTICS_UPSTREAM, request.url);
        const proxyStart = performance.now();
        const response = await fetch(sanitizedUpstreamRequest(target, request, correlationId));
        if (String(env.LOG_PROXY_SUCCESS || '').toLowerCase() === 'true') {
          console.log(JSON.stringify({
            event_name: 'web_proxy_success',
            service_name: 'verigence-web',
            proxy: 'analytics',
            correlation_id: correlationId,
            http_method: request.method,
            http_route: new URL(request.url).pathname,
            upstream_status: response.status,
            duration_ms: Math.round(performance.now() - proxyStart),
          }));
        }
        return proxyResponse(response, request, 'analytics', correlationId);
      } catch (error) {
        logProxyFailure('analytics', request, correlationId, 'ANALYTICS_UPSTREAM_UNAVAILABLE', error);
        return proxyError(request, 'analytics', 'ANALYTICS_UPSTREAM_UNAVAILABLE', 'Verigence Analytics could not be reached', 502, correlationId);
      }
    }

    if (url.pathname === '/di' || url.pathname.startsWith('/di/')) {
      if (!String(env.DI_UPSTREAM || '').trim()) {
        logProxyFailure('di', request, correlationId, 'DI_UPSTREAM_UNAVAILABLE');
        return proxyError(request, 'di', 'DI_UPSTREAM_UNAVAILABLE', 'Verigence Document Intelligence is not configured', 503, correlationId);
      }

      try {
        const target = buildDiTarget(env.DI_UPSTREAM, request.url);
        const proxyStart = performance.now();
        const response = await fetch(sanitizedUpstreamRequest(target, request, correlationId));
        if (String(env.LOG_PROXY_SUCCESS || '').toLowerCase() === 'true') {
          console.log(JSON.stringify({
            event_name: 'web_proxy_success',
            service_name: 'verigence-web',
            proxy: 'di',
            correlation_id: correlationId,
            http_method: request.method,
            http_route: new URL(request.url).pathname,
            upstream_status: response.status,
            duration_ms: Math.round(performance.now() - proxyStart),
          }));
        }
        return proxyResponse(response, request, 'di', correlationId);
      } catch (error) {
        logProxyFailure('di', request, correlationId, 'DI_UPSTREAM_UNAVAILABLE', error);
        return proxyError(request, 'di', 'DI_UPSTREAM_UNAVAILABLE', 'Verigence Document Intelligence could not be reached', 502, correlationId);
      }
    }

    return env.ASSETS.fetch(request);
  },
};
