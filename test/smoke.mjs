// Smoke test: import the Worker fetch handler and exercise it with a fake KV.
// Run with: node test/smoke.mjs

import worker from "../src/index.js";

// In-memory KV implementation matching the subset we use.
function makeKv() {
  const store = new Map();
  return {
    async get(key) {
      const ent = store.get(key);
      if (!ent) return null;
      if (ent.expiresAt && ent.expiresAt < Date.now()) {
        store.delete(key);
        return null;
      }
      return ent.value;
    },
    async put(key, value, opts = {}) {
      const ent = { value };
      if (opts.expirationTtl) {
        ent.expiresAt = Date.now() + opts.expirationTtl * 1000;
      }
      store.set(key, ent);
    },
    async delete(key) { store.delete(key); },
    async list({ prefix = "", limit = 1000, cursor } = {}) {
      const keys = [...store.keys()].filter((k) => k.startsWith(prefix));
      keys.sort();
      const start = cursor ? Number(cursor) : 0;
      const slice = keys.slice(start, start + limit);
      return {
        keys: slice.map((k) => ({ name: k })),
        list_complete: start + slice.length >= keys.length,
        cursor: String(start + slice.length),
      };
    },
    _store: store,
  };
}

const env = {
  LINKS: makeKv(),
  PUBLIC_BASE: "https://t.example.test",
  RESERVED_SLUGS: "api,admin,login,logout,assets,static,favicon.ico,robots.txt,_health,healthz",
  DEFAULT_SLUG_LENGTH: "6",
  MAX_URL_LENGTH: "2048",
  ALLOW_PUBLIC: "true",
  ADMIN_TOKEN: "admin-secret",
  UPLOAD_TOKEN: "upload-secret",
};

const ctx = { waitUntil: (p) => Promise.resolve(p).catch(() => {}) };

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log("\u2713", name);
    passed++;
  } catch (err) {
    console.error("\u2717", name);
    console.error(" ", err.stack || err);
    failed++;
  }
}

function req(path, init = {}) {
  return new Request("https://t.example.test" + path, init);
}

function assert(cond, msg) {
  if (!cond) throw new Error("assertion failed: " + msg);
}

// --- tests ---

await test("GET / serves landing page", async () => {
  const res = await worker.fetch(req("/"), env, ctx);
  assert(res.status === 200, "status " + res.status);
  const txt = await res.text();
  assert(txt.includes("shortr"), "title");
});

await test("GET /admin serves dashboard with noindex", async () => {
  const res = await worker.fetch(req("/admin"), env, ctx);
  assert(res.status === 200);
  assert(res.headers.get("x-robots-tag")?.includes("noindex"));
});

await test("GET /healthz returns ok", async () => {
  const res = await worker.fetch(req("/healthz"), env, ctx);
  const data = await res.json();
  assert(data.ok === true);
});

await test("POST /api/shorten anonymous works when ALLOW_PUBLIC=true", async () => {
  const res = await worker.fetch(req("/api/shorten", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "https://example.com/foo" }),
  }), env, ctx);
  assert(res.status === 201, "status " + res.status);
  const data = await res.json();
  assert(data.ok && data.slug && data.shortUrl.startsWith("https://t.example.test/"));
});

await test("Auto-generated slug redirects to destination", async () => {
  const create = await worker.fetch(req("/api/shorten", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "https://example.org/auto" }),
  }), env, ctx);
  const data = await create.json();
  const r2 = await worker.fetch(req("/" + data.slug, { redirect: "manual" }), env, ctx);
  assert(r2.status === 302, "status " + r2.status);
  assert(r2.headers.get("location") === "https://example.org/auto", r2.headers.get("location"));
});

await test("Custom slug works", async () => {
  const r = await worker.fetch(req("/api/shorten", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "https://example.com/custom", slug: "my-link" }),
  }), env, ctx);
  assert(r.status === 201);
  const r2 = await worker.fetch(req("/my-link", { redirect: "manual" }), env, ctx);
  assert(r2.status === 302);
});

await test("Reserved slug is rejected", async () => {
  const r = await worker.fetch(req("/api/shorten", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "https://example.com/", slug: "admin" }),
  }), env, ctx);
  assert(r.status === 400);
});

await test("Duplicate custom slug is 409", async () => {
  const r = await worker.fetch(req("/api/shorten", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "https://example.com/again", slug: "my-link" }),
  }), env, ctx);
  assert(r.status === 409, "status " + r.status);
});

await test("Invalid destination rejected", async () => {
  const r = await worker.fetch(req("/api/shorten", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "javascript:alert(1)" }),
  }), env, ctx);
  assert(r.status === 400);
});

