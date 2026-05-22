// shortr — URL shortener on Cloudflare Workers + KV.
//
// Routing model
// =============
// Every request is interpreted relative to the configured BASE_DOMAIN so that
// host-style short links work out of the box:
//
//   foo.example.com/         → host "foo", slug ""    (host-only short link)
//   foo.example.com/abc      → host "foo", slug "abc"
//   example.com/abc          → host "",    slug "abc"
//   example.com/             → host "",    slug ""    (landing)
//
// When BASE_DOMAIN is empty (e.g. on `*.workers.dev`), every request uses
// host="" so the service degrades cleanly to path-only short links.
//
// The dashboard, admin pages, and API endpoints are pinned to the apex —
// they reject host-prefix traffic so you can't smuggle them under
// `admin.example.com/...`.

import {
  getLink, putLink, deleteLink, indexLink,
  getStats, bumpStats,
  listAllLinks, listOwnerLinks,
  getUser, getUserIdByUsername, putUser,
} from "./store.js";
import {
  randomSlug, randomToken, randomId,
  isValidSlug, isReservedSlug, isValidToken, isValidUsername, isValidHostLabel,
  normalizeUrl, sha256Hex, hashPassword, verifyPassword, timingSafeEqual,
  jsonResponse, errorResponse, getClientIp, publicBaseFromRequest,
  hostLabel, verifyTurnstile, ttlToSeconds,
} from "./util.js";
import {
  readIdentity, ownerForIdentity, startSession, endSession,
  ensureAnonCookie, withCookies,
} from "./auth.js";
import {
  landingPage, authPage, myPage, adminPage, adminLoginPage, tokenEditPage,
  passwordGate, notFoundHtml, goneHtml,
} from "./pages.js";

const HTML_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
};

const SECURE_REDIRECT_HEADERS = {
  "cache-control": "private, no-store",
  "referrer-policy": "no-referrer",
};

export default {
  async fetch(request, env, ctx) {
    if (!env.LINKS) {
      return errorResponse("KV binding LINKS is not configured. Edit wrangler.toml.", 500);
    }
    if (!env.ADMIN_TOKEN) {
      return errorResponse("ADMIN_TOKEN secret is not set. Run `wrangler secret put ADMIN_TOKEN`.", 500);
    }
    if (!env.ADMIN_USER) {
      return errorResponse("ADMIN_USER var is not set. Edit wrangler.toml [vars] ADMIN_USER and `wrangler deploy`.", 500);
    }

    try {
      return await route(request, env, ctx);
    } catch (err) {
      console.error("unhandled", err && err.stack || err);
      return errorResponse("internal error", 500);
    }
  },
};

