export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/security/')) {
      const upstreamBase = String(env.SECURITY_UPSTREAM || '').replace(/\/$/, '');
      if (!upstreamBase) {
        return Response.json(
          { message: 'Security upstream is not configured.' },
          { status: 503 },
        );
      }

      const target = new URL(`${upstreamBase}${url.pathname}${url.search}`);
      const upstreamRequest = new Request(target, request);
      return fetch(upstreamRequest);
    }

    return env.ASSETS.fetch(request);
  },
};