await test("URL without scheme is normalised to https", async () => {
  const r = await worker.fetch(req("/api/shorten", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "example.com/no-scheme", slug: "ns1" }),
  }), env, ctx);
  assert(r.status === 201);
  const r2 = await worker.fetch(req("/ns1", { redirect: "manual" }), env, ctx);
  assert(r2.headers.get("location") === "https://example.com/no-scheme");
});

await test("Preview endpoint returns metadata", async () => {
  const r = await worker.fetch(req("/my-link+"), env, ctx);
  assert(r.status === 200);
  const data = await r.json();
  assert(data.url === "https://example.com/custom");
  assert(typeof data.clicks === "number");
});

await test("Click counter increments", async () => {
  const before = await (await worker.fetch(req("/my-link+"), env, ctx)).json();
  await worker.fetch(req("/my-link", { redirect: "manual" }), env, ctx);
  // Wait briefly for waitUntil microtask.
  await new Promise(r => setTimeout(r, 20));
  const after = await (await worker.fetch(req("/my-link+"), env, ctx)).json();
  assert(after.clicks === before.clicks + 1, `${before.clicks} -> ${after.clicks}`);
});

await test("Password-protected link shows gate, accepts correct password", async () => {
  const r = await worker.fetch(req("/api/shorten", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "https://example.com/secret", slug: "secret1", password: "hunter2" }),
  }), env, ctx);
  assert(r.status === 201);
  const gate = await worker.fetch(req("/secret1"), env, ctx);
  assert(gate.status === 401, "gate status " + gate.status);
  const wrong = await worker.fetch(req("/secret1", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "password=wrong",
  }), env, ctx);
  assert(wrong.status === 401);
  const ok = await worker.fetch(req("/secret1", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "password=hunter2",
    redirect: "manual",
  }), env, ctx);
  assert(ok.status === 302, "ok status " + ok.status);
  assert(ok.headers.get("location") === "https://example.com/secret");
});

await test("Max-clicks cap returns 410 once reached", async () => {
  const r = await worker.fetch(req("/api/shorten", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "https://example.com/cap", slug: "cap1", maxClicks: 2 }),
  }), env, ctx);
  assert(r.status === 201);
  for (let i = 0; i < 2; i++) {
    const hit = await worker.fetch(req("/cap1", { redirect: "manual" }), env, ctx);
    assert(hit.status === 302);
    await new Promise(r => setTimeout(r, 10));
  }
  const denied = await worker.fetch(req("/cap1", { redirect: "manual" }), env, ctx);
  assert(denied.status === 410, "expected 410 got " + denied.status);
});

await test("Admin /api/list requires bearer", async () => {
  const r = await worker.fetch(req("/api/list"), env, ctx);
  assert(r.status === 401);
});

await test("Admin /api/list with token returns items", async () => {
  const r = await worker.fetch(req("/api/list", {
    headers: { authorization: "Bearer admin-secret" },
  }), env, ctx);
  assert(r.status === 200);
  const data = await r.json();
  assert(data.ok && Array.isArray(data.items));
  assert(data.items.length > 0, "should have links");
});

await test("Admin DELETE removes link", async () => {
  await worker.fetch(req("/api/links/my-link", {
    method: "DELETE",
    headers: { authorization: "Bearer admin-secret" },
  }), env, ctx);
  const r = await worker.fetch(req("/my-link", { redirect: "manual" }), env, ctx);
  assert(r.status === 404);
});

await test("Admin PATCH updates URL", async () => {
  await worker.fetch(req("/api/shorten", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "https://example.com/v1", slug: "patchme" }),
  }), env, ctx);
  await worker.fetch(req("/api/links/patchme", {
    method: "PATCH",
    headers: { "content-type": "application/json", authorization: "Bearer admin-secret" },
    body: JSON.stringify({ url: "https://example.com/v2" }),
  }), env, ctx);
  const r = await worker.fetch(req("/patchme", { redirect: "manual" }), env, ctx);
  assert(r.headers.get("location") === "https://example.com/v2");
});

await test("Unknown slug 404s", async () => {
  const r = await worker.fetch(req("/nope-not-here"), env, ctx);
  assert(r.status === 404);
});

await test("Public shorten requires token when ALLOW_PUBLIC=false", async () => {
  const env2 = { ...env, LINKS: makeKv(), ALLOW_PUBLIC: "false" };
  const r = await worker.fetch(req("/api/shorten", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "https://example.com/p" }),
  }), env2, ctx);
  assert(r.status === 401);
  const r2 = await worker.fetch(req("/api/shorten", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer upload-secret" },
    body: JSON.stringify({ url: "https://example.com/p" }),
  }), env2, ctx);
  assert(r2.status === 201, "status " + r2.status);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
