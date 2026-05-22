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
      if (opts.expirationTtl) ent.expiresAt = Date.now() + opts.expirationTtl * 1000;
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

const KV_ID = "namespace-12345";
const ADMIN_TOKEN = "admin-secret-1234567890abcdef";

function makeEnv(over = {}) {
  return {
    LINKS: makeKv(),
    PUBLIC_BASE: "",
    RESERVED_SLUGS: "api,admin,login,signup,logout,my,assets,static,favicon.ico,robots.txt,_health,healthz",
    DEFAULT_SLUG_LENGTH: "6",
    MAX_URL_LENGTH: "2048",
    ALLOW_PUBLIC: "true",
    LINKS_NAMESPACE_ID: KV_ID,
    ADMIN_TOKEN,
    ...over,
  };
}

const ctx = { waitUntil: (p) => Promise.resolve(p).catch(() => {}) };

let passed = 0, failed = 0;
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

const ORIGIN = "https://t.example.test";
function req(path, init = {}) {
  return new Request(ORIGIN + path, init);
}
function assert(cond, msg) { if (!cond) throw new Error("assertion failed: " + msg); }

function getCookie(res, name) {
  const all = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get("set-cookie")].filter(Boolean);
  for (const c of all) {
    const m = c.match(new RegExp("^" + name + "=([^;]+)"));
    if (m) return decodeURIComponent(m[1]);
  }
  return null;
}

async function jsonOf(res) { return await res.json(); }

// ---------- Tests ----------

await test("GET / serves landing page", async () => {
  const env = makeEnv();
  const res = await worker.fetch(req("/"), env, ctx);
  assert(res.status === 200);
  const txt = await res.text();
  assert(txt.includes("shortr"));
});

await test("GET /admin without session redirects to /login", async () => {
  const env = makeEnv();
  const res = await worker.fetch(req("/admin"), env, ctx);
  assert(res.status === 303, "status " + res.status);
  assert(res.headers.get("location") === "/login");
});

await test("Admin login URL sets cookie and redirects to /admin", async () => {
  const env = makeEnv();
  const res = await worker.fetch(req(`/${KV_ID}/${ADMIN_TOKEN}`), env, ctx);
  assert(res.status === 303);
  assert(res.headers.get("location") === "/admin");
  const sid = getCookie(res, "shortr_sid");
  assert(sid && sid.length > 20, "sid=" + sid);
  // Use cookie to fetch admin page
  const adminRes = await worker.fetch(req("/admin", { headers: { cookie: "shortr_sid=" + sid } }), env, ctx);
  assert(adminRes.status === 200);
  const html = await adminRes.text();
  assert(html.includes("Admin dashboard"));
});

await test("Wrong admin URL is 404 (not even revealed)", async () => {
  const env = makeEnv();
  const res = await worker.fetch(req(`/${KV_ID}/wrong-token`), env, ctx);
  assert(res.status === 404, "status " + res.status);
});

await test("Anonymous shorten gets edit token + cookie", async () => {
  const env = makeEnv();
  const res = await worker.fetch(req("/api/shorten", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "https://example.com/foo" }),
  }), env, ctx);
  assert(res.status === 201, "status " + res.status);
  const data = await jsonOf(res);
  assert(data.editToken && data.editToken.length === 32, "editToken " + data.editToken);
  assert(data.editUrl && data.editUrl.includes(":" + data.editToken));
  assert(data.owner.kind === "anon");
  assert(getCookie(res, "shortr_anon"), "anon cookie set");
});

await test("Edit-by-token GET shows edit page", async () => {
  const env = makeEnv();
  const r1 = await worker.fetch(req("/api/shorten", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "https://example.com/edit", slug: "abc1" }),
  }), env, ctx);
  const d = await r1.json();
  const tokenUrlPath = `/abc1:${d.editToken}`;
  const res = await worker.fetch(req(tokenUrlPath), env, ctx);
  assert(res.status === 200);
  const html = await res.text();
  assert(html.includes("Edit /abc1"));
  assert(html.includes("https://example.com/edit"));
});

await test("Edit-by-token rejects wrong token", async () => {
  const env = makeEnv();
  const r1 = await worker.fetch(req("/api/shorten", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "https://example.com/x", slug: "abc2" }),
  }), env, ctx);
  await r1.json();
  const wrong = "abcdefghijklmnopqrstuvwxyz123456";
  const res = await worker.fetch(req(`/abc2:${wrong}`), env, ctx);
  assert(res.status === 401);
});