async function route(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // Resolve the host slug (subdomain) for this request.
  const baseDomain = (env.BASE_DOMAIN || "").toLowerCase();
  const reqHost = url.host.toLowerCase();
  const host = hostLabel(reqHost, baseDomain);
  const isApex = !host;

  // 1. Health and statics.
  if (path === "/healthz") return jsonResponse({ ok: true, ts: Date.now() });
  if (path === "/robots.txt")
    return new Response("User-agent: *\nDisallow: /admin\nDisallow: /my\n", {
      headers: { "content-type": "text/plain" },
    });

  // 2. Admin login URL: /<KV_ID>/<ADMIN_TOKEN>
  // GET unlocks the admin login form (sets a short-lived "admin_unlock" cookie).
  // POST submits username + password against a real account whose username
  // must equal env.ADMIN_USER.
  const adminPath = adminLoginPathPattern(env);
  if (adminPath && isApex && path === adminPath) {
    if (method === "GET") {
      const cookie = startAdminUnlockCookie();
      return htmlResponseWithCookies(adminLoginPage({ error: "", username: "" }), 200, [cookie]);
    }
    if (method === "POST") return handleAdminLogin(request, env);
    return errorResponse("method not allowed", 405);
  }

  const identity = await readIdentity(request, env);
  const isAdmin = identity.session?.kind === "admin";
  const user = identity.user;

  // 3. Apex-only chrome (dashboards, auth, API). On a host-prefix request
  // we fall through to the slug routes so that e.g. foo.example.com/login
  // doesn't accidentally work as the auth screen.
  if (isApex) {
    if (path === "/" || path === "/index.html") {
      if (method !== "GET") return errorResponse("method not allowed", 405);
      return htmlResponse(
        landingPage({
          user, isAdmin,
          allowPublic: env.ALLOW_PUBLIC === "true",
          defaultSlugLength: Number(env.DEFAULT_SLUG_LENGTH) || 4,
          maxUrlLength: Number(env.MAX_URL_LENGTH) || 2048,
          baseDomain,
          turnstileSiteKey: env.TURNSTILE_SITEKEY || "",
        }),
      );
    }
    if (path === "/login" && method === "GET") {
      if (user) return redirect("/my");
      if (isAdmin) return redirect("/admin");
      return htmlResponse(authPage({ kind: "login" }));
    }
    if (path === "/signup" && method === "GET") {
      if (user || isAdmin) return redirect("/my");
      return htmlResponse(authPage({ kind: "signup", turnstileSiteKey: env.TURNSTILE_SITEKEY || "" }));
    }
    if (path === "/my" && method === "GET") {
      if (isAdmin && !user) return redirect("/admin");
      let setCookie = null;
      if (!user) {
        const anon = ensureAnonCookie(identity);
        setCookie = anon.setCookie;
        identity.anonId = anon.anonId;
      }
      const res = htmlResponse(
        myPage({ user, anonId: identity.anonId, baseDomain }),
      );
      return setCookie ? withCookies(res, setCookie) : res;
    }
    if (path === "/admin" && method === "GET") {
      if (!isAdmin) return redirect("/login");
      return htmlResponse(adminPage({ baseDomain }));
    }

    // 4. Auth API.
    if (path === "/api/auth/signup" && method === "POST") return handleSignup(request, env);
    if (path === "/api/auth/login"  && method === "POST") return handleLogin(request, env);
    if (path === "/api/auth/logout" && method === "POST") {
      const cookie = await endSession(env, request);
      return new Response(null, {
        status: 303,
        headers: { location: "/", "set-cookie": cookie, "cache-control": "no-store" },
      });
    }

    // 5. /api/shorten — create a link.
    if (path === "/api/shorten" && method === "POST") {
      return handleShorten(request, env, identity);
    }

    // 6. /api/me/links[/<host>:<slug>]
    if (path === "/api/me/links" && method === "GET") {
      return handleMyList(request, env, identity);
    }
    let m = path.match(/^\/api\/me\/links\/([^/]+)$/);
    if (m) {
      const ref = parseRef(decodeURIComponent(m[1]));
      if (!ref) return errorResponse("invalid slug", 400);
      if (method === "GET")    return handleOwnerGet(request, env, identity, ref);
      if (method === "PATCH")  return handleOwnerPatch(request, env, identity, ref);
      if (method === "DELETE") return handleOwnerDelete(request, env, identity, ref);
      return errorResponse("method not allowed", 405);
    }

    // 7. /api/admin/links[/<host>:<slug>]
    if (path === "/api/admin/links" && method === "GET") {
      if (!isAdmin) return errorResponse("unauthorized", 401);
      const params = url.searchParams;
      const data = await listAllLinks(env, {
        prefix: params.get("prefix") || "",
        cursor: params.get("cursor"),
        limit: Math.min(Number(params.get("limit")) || 50, 200),
      });
      return jsonResponse({ ok: true, ...data });
    }
    m = path.match(/^\/api\/admin\/links\/([^/]+)$/);
    if (m) {
      if (!isAdmin) return errorResponse("unauthorized", 401);
      const ref = parseRef(decodeURIComponent(m[1]));
      if (!ref) return errorResponse("invalid slug", 400);
      if (method === "GET") {
        const rec = await getLink(env, ref.host, ref.slug);
        if (!rec) return errorResponse("not found", 404);
        const stats = await getStats(env, ref.host, ref.slug);
        return jsonResponse({ ok: true, host: ref.host, slug: ref.slug, ...rec, ...stats });
      }
      if (method === "DELETE") {
        const rec = await getLink(env, ref.host, ref.slug);
        await deleteLink(env, ref.host, ref.slug, rec?.owner);
        return jsonResponse({ ok: true });
      }
      if (method === "PATCH") return handlePatchAdmin(request, env, ref);
      return errorResponse("method not allowed", 405);
    }

    // 8. /api/edit/<host>:<slug> — token-gated edit (no cookie).
    m = path.match(/^\/api\/edit\/([^/]+)$/);
    if (m) {
      const ref = parseRef(decodeURIComponent(m[1]));
      if (!ref) return errorResponse("invalid slug", 400);
      return handleTokenApi(request, env, ref);
    }
  }

  // 9. Slug routes (apply on every host: apex + sub).
  //    /<slug>:<token>           edit form
  //    /<slug>+                  JSON preview
  //    /<slug>                   redirect or password
  // When host != "" and path is "/" we also treat it as a host-only short link.

  if (path === "/" && host) {
    if (method === "GET" || method === "HEAD") return handleRedirect(request, env, ctx, host, "");
    if (method === "POST") return handlePasswordSubmit(request, env, ctx, host, "");
    return errorResponse("method not allowed", 405);
  }

  let m = path.match(/^\/([A-Za-z0-9_-]{1,64}):([A-Za-z0-9_-]{16,128})$/);
  if (m) {
    const slug = m[1];
    const token = m[2];
    if (method === "GET" || method === "HEAD") return handleTokenEditGet(request, env, host, slug, token);
    if (method === "POST") return handleTokenEditPost(request, env, host, slug, token);
    return errorResponse("method not allowed", 405);
  }

  m = path.match(/^\/([^/+:]+)(\+)?$/);
  if (m) {
    const slug = decodeURIComponent(m[1]);
    const isPreview = m[2] === "+";
    if (!isValidSlug(slug)) return notFoundResponse();
    if (isPreview) return handlePreview(request, env, host, slug);
    if (method === "GET" || method === "HEAD") return handleRedirect(request, env, ctx, host, slug);
    if (method === "POST") return handlePasswordSubmit(request, env, ctx, host, slug);
    return errorResponse("method not allowed", 405);
  }

  return notFoundResponse();
}

