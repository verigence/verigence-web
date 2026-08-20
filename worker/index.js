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
          { status: 503 },
        );
      }

      try {
        const target = buildSecurityTarget(env.SECURITY_UPSTREAM, request.url);
        const headers = new Headers(request.headers);

        // This is a server-side hop. Do not forward browser-origin routing headers.
        headers.delete('host');
        headers.delete('origin');
        headers.delete('referer');

        const init = {
          method: request.method,
          headers,
          redirect: 'manual',
        };

        if (request.method !== 'GET' && request.method !== 'HEAD') {
          init.body = request.body;
        }

        return await fetch(new Request(target, init));
      } catch (error) {
        console.error('Security upstream request failed', error);
        return Response.json(
          {
            code: 'SECURITY_UPSTREAM_UNAVAILABLE',
            title: 'Verigence Security could not be reached',
            status: 502,
          },
          { status: 502 },
        );
      }
    }

    return env.ASSETS.fetch(request);
  },
};
