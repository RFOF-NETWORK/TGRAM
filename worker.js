const API_ORIGIN = "https://tgram-tau.vercel.app";
const VERIFIER_ORIGIN = "https://verifier.ton.org";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      const target = new URL(url.pathname + url.search, API_ORIGIN);
      return fetch(new Request(target, request));
    }

    if (url.pathname === "/verifier" || url.pathname.startsWith("/verifier/")) {
      const rest = url.pathname.slice("/verifier".length).replace(/^\//, "");
      return Response.redirect(`${VERIFIER_ORIGIN}/${rest}${url.search}`, 302);
    }

    if (url.pathname === "/health") {
      return Response.json({ ok: true, service: "tgram", api: API_ORIGIN });
    }

    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    return new Response(response.body, { status: response.status, headers });
  },
};