// ---------- Helpers ----------

function htmlResponse(html, status = 200, extra = {}) {
  return new Response(html, { status, headers: { ...HTML_HEADERS, ...extra } });
}
function htmlResponseWithCookies(html, status, cookies) {
  const h = new Headers(HTML_HEADERS);
  for (const c of cookies || []) if (c) h.append("set-cookie", c);
  return new Response(html, { status, headers: h });
}
function redirect(location, status = 303, extraHeaders = {}) {
  return new Response(null, { status, headers: { location, "cache-control": "no-store", ...extraHeaders } });
}
function notFoundResponse() {
  return new Response(notFoundHtml(), { status: 404, headers: HTML_HEADERS });
}
function goneResponse(message) {
  return new Response(goneHtml(message), { status: 410, headers: HTML_HEADERS });
}

function adminLoginPathPattern(env) {
  if (!env.LINKS_NAMESPACE_ID || !env.ADMIN_TOKEN) return null;
  return `/${env.LINKS_NAMESPACE_ID}/${env.ADMIN_TOKEN}`;
}

function isOwnerOf(identity, rec) {
  if (!rec || !rec.owner) return false;
  if (identity.session?.kind === "admin") return true;
  if (rec.owner.kind === "user" && identity.user && rec.owner.userId === identity.user.id) return true;
  if (rec.owner.kind === "anon" && identity.anonId && rec.owner.anonId === identity.anonId) return true;
  return false;
}

// Parse a "host:slug" reference (used in /api/.../<ref>). Either side may be
// empty (e.g. ":abc" → host="", slug="abc"; "foo:" → host="foo"; "abc"
// without a colon → host="", slug="abc" for backwards compatibility).
function parseRef(raw) {
  if (typeof raw !== "string" || !raw) return null;
  let host = "", slug = raw;
  if (raw.includes(":")) {
    const idx = raw.indexOf(":");
    host = raw.slice(0, idx);
    slug = raw.slice(idx + 1);
  }
  if (host && !isValidHostLabel(host)) return null;
  if (slug && !isValidSlug(slug)) return null;
  if (!host && !slug) return null;
  return { host, slug };
}

// ---------- Admin two-step login ----------

const ADMIN_UNLOCK_COOKIE = "shortr_admin_unlock";
const ADMIN_UNLOCK_TTL = 600; // 10 minutes

