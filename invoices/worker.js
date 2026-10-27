// Serves the invoice generator. There is no password: invoices are saved only in the browser
// that made them, so anyone else who opens the link sees an empty app, not your invoices.

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    // Cloud sync is off: without a login, a shared store would be readable by anyone.
    if (url.pathname.startsWith("/api/")) {
      return new Response(JSON.stringify({ error: "invoices are stored in this browser" }), { status: 501, headers: { "content-type": "application/json" } });
    }
    const res = await env.ASSETS.fetch(req);
    const out = new Response(res.body, res);
    out.headers.set("cache-control", "no-store");
    out.headers.set("x-robots-tag", "noindex, nofollow");
    return out;
  },
};