await test("Edit-by-token POST updates destination", async () => {
  const env = makeEnv();
  const r1 = await worker.fetch(req("/api/shorten", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "https://example.com/v1", slug: "tok1" }),
  }), env, ctx);
  const d = await r1.json();
  const res = await worker.fetch(req(`/tok1:${d.editToken}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "action=update&url=https://example.com/v2&note=updated",
  }), env, ctx);
  assert(res.status === 200);
  const r3 = await worker.fetch(req("/tok1", { redirect: "manual" }), env, ctx);
  assert(r3.status === 302);
  assert(r3.headers.get("location") === "https://example.com/v2", r3.headers.get("location"));
});

await test("Edit-by-token POST delete removes link", async () => {
  const env = makeEnv();
  const r1 = await worker.fetch(req("/api/shorten", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "https://example.com/del", slug: "del1" }),
  }), env, ctx);
  const d = await r1.json();
  const res = await worker.fetch(req(`/del1:${d.editToken}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "action=delete",
  }), env, ctx);
  assert(res.status === 200);
  const r3 = await worker.fetch(req("/del1"), env, ctx);
  assert(r3.status === 404);
});

await test("Token API: PATCH with Authorization Token", async () => {
  const env = makeEnv();
  const r1 = await worker.fetch(req("/api/shorten", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "https://example.com/api", slug: "apit" }),
  }), env, ctx);
  const d = await r1.json();
  const res = await worker.fetch(req("/api/edit/apit", {
    method: "PATCH",
    headers: { "content-type": "application/json", authorization: "Token " + d.editToken },
    body: JSON.stringify({ url: "https://example.com/api2" }),
  }), env, ctx);
  assert(res.status === 200);
  const r3 = await worker.fetch(req("/apit", { redirect: "manual" }), env, ctx);
  assert(r3.headers.get("location") === "https://example.com/api2");
});

await test("Token API rejects missing token", async () => {
  const env = makeEnv();
  const r1 = await worker.fetch(req("/api/shorten", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "https://example.com/", slug: "no-tok" }),
  }), env, ctx);
  await r1.json();
  const res = await worker.fetch(req("/api/edit/no-tok", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "https://example.com/x" }),
  }), env, ctx);
  assert(res.status === 401);
});

// ---------- Account flow ----------

await test("Signup creates account and sets cookie", async () => {
  const env = makeEnv();
  const res = await worker.fetch(req("/api/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "username=alice&password=secret123",
  }), env, ctx);
  assert(res.status === 303, "status " + res.status);
  assert(res.headers.get("location") === "/my");
  assert(getCookie(res, "shortr_sid"));
});

await test("Signup rejects duplicate username", async () => {
  const env = makeEnv();
  for (let i = 0; i < 1; i++) {
    await worker.fetch(req("/api/auth/signup", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "username=bob&password=secret123",
    }), env, ctx);
  }
  const res = await worker.fetch(req("/api/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "username=bob&password=secret123",
  }), env, ctx);
  assert(res.status === 409, "status " + res.status);
});

await test("Login works and reaches /my", async () => {
  const env = makeEnv();
  await worker.fetch(req("/api/auth/signup", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "username=carol&password=hunter2hunter2",
  }), env, ctx);
  // separate "browser": no cookies
  const res = await worker.fetch(req("/api/auth/login", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "username=carol&password=hunter2hunter2",
  }), env, ctx);
  assert(res.status === 303);
  const sid = getCookie(res, "shortr_sid");
  assert(sid);
  const my = await worker.fetch(req("/my", { headers: { cookie: "shortr_sid=" + sid } }), env, ctx);
  assert(my.status === 200);
  const html = await my.text();
  assert(html.includes("@carol"));
});

await test("Login wrong password is 401", async () => {
  const env = makeEnv();
  await worker.fetch(req("/api/auth/signup", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "username=dave&password=correctpass",
  }), env, ctx);
  const res = await worker.fetch(req("/api/auth/login", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "username=dave&password=wrongwrong",
  }), env, ctx);
  assert(res.status === 401);
});

await test("Logged-in user shorten is owner=user", async () => {
  const env = makeEnv();
  const su = await worker.fetch(req("/api/auth/signup", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "username=eve&password=secret-pass-2",
  }), env, ctx);
  const sid = getCookie(su, "shortr_sid");
  const res = await worker.fetch(req("/api/shorten", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: "shortr_sid=" + sid },
    body: JSON.stringify({ url: "https://example.com/eve", slug: "eve1" }),
  }), env, ctx);
  const data = await res.json();
  assert(data.owner.kind === "user");
});