function startAdminUnlockCookie() {
  const parts = [
    `${ADMIN_UNLOCK_COOKIE}=1`,
    "Path=/",
    "Max-Age=" + ADMIN_UNLOCK_TTL,
    "SameSite=Lax",
    "HttpOnly",
    "Secure",
  ];
  return parts.join("; ");
}

function clearAdminUnlockCookie() {
  return `${ADMIN_UNLOCK_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly; Secure`;
}

async function handleAdminLogin(request, env) {
  // Must hold the unlock cookie (i.e. came in via the admin login URL).
  const cookieHdr = request.headers.get("cookie") || "";
  const unlocked = cookieHdr.split(";").some((c) => c.trim().startsWith(ADMIN_UNLOCK_COOKIE + "="));
  if (!unlocked) {
    return new Response(adminLoginPage({ error: "Session expired. Reload the admin URL.", username: "" }), { status: 401, headers: HTML_HEADERS });
  }

  const body = await readForm(request);
  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  if (!username || !password) {
    return new Response(adminLoginPage({ error: "Enter username and password.", username }), { status: 400, headers: HTML_HEADERS });
  }

  // The submitted username must equal env.ADMIN_USER (case-insensitive).
  if (username.toLowerCase() !== env.ADMIN_USER.toLowerCase()) {
    // Verify a dummy hash to keep timing constant.
    await verifyPassword(password, "pbkdf2$1$AAAA$AAAA");
    return new Response(adminLoginPage({ error: "Wrong admin username or password.", username }), { status: 401, headers: HTML_HEADERS });
  }

  const userId = await getUserIdByUsername(env, env.ADMIN_USER);
  const adminUser = userId ? await getUser(env, userId) : null;
  const ok = adminUser
    ? await verifyPassword(password, adminUser.passwordHash)
    : await verifyPassword(password, "pbkdf2$1$AAAA$AAAA");
  if (!adminUser || !ok) {
    return new Response(adminLoginPage({ error: "Wrong admin username or password.", username }), { status: 401, headers: HTML_HEADERS });
  }

  const { cookie } = await startSession(env, "admin", { userId: adminUser.id });
  const headers = new Headers({ location: "/admin", "cache-control": "no-store" });
  headers.append("set-cookie", cookie);
  headers.append("set-cookie", clearAdminUnlockCookie());
  return new Response(null, { status: 303, headers });
}

// ---------- Auth handlers ----------

async function readForm(request) {
  const ct = request.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    try { return await request.json(); } catch { return {}; }
  }
  if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
    const fd = await request.formData();
    const out = {};
    for (const [k, v] of fd.entries()) out[k] = typeof v === "string" ? v : "";
    return out;
  }
  return {};
}

async function handleSignup(request, env) {
  const body = await readForm(request);
  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  const turnstileResp = body["cf-turnstile-response"] || body.turnstileResponse || "";

  // CAPTCHA first (cheap before hashing).
  const captcha = await verifyTurnstile(env, turnstileResp, getClientIp(request));
  if (!captcha.ok) {
    return htmlResponse(authPage({
      kind: "signup",
      error: "Captcha failed. Please try again.",
      username,
      turnstileSiteKey: env.TURNSTILE_SITEKEY || "",
    }), 400);
  }

  if (!isValidUsername(username)) {
    return htmlResponse(authPage({
      kind: "signup",
      error: "Username must be 3-32 chars: letters, digits, dot, dash, underscore.",
      username,
      turnstileSiteKey: env.TURNSTILE_SITEKEY || "",
    }), 400);
  }
  if (password.length < 6 || password.length > 200) {
    return htmlResponse(authPage({
      kind: "signup",
      error: "Password must be 6-200 characters.",
      username,
      turnstileSiteKey: env.TURNSTILE_SITEKEY || "",
    }), 400);
  }
  const existing = await getUserIdByUsername(env, username);
  if (existing) {
    return htmlResponse(authPage({
      kind: "signup",
      error: "Username already taken.",
      username,
      turnstileSiteKey: env.TURNSTILE_SITEKEY || "",
    }), 409);
  }
  const id = "user_" + randomId();
  const userRec = {
    id,
    username,
    usernameLower: username.toLowerCase(),
    passwordHash: await hashPassword(password),
    createdAt: Date.now(),
  };
  await putUser(env, userRec);
  const { cookie } = await startSession(env, "user", { userId: id });
  return new Response(null, {
    status: 303,
    headers: { location: "/my", "set-cookie": cookie, "cache-control": "no-store" },
  });
}

