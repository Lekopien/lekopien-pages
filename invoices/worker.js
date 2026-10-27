// Password gate for the invoice generator. Every request, including static files,
// passes through here first (run_worker_first), so nothing loads without logging in.

const COOKIE = "inv_session";
const SESSION_DAYS = 30;
const enc = new TextEncoder();

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/[+/=]/g, (c) => ({ "+": "-", "/": "_", "=": "" })[c]);
}

/** Constant-time string comparison, so response timing doesn't leak the password. */
function safeEqual(a, b) {
  const x = enc.encode(a), y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

async function makeSession(secret) {
  const exp = Date.now() + SESSION_DAYS * 864e5;
  return `${exp}.${await hmac(secret, `session:${exp}`)}`;
}

async function validSession(req, secret) {
  const value = (req.headers.get("cookie") ?? "").split(/;\s*/).find((c) => c.startsWith(COOKIE + "="))?.slice(COOKIE.length + 1);
  if (!value) return false;
  const [exp, sig] = value.split(".");
  return Number(exp) > Date.now() && safeEqual(sig ?? "", await hmac(secret, `session:${exp}`));
}

const HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  "x-frame-options": "DENY",
  "x-robots-tag": "noindex, nofollow",
  "referrer-policy": "no-referrer",
};

function loginPage(message = "") {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Sign in · Invoices</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0d1515;color:#dce4e5;font:15px/1.5 system-ui,sans-serif}
form{background:#151d1e;border:1px solid rgba(0,240,255,.15);border-radius:4px;padding:28px;width:min(340px,90vw);display:grid;gap:12px}
h1{margin:0;font:700 16px ui-monospace,monospace;letter-spacing:.04em}h1 span{color:#00f0ff}
input{font:inherit;color:#dce4e5;background:#080f10;border:1px solid rgba(0,240,255,.2);border-radius:4px;padding:11px 12px}
button{font:800 12px ui-monospace,monospace;letter-spacing:.1em;text-transform:uppercase;background:#00f0ff;color:#0d1515;border:0;border-radius:4px;padding:12px;cursor:pointer}
p{margin:0;color:#ff8b8b;min-height:1.4em;font-size:13px}</style></head>
<body><form method="post" action="/login"><h1>lekopien<span>.</span>invoices</h1>
<input type="password" name="password" placeholder="Password" autocomplete="current-password" required autofocus>
<button>Sign in</button><p>${message}</p></form></body></html>`, { status: message ? 401 : 200, headers: HEADERS });
}

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

/** Optional cross-device storage in Workers KV: one JSON document holding all invoices and settings. */
async function api(req, env) {
  if (!env.INVOICES) return json({ error: "no KV namespace bound; using this browser's storage" }, 501);
  if (req.method === "GET") return json((await env.INVOICES.get("data", "json")) ?? { invoices: [], settings: null });
  if (req.method === "PUT") {
    const body = await req.text();
    if (body.length > 20_000_000) return json({ error: "too large" }, 413);
    JSON.parse(body); // reject anything that isn't JSON
    await env.INVOICES.put("data", body);
    return json({ ok: true, savedAt: new Date().toISOString() });
  }
  return json({ error: "method not allowed" }, 405);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const secret = env.INVOICE_PASSWORD;
    if (!secret) return loginPage("Not set up yet: add the INVOICE_PASSWORD secret in Cloudflare.");

    if (url.pathname === "/login" && req.method === "POST") {
      const form = await req.formData();
      // Small fixed delay slows down password guessing.
      await new Promise((r) => setTimeout(r, 400));
      // Trim both sides: a pasted password or secret often carries a stray space or newline.
      if (!safeEqual(String(form.get("password") ?? "").trim(), secret.trim())) return loginPage("Wrong password.");
      return new Response(null, {
        status: 303,
        headers: { location: "/", "set-cookie": `${COOKIE}=${await makeSession(secret)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_DAYS * 86400}` },
      });
    }
    if (url.pathname === "/logout") {
      return new Response(null, { status: 303, headers: { location: "/", "set-cookie": `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0` } });
    }
    if (!(await validSession(req, secret))) return url.pathname.startsWith("/api/") ? json({ error: "sign in" }, 401) : loginPage();
    if (url.pathname === "/api/data") return api(req, env);

    const res = await env.ASSETS.fetch(req);
    const out = new Response(res.body, res);
    out.headers.set("cache-control", "no-store");
    out.headers.set("x-robots-tag", "noindex, nofollow");
    return out;
  },
};