await test("/api/me/links lists links for the cookie", async () => {
  const env = makeEnv();
  const su = await worker.fetch(req("/api/auth/signup", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "username=frank&password=secret-pass-3",
  }), env, ctx);
  const sid = getCookie(su, "shortr_sid");
  await worker.fetch(req("/api/shorten", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: "shortr_sid=" + sid },
    body: JSON.stringify({ url: "https://example.com/a", slug: "fra1" }),
  }), env, ctx);
  await worker.fetch(req("/api/shorten", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: "shortr_sid=" + sid },
    body: JSON.stringify({ url: "https://example.com/b", slug: "fra2" }),
  }), env, ctx);
  const list = await worker.fetch(req("/api/me/links", { headers: { cookie: "shortr_sid=" + sid } }), env, ctx);
  const data = await list.json();
  assert(data.items.length === 2, "got " + data.items.length);
  assert(data.items.some((i) => i.slug === "fra1"));
});

await test("Anonymous user sees their own links via cookie", async () => {
  const env = makeEnv();
  const create = await worker.fetch(req("/api/shorten", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "https://example.com/anon" }),
  }), env, ctx);
  const anonCookie = getCookie(create, "shortr_anon");
  const data = await create.json();
  const list = await worker.fetch(req("/api/me/links", {
    headers: { cookie: "shortr_anon=" + anonCookie },
  }), env, ctx);
  const ld = await list.json();
  assert(ld.items.some((i) => i.slug === data.slug), "should see own anon link");
});

await test("/api/me/links/<slug> patch updates URL", async () => {
  const env = makeEnv();
  const create = await worker.fetch(req("/api/shorten", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "https://example.com/me1", slug: "me1" }),
  }), env, ctx);
  const anon = getCookie(create, "shortr_anon");
  const patch = await worker.fetch(req("/api/me/links/me1", {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: "shortr_anon=" + anon },
    body: JSON.stringify({ url: "https://example.com/me1-v2" }),
  }), env, ctx);
  assert(patch.status === 200);
  const r = await worker.fetch(req("/me1", { redirect: "manual" }), env, ctx);
  assert(r.headers.get("location") === "https://example.com/me1-v2");
});

await test("Other user cannot patch via /api/me/links", async () => {
  const env = makeEnv();
  const a = await worker.fetch(req("/api/shorten", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "https://example.com/own", slug: "own1" }),
  }), env, ctx);
  await a.json();
  // Different anon cookie:
  const res = await worker.fetch(req("/api/me/links/own1", {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: "shortr_anon=anon_otheridhere" },
    body: JSON.stringify({ url: "https://attacker.example.com" }),
  }), env, ctx);
  assert(res.status === 403, "status " + res.status);
});

// ---------- Admin operations ----------

async function adminSid(env) {
  const r = await worker.fetch(req(`/${KV_ID}/${ADMIN_TOKEN}`), env, ctx);
  return getCookie(r, "shortr_sid");
}

await test("Admin can list every link", async () => {
  const env = makeEnv();
  await worker.fetch(req("/api/shorten", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "https://example.com/x", slug: "ax1" }),
  }), env, ctx);
  await worker.fetch(req("/api/shorten", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "https://example.com/y", slug: "ax2" }),
  }), env, ctx);
  const sid = await adminSid(env);
  const r = await worker.fetch(req("/api/admin/links", { headers: { cookie: "shortr_sid=" + sid } }), env, ctx);
  const d = await r.json();
  assert(d.items.length >= 2);
});

await test("Admin can extend (patch expiry) someone else's anon link", async () => {
  const env = makeEnv();
  const create = await worker.fetch(req("/api/shorten", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "https://example.com/extend", slug: "ext1", ttl: 120 }),
  }), env, ctx);
  await create.json();
  const sid = await adminSid(env);
  const future = Date.now() + 3600 * 24 * 1000;
  const r = await worker.fetch(req("/api/admin/links/ext1", {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: "shortr_sid=" + sid },
    body: JSON.stringify({ expiresAt: future }),
  }), env, ctx);
  assert(r.status === 200);
  const get = await worker.fetch(req("/api/admin/links/ext1", { headers: { cookie: "shortr_sid=" + sid } }), env, ctx);
  const d = await get.json();
  assert(d.expiresAt === future, d.expiresAt + " vs " + future);
});

await test("Admin DELETE removes link", async () => {
  const env = makeEnv();
  await worker.fetch(req("/api/shorten", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "https://example.com/d", slug: "dd1" }),
  }), env, ctx);
  const sid = await adminSid(env);
  await worker.fetch(req("/api/admin/links/dd1", { method: "DELETE", headers: { cookie: "shortr_sid=" + sid } }), env, ctx);
  const r = await worker.fetch(req("/dd1"), env, ctx);
  assert(r.status === 404);
});

await test("Non-admin cannot reach /api/admin", async () => {
  const env = makeEnv();
  const r = await worker.fetch(req("/api/admin/links"), env, ctx);
  assert(r.status === 401);
});

// ---------- Slug & redirect basics ----------

await test("Reserved slug rejected", async () => {
  const env = makeEnv();
  const r = await worker.fetch(req("/api/shorten", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "https://x.test/", slug: "admin" }),
  }), env, ctx);
  assert(r.status === 400);
});