async function handleLogin(request, env) {
  const body = await readForm(request);
  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  if (!username || !password) {
    return htmlResponse(authPage({ kind: "login", error: "Enter username and password.", username }), 400);
  }
  const userId = await getUserIdByUsername(env, username);
  const user = userId ? await getUser(env, userId) : null;
  const ok = user
    ? await verifyPassword(password, user.passwordHash)
    : await verifyPassword(password, "pbkdf2$1$AAAA$AAAA");
  if (!user || !ok) {
    return htmlResponse(authPage({ kind: "login", error: "Invalid username or password.", username }), 401);
  }
  const { cookie } = await startSession(env, "user", { userId: user.id });
  return new Response(null, {
    status: 303,
    headers: { location: "/my", "set-cookie": cookie, "cache-control": "no-store" },
  });
}

// ---------- Shorten ----------

async function handleShorten(request, env, identity) {
  const allowPublic = env.ALLOW_PUBLIC === "true";
  const isAdmin = identity.session?.kind === "admin";
  const user = identity.user;
  const baseDomain = (env.BASE_DOMAIN || "").toLowerCase();

  let setCookie = null;
  if (!isAdmin && !user) {
    if (!allowPublic) return errorResponse("login required", 401);
    const anon = ensureAnonCookie(identity);
    setCookie = anon.setCookie;
    identity.anonId = anon.anonId;
  }

  let body;
  try { body = await request.json(); } catch { return errorResponse("invalid JSON body", 400); }

  const maxLen = Number(env.MAX_URL_LENGTH) || 2048;
  if (typeof body.url !== "string" || body.url.length > maxLen) {
    return errorResponse("url too long or missing", 400);
  }
  const dest = normalizeUrl(body.url);
  if (!dest) return errorResponse("invalid destination URL", 400);

  // Host slug: only valid if BASE_DOMAIN is configured.
  let host = "";
  if (typeof body.host === "string" && body.host.trim()) {
    if (!baseDomain) return errorResponse("host slugs are disabled (BASE_DOMAIN not configured)", 400);
    const h = body.host.trim().toLowerCase();
    if (!isValidHostLabel(h)) return errorResponse("invalid host label", 400);
    if (isReservedSlug(h, env.RESERVED_SLUGS || "")) return errorResponse("host is reserved", 400);
    host = h;
  }

  // Path slug: optional only when host is set; otherwise required (random fallback).
  let slug = body.slug ? String(body.slug).trim() : "";
  const slugProvided = !!slug;
  if (slug) {
    if (!isValidSlug(slug)) return errorResponse("invalid slug", 400);
    if (!host && isReservedSlug(slug, env.RESERVED_SLUGS || "")) return errorResponse("slug is reserved", 400);
  }

  // Validate at least one of host/slug is present.
  if (!host && !slug) {
    // Auto-generate path slug (host blank).
    const len = Math.max(2, Math.min(32, Number(env.DEFAULT_SLUG_LENGTH) || 4));
    for (let i = 0; i < 6; i++) {
      slug = randomSlug(len + Math.floor(i / 2));
      if (isReservedSlug(slug, env.RESERVED_SLUGS || "")) { slug = ""; continue; }
      if (!(await getLink(env, "", slug))) break;
      slug = "";
    }
    if (!slug) return errorResponse("could not allocate slug", 500);
  } else if (host && !slugProvided) {
    // host-only short link: keep slug = ""
    if (await getLink(env, host, "")) return errorResponse("host already taken", 409);
  } else {
    if (await getLink(env, host, slug)) return errorResponse("slug already taken", 409);
  }

  const owner = ownerForIdentity(identity);
  const editToken = randomToken(32);
  const editTokenHash = await sha256Hex(editToken);

  const now = Date.now();
  const record = {
    url: dest,
    createdAt: now,
    creatorIp: getClientIp(request),
    owner,
    editTokenHash,
    host, slug,
  };

  // TTL: prefer { ttlValue, ttlUnit }; fall back to legacy `ttl` (seconds).
  let ttlSec = 0;
  if (Number.isFinite(body.ttlValue) && body.ttlValue > 0) {
    ttlSec = ttlToSeconds(body.ttlValue, body.ttlUnit || "s");
  } else if (Number.isFinite(body.ttl) && body.ttl > 0) {
    ttlSec = Math.floor(body.ttl);
  }
  if (ttlSec > 0) {
    record.expiresAt = now + Math.max(60, ttlSec) * 1000;
  } else if (Number.isFinite(body.expiresAt) && body.expiresAt > now + 60_000) {
    record.expiresAt = Math.floor(body.expiresAt);
  }
  if (Number.isFinite(body.maxClicks) && body.maxClicks > 0) {
    record.maxClicks = Math.floor(body.maxClicks);
  }
  if (typeof body.password === "string" && body.password.length > 0) {
    record.passwordHash = await sha256Hex(body.password);
  }
  if (typeof body.note === "string" && body.note.length > 0) {
    record.note = body.note.slice(0, 200);
  }

  await putLink(env, host, slug, record);
  await indexLink(env, host, slug, owner);

  const base = publicBaseFromRequest(request, env);
  const shortUrl = renderShortUrl(base, baseDomain, host, slug);
  const editUrl = renderEditUrl(base, baseDomain, host, slug, editToken);
  const payload = {
    ok: true,
    host, slug,
    shortUrl,
    url: dest,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt || null,
    maxClicks: record.maxClicks || null,
    editToken,
    editUrl,
    owner,
  };
  const res = jsonResponse(payload, { status: 201 });
  return setCookie ? withCookies(res, setCookie) : res;
}

