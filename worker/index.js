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

function proxyResponse(response) {
  const headers = new Headers(response.headers);
  headers.set('X-Verigence-Proxy', 'security');
  headers.set('X-Verigence-Upstream-Status', String(response.status));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/security/')) {
      if (!String(env.SECURITY_UPSTREAM || '').trim()) {
        return Response.json(
          {
            code: 'SECURITY_UPSTREAM_UNAVAILABLE',
            title: 'Verigence Security is not configured',
            status: 503,
          },
          { status: 503, headers: { 'X-Verigence-Proxy': 'security' } },
        );
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
        return proxyResponse(response);
      } catch (error) {
        console.error('Security upstream request failed', error);
        return Response.json(
          {
            code: 'SECURITY_UPSTREAM_UNAVAILABLE',
            title: 'Verigence Security could not be reached',
            status: 502,
          },
          { status: 502, headers: { 'X-Verigence-Proxy': 'security' } },
        );
      }
    }

    return env.ASSETS.fetch(request);
  },
};