await test("Invalid destination rejected", async () => {
  const env = makeEnv();
  const r = await worker.fetch(req("/api/shorten", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "javascript:alert(1)" }),
  }), env, ctx);
  assert(r.status === 400);
});

await test("Auto slug redirects", async () => {
  const env = makeEnv();
  const r = await worker.fetch(req("/api/shorten", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "example.com/auto" }),
  }), env, ctx);
  const d = await r.json();
  const r2 = await worker.fetch(req("/" + d.slug, { redirect: "manual" }), env, ctx);
  assert(r2.status === 302);
  assert(r2.headers.get("location") === "https://example.com/auto");
});

await test("Preview endpoint returns metadata", async () => {
  const env = makeEnv();
  await worker.fetch(req("/api/shorten", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "https://example.com/p", slug: "prev1" }),
  }), env, ctx);
  const r = await worker.fetch(req("/prev1+"), env, ctx);
  assert(r.status === 200);
  const d = await r.json();
  assert(d.url === "https://example.com/p");
});

await test("Password-protected link round trip", async () => {
  const env = makeEnv();
  await worker.fetch(req("/api/shorten", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "https://example.com/secret", slug: "secret1", password: "hunter2" }),
  }), env, ctx);
  const gate = await worker.fetch(req("/secret1"), env, ctx);
  assert(gate.status === 401);
  const ok = await worker.fetch(req("/secret1", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "password=hunter2",
    redirect: "manual",
  }), env, ctx);
  assert(ok.status === 302);
});

await test("Max-clicks 410 once exhausted", async () => {
  const env = makeEnv();
  await worker.fetch(req("/api/shorten", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "https://example.com/c", slug: "cap1", maxClicks: 1 }),
  }), env, ctx);
  const r1 = await worker.fetch(req("/cap1", { redirect: "manual" }), env, ctx);
  assert(r1.status === 302);
  await new Promise(r => setTimeout(r, 10));
  const r2 = await worker.fetch(req("/cap1", { redirect: "manual" }), env, ctx);
  assert(r2.status === 410);
});

await test("ALLOW_PUBLIC=false blocks anon shorten", async () => {
  const env = makeEnv({ ALLOW_PUBLIC: "false" });
  const r = await worker.fetch(req("/api/shorten", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "https://example.com" }),
  }), env, ctx);
  assert(r.status === 401);
});

await test("Logout clears cookie", async () => {
  const env = makeEnv();
  const su = await worker.fetch(req("/api/auth/signup", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "username=greg&password=secret-pass",
  }), env, ctx);
  const sid = getCookie(su, "shortr_sid");
  const out = await worker.fetch(req("/api/auth/logout", {
    method: "POST",
    headers: { cookie: "shortr_sid=" + sid },
  }), env, ctx);
  assert(out.status === 303);
  // session shouldn't authorize anymore:
  const r = await worker.fetch(req("/my", { headers: { cookie: "shortr_sid=" + sid } }), env, ctx);
  // /my still renders for anon (not auth-required), so it must NOT show @greg.
  const html = await r.text();
  assert(!html.includes("@greg"), "should not show old user");
});

await test("Admin page does not leak the namespace ID", async () => {
  const env = makeEnv();
  // Get an admin session
  const r = await worker.fetch(req(`/${KV_ID}/${ADMIN_TOKEN}`), env, ctx);
  const sid = getCookie(r, "shortr_sid");
  const adm = await worker.fetch(req("/admin", { headers: { cookie: "shortr_sid=" + sid } }), env, ctx);
  assert(adm.status === 200);
  const html = await adm.text();
  assert(!html.includes(KV_ID), "admin page should not mention KV_ID");
  assert(!html.includes("Manage every link"), "admin page should not mention old hint text");
  assert(!html.includes("login URL is bound"), "admin page should not mention old hint text");
});

await test("Pages ship both English and Chinese dictionaries", async () => {
  const env = makeEnv();
  const html = await (await worker.fetch(req("/"), env, ctx)).text();
  assert(html.includes('"zh"'), "should embed zh dictionary");
  assert(html.includes('"en"'), "should embed en dictionary");
  assert(html.includes("生成短链"), "should embed Chinese strings");
  assert(html.includes("Shorten a URL"), "should keep English strings as fallback");
  assert(html.includes('id="langBtn"'), "should render the language toggle button");
});

await test("Pages declare mobile-friendly viewport", async () => {
  const env = makeEnv();
  const html = await (await worker.fetch(req("/"), env, ctx)).text();
  assert(html.includes("width=device-width"), "viewport meta missing");
  assert(html.includes("@media (max-width: 640px)"), "mobile breakpoint missing");
  assert(html.includes("table.responsive"), "responsive table CSS missing");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