function renderShortUrl(baseUrl, baseDomain, host, slug) {
  const u = new URL(baseUrl);
  const port = u.port ? ":" + u.port : "";
  const apex = host && baseDomain ? `${host}.${baseDomain}${port}` : `${u.host}`;
  return slug ? `${u.protocol}//${apex}/${slug}` : `${u.protocol}//${apex}`;
}
function renderEditUrl(baseUrl, baseDomain, host, slug, token) {
  const u = new URL(baseUrl);
  const port = u.port ? ":" + u.port : "";
  const apex = host && baseDomain ? `${host}.${baseDomain}${port}` : `${u.host}`;
  // For path slugs: /<slug>:<token>
  // For host-only links (slug==""): /:<token>
  return `${u.protocol}//${apex}/${slug || ""}:${token}`;
}

// ---------- Owner-scoped (/api/me/...) ----------

async function handleMyList(request, env, identity) {
  const owner = ownerForIdentity(identity);
  if (!owner || owner.kind === "admin") {
    return jsonResponse({ ok: true, items: [], cursor: null, listComplete: true });
  }
  const url = new URL(request.url);
  const data = await listOwnerLinks(env, owner, {
    cursor: url.searchParams.get("cursor"),
    limit: Math.min(Number(url.searchParams.get("limit")) || 100, 200),
  });
  return jsonResponse({ ok: true, ...data });
}

async function handleOwnerGet(request, env, identity, ref) {
  const rec = await getLink(env, ref.host, ref.slug);
  if (!rec) return errorResponse("not found", 404);
  if (!isOwnerOf(identity, rec)) return errorResponse("forbidden", 403);
  const stats = await getStats(env, ref.host, ref.slug);
  return jsonResponse({ ok: true, host: ref.host, slug: ref.slug, ...rec, ...stats });
}

async function handleOwnerPatch(request, env, identity, ref) {
  const rec = await getLink(env, ref.host, ref.slug);
  if (!rec) return errorResponse("not found", 404);
  if (!isOwnerOf(identity, rec)) return errorResponse("forbidden", 403);
  return applyPatch(request, env, ref, rec);
}

async function handleOwnerDelete(request, env, identity, ref) {
  const rec = await getLink(env, ref.host, ref.slug);
  if (!rec) return errorResponse("not found", 404);
  if (!isOwnerOf(identity, rec)) return errorResponse("forbidden", 403);
  await deleteLink(env, ref.host, ref.slug, rec.owner);
  return jsonResponse({ ok: true });
}

// ---------- Admin patch ----------

async function handlePatchAdmin(request, env, ref) {
  const rec = await getLink(env, ref.host, ref.slug);
  if (!rec) return errorResponse("not found", 404);
  return applyPatch(request, env, ref, rec);
}

// ---------- Edit-by-token ----------

async function handleTokenEditGet(request, env, host, slug, token) {
  const rec = await getLink(env, host, slug);
  if (!rec) return htmlResponse(tokenEditPage({ host, slug, link: null, error: "Link not found." }), 404);
  if (!(await verifyEditToken(rec, token))) return htmlResponse(tokenEditPage({ host, slug, link: null, error: "Edit token does not match this slug." }), 401);
  const stats = await getStats(env, host, slug);
  return htmlResponse(tokenEditPage({ host, slug, link: { ...rec, clicks: stats.clicks || 0 } }));
}

async function handleTokenEditPost(request, env, host, slug, token) {
  const rec = await getLink(env, host, slug);
  if (!rec) return htmlResponse(tokenEditPage({ host, slug, link: null, error: "Link not found." }), 404);
  if (!(await verifyEditToken(rec, token))) return htmlResponse(tokenEditPage({ host, slug, link: null, error: "Edit token does not match this slug." }), 401);

  const body = await readForm(request);
  const action = String(body.action || "update");

  if (action === "delete") {
    await deleteLink(env, host, slug, rec.owner);
    return htmlResponse(tokenEditPage({ host, slug, link: null, flash: "Link deleted." }));
  }

  const patch = {};
  if (typeof body.url === "string") patch.url = body.url;
  if (typeof body.expiresAtLocal === "string" && body.expiresAtLocal) {
    const t = Date.parse(body.expiresAtLocal);
    if (!isNaN(t)) patch.expiresAt = t;
  } else if (body.expiresAtLocal === "") {
    patch.expiresAt = null;
  }
  if (typeof body.maxClicks === "string") {
    const n = Number(body.maxClicks);
    patch.maxClicks = n > 0 ? n : null;
  }
  if (typeof body.password === "string" && body.password.length > 0) {
    patch.password = body.password === "-" ? "-" : body.password;
  }
  if (typeof body.note === "string") patch.note = body.note;

  const next = await mergePatch(rec, patch);
  if (next.error) {
    const stats = await getStats(env, host, slug);
    return htmlResponse(tokenEditPage({ host, slug, link: { ...rec, clicks: stats.clicks || 0 }, error: next.error }), 400);
  }
  await putLink(env, host, slug, next.record);
  const stats = await getStats(env, host, slug);
  return htmlResponse(tokenEditPage({ host, slug, link: { ...next.record, clicks: stats.clicks || 0 }, flash: "Saved." }));
}

async function handleTokenApi(request, env, ref) {
  const auth = request.headers.get("authorization") || "";
  const m = auth.match(/^Token\s+([A-Za-z0-9_-]{16,128})$/i);
  if (!m) return errorResponse("missing edit token", 401);
  const token = m[1];
  const rec = await getLink(env, ref.host, ref.slug);
  if (!rec) return errorResponse("not found", 404);
  if (!(await verifyEditToken(rec, token))) return errorResponse("invalid edit token", 401);

  if (request.method === "GET") {
    const stats = await getStats(env, ref.host, ref.slug);
    return jsonResponse({
      ok: true, host: ref.host, slug: ref.slug, url: rec.url,
      expiresAt: rec.expiresAt || null, maxClicks: rec.maxClicks || null,
      note: rec.note || "", clicks: stats.clicks || 0, requiresPassword: !!rec.passwordHash,
    });
  }
  if (request.method === "DELETE") {
    await deleteLink(env, ref.host, ref.slug, rec.owner);
    return jsonResponse({ ok: true });
  }
  if (request.method === "PATCH") return applyPatch(request, env, ref, rec);
  return errorResponse("method not allowed", 405);
}

async function verifyEditToken(rec, token) {
  if (!rec || !rec.editTokenHash || !isValidToken(token)) return false;
  const got = await sha256Hex(token);
  return timingSafeEqual(got, rec.editTokenHash);
}

// ---------- Shared patch logic ----------

async function applyPatch(request, env, ref, current) {
  let body;
  try { body = await request.json(); } catch { return errorResponse("invalid JSON body", 400); }
  const next = await mergePatch(current, body);
  if (next.error) return errorResponse(next.error, 400);
  await putLink(env, ref.host, ref.slug, next.record);
  return jsonResponse({ ok: true, host: ref.host, slug: ref.slug, ...next.record });
}

async function mergePatch(current, body) {
  const next = { ...current };
  if (body.url !== undefined) {
    if (typeof body.url !== "string") return { error: "invalid url" };
    const dest = normalizeUrl(body.url);
    if (!dest) return { error: "invalid destination URL" };
    next.url = dest;
  }
  if (body.expiresAt === null) {
    delete next.expiresAt;
  } else if (Number.isFinite(body.expiresAt)) {
    next.expiresAt = Math.floor(body.expiresAt);
  }
  if (body.maxClicks === null || body.maxClicks === 0) {
    delete next.maxClicks;
  } else if (Number.isFinite(body.maxClicks)) {
    next.maxClicks = Math.floor(body.maxClicks);
  }
  if (body.password !== undefined) {
    if (body.password === "-" || body.password === null) delete next.passwordHash;
    else if (typeof body.password === "string" && body.password.length > 0) {
      next.passwordHash = await sha256Hex(body.password);
    }
  }
  if (typeof body.note === "string") {
    if (body.note.length === 0) delete next.note;
    else next.note = body.note.slice(0, 200);
  } else if (body.note === null) {
    delete next.note;
  }
  return { record: next };
}

// ---------- Slug handlers (preview, redirect, password) ----------

async function handlePreview(request, env, host, slug) {
  const rec = await getLink(env, host, slug);
  if (!rec) return errorResponse("not found", 404);
  const stats = await getStats(env, host, slug);
  return jsonResponse({
    ok: true, host, slug,
    url: rec.url,
    createdAt: rec.createdAt,
    expiresAt: rec.expiresAt || null,
    maxClicks: rec.maxClicks || null,
    requiresPassword: !!rec.passwordHash,
    clicks: stats.clicks || 0,
  });
}

async function handleRedirect(request, env, ctx, host, slug) {
  const rec = await getLink(env, host, slug);
  if (!rec) return notFoundResponse();
  if (rec.expiresAt && rec.expiresAt < Date.now()) {
    ctx.waitUntil(deleteLink(env, host, slug, rec.owner));
    return goneResponse("This link has expired.");
  }
  if (rec.maxClicks) {
    const cur = await getStats(env, host, slug);
    if ((cur.clicks || 0) >= rec.maxClicks) {
      return goneResponse("This link has reached its click limit.");
    }
  }
  if (rec.passwordHash) {
    return new Response(passwordGate(host, slug), { status: 401, headers: HTML_HEADERS });
  }
  ctx.waitUntil(bumpStats(env, host, slug, {
    referer: request.headers.get("referer") || "",
    userAgent: request.headers.get("user-agent") || "",
    country: request.cf?.country || "",
  }));
  return Response.redirect(rec.url, 302);
}

async function handlePasswordSubmit(request, env, ctx, host, slug) {
  const rec = await getLink(env, host, slug);
  if (!rec) return notFoundResponse();
  if (!rec.passwordHash) return Response.redirect(rec.url, 302);

  const body = await readForm(request);
  const provided = String(body.password || "");
  if (!provided) return new Response(passwordGate(host, slug, "Password is required."), { status: 401, headers: HTML_HEADERS });
  const hash = await sha256Hex(provided);
  if (!timingSafeEqual(hash, rec.passwordHash)) {
    return new Response(passwordGate(host, slug, "Incorrect password."), { status: 401, headers: HTML_HEADERS });
  }

  if (rec.expiresAt && rec.expiresAt < Date.now()) {
    ctx.waitUntil(deleteLink(env, host, slug, rec.owner));
    return goneResponse("This link has expired.");
  }
  if (rec.maxClicks) {
    const cur = await getStats(env, host, slug);
    if ((cur.clicks || 0) >= rec.maxClicks) {
      return goneResponse("This link has reached its click limit.");
    }
  }
  ctx.waitUntil(bumpStats(env, host, slug, {
    referer: request.headers.get("referer") || "",
    userAgent: request.headers.get("user-agent") || "",
    country: request.cf?.country || "",
  }));
  return new Response(null, {
    status: 302,
    headers: { ...SECURE_REDIRECT_HEADERS, location: rec.url },
  });
}
