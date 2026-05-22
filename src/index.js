// shortr — URL shortener on Cloudflare Workers + KV.
//
// Routes (host-agnostic, so wildcard *.example.com routes work as-is):
//
//   Public pages
//     GET  /                           public landing
//     GET  /login | /signup            account auth pages
//     POST /api/auth/login             form-encoded login (sets cookie, redirects)
//     POST /api/auth/signup            form-encoded signup (sets cookie, redirects)
//     POST /api/auth/logout            clears session cookie, redirects /
//     GET  /my                         "My links" dashboard (any visitor)
//     GET  /api/me/links[/<slug>]      list / get / patch / delete owned links
//
//   Slug behaviour
//     GET  /<slug>                     302 to destination (or password gate)
//     POST /<slug>                     submit password (or update via JSON body w/ token)
//     GET  /<slug>+                    JSON preview (no redirect)
//     GET  /<slug>:<token>             render edit form for that link
//     POST /<slug>:<token>             apply edit / delete via form
//     PATCH/DELETE /api/edit/<slug>    edit via JSON + Authorization: Token <token>
//
//   Admin
//     GET  /<KV_ID>/<ADMIN_TOKEN>      one-time login URL → sets cookie, redirects /admin
//     GET  /admin                      admin dashboard (cookie session)
//     GET  /api/admin/links[/<slug>]   list / get / patch / delete any link
//
//   Util
//     POST /api/shorten                create a link (any signed-in / anon user)
//     GET  /healthz                    liveness
//     GET  /robots.txt

import {
  getLink, putLink, deleteLink, indexLink,
  getStats, bumpStats,
  listAllLinks, listOwnerLinks,
  getUser, getUserIdByUsername, putUser,
} from "./store.js";
import {
  randomSlug, randomToken, randomId,
  isValidSlug, isReservedSlug, isValidToken, isValidUsername,
  normalizeUrl, sha256Hex, hashPassword, verifyPassword, timingSafeEqual,
  jsonResponse, errorResponse, getClientIp, publicBaseFromRequest,
} from "./util.js";
import {
  readIdentity, ownerForIdentity, startSession, endSession,
  ensureAnonCookie, withCookies,
} from "./auth.js";
import {
  landingPage, authPage, myPage, adminPage, tokenEditPage,
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

  // 1. Health and statics first (these don't need identity).
  if (path === "/healthz") return jsonResponse({ ok: true, ts: Date.now() });
  if (path === "/robots.txt")
    return new Response("User-agent: *\nDisallow: /admin\nDisallow: /my\n", {
      headers: { "content-type": "text/plain" },
    });

  // 2. Admin login URL: /<KV_ID>/<ADMIN_TOKEN>
  const adminLoginPath = adminLoginPathPattern(env);
  if (adminLoginPath && path === adminLoginPath && method === "GET") {
    const { token, cookie } = await startSession(env, "admin");
    void token;
    return new Response(null, {
      status: 303,
      headers: { location: "/admin", "set-cookie": cookie, "cache-control": "no-store" },
    });
  }

  const identity = await readIdentity(request, env);
  const isAdmin = identity.session?.kind === "admin";
  const user = identity.user;

  // 3. Public pages.
  if (path === "/" || path === "/index.html") {
    if (method !== "GET") return errorResponse("method not allowed", 405);
    return htmlResponse(
      landingPage({
        user, isAdmin,
        allowPublic: env.ALLOW_PUBLIC === "true",
        defaultSlugLength: Number(env.DEFAULT_SLUG_LENGTH) || 6,
        maxUrlLength: Number(env.MAX_URL_LENGTH) || 2048,
      }),
    );
  }
  if (path === "/login" && method === "GET") {
    if (user || isAdmin) return redirect(user ? "/my" : "/admin");
    return htmlResponse(authPage({ kind: "login" }));
  }
  if (path === "/signup" && method === "GET") {
    if (user || isAdmin) return redirect("/my");
    return htmlResponse(authPage({ kind: "signup" }));
  }
  if (path === "/my" && method === "GET") {
    if (isAdmin && !user) return redirect("/admin");
    // Anonymous visitors: ensure cookie before rendering.
    let setCookie = null;
    if (!user) {
      const anon = ensureAnonCookie(identity);
      setCookie = anon.setCookie;
      identity.anonId = anon.anonId;
    }
    const res = htmlResponse(myPage({ user, anonId: identity.anonId }));
    return setCookie ? withCookies(res, setCookie) : res;
  }
  if (path === "/admin" && method === "GET") {
    if (!isAdmin) return redirect("/login");
    return htmlResponse(adminPage({ kvId: env.LINKS_NAMESPACE_ID || "(set LINKS_NAMESPACE_ID for admin URL)" }));
  }

  // 4. Auth API (form-encoded for resilience without JS).
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

  // 6. /api/me/links[/<slug>] — owner-scoped.
  if (path === "/api/me/links" && method === "GET") {
    return handleMyList(request, env, identity);
  }
  let m = path.match(/^\/api\/me\/links\/([^/]+)$/);
  if (m) {
    const slug = decodeURIComponent(m[1]);
    if (!isValidSlug(slug)) return errorResponse("invalid slug", 400);
    if (method === "GET")    return handleOwnerGet(request, env, identity, slug);
    if (method === "PATCH")  return handleOwnerPatch(request, env, identity, slug);
    if (method === "DELETE") return handleOwnerDelete(request, env, identity, slug);
    return errorResponse("method not allowed", 405);
  }

  // 7. /api/admin/links[/<slug>] — admin-scoped.
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
    const slug = decodeURIComponent(m[1]);
    if (!isValidSlug(slug)) return errorResponse("invalid slug", 400);
    if (method === "GET") {
      const rec = await getLink(env, slug);
      if (!rec) return errorResponse("not found", 404);
      const stats = await getStats(env, slug);
      return jsonResponse({ ok: true, slug, ...rec, ...stats });
    }
    if (method === "DELETE") {
      const rec = await getLink(env, slug);
      await deleteLink(env, slug, rec?.owner);
      return jsonResponse({ ok: true });
    }
    if (method === "PATCH") {
      return handlePatchAdmin(request, env, slug);
    }
    return errorResponse("method not allowed", 405);
  }

  // 8. /api/edit/<slug> — token-gated edit (no cookie required).
  m = path.match(/^\/api\/edit\/([^/]+)$/);
  if (m) {
    const slug = decodeURIComponent(m[1]);
    if (!isValidSlug(slug)) return errorResponse("invalid slug", 400);
    return handleTokenApi(request, env, slug);
  }

  // 9. Slug routes
  //    /<slug>:<token>           edit form
  //    /<slug>+                  JSON preview
  //    /<slug>                   redirect or password
  m = path.match(/^\/([A-Za-z0-9_-]{1,64}):([A-Za-z0-9_-]{16,128})$/);
  if (m) {
    const slug = m[1];
    const token = m[2];
    if (method === "GET" || method === "HEAD") return handleTokenEditGet(request, env, slug, token);
    if (method === "POST") return handleTokenEditPost(request, env, slug, token);
    return errorResponse("method not allowed", 405);
  }

  m = path.match(/^\/([^/+:]+)(\+)?$/);
  if (m) {
    const slug = decodeURIComponent(m[1]);
    const isPreview = m[2] === "+";
    if (!isValidSlug(slug)) return notFoundResponse();
    if (isPreview) return handlePreview(request, env, slug);
    if (method === "GET" || method === "HEAD") return handleRedirect(request, env, ctx, slug);
    if (method === "POST") return handlePasswordSubmit(request, env, ctx, slug);
    return errorResponse("method not allowed", 405);
  }

  return notFoundResponse();
}

// ---------- Helpers ----------

function htmlResponse(html, status = 200, extra = {}) {
  return new Response(html, { status, headers: { ...HTML_HEADERS, ...extra } });
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

// Determine whether the requesting identity owns this link record.
function isOwnerOf(identity, rec) {
  if (!rec || !rec.owner) return false;
  if (identity.session?.kind === "admin") return true;
  if (rec.owner.kind === "user" && identity.user && rec.owner.userId === identity.user.id) return true;
  if (rec.owner.kind === "anon" && identity.anonId && rec.owner.anonId === identity.anonId) return true;
  return false;
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
  if (!isValidUsername(username)) {
    return htmlResponse(authPage({ kind: "signup", error: "Username must be 3-32 chars: letters, digits, dot, dash, underscore.", username }), 400);
  }
  if (password.length < 6 || password.length > 200) {
    return htmlResponse(authPage({ kind: "signup", error: "Password must be 6-200 characters.", username }), 400);
  }
  const existing = await getUserIdByUsername(env, username);
  if (existing) {
    return htmlResponse(authPage({ kind: "signup", error: "Username already taken.", username }), 409);
  }
  const id = "user_" + randomId();
  const user = {
    id,
    username,
    usernameLower: username.toLowerCase(),
    passwordHash: await hashPassword(password),
    createdAt: Date.now(),
  };
  await putUser(env, user);
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
  // Always run the verifier to avoid timing oracles.
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

  // Make sure anonymous creators have a cookie so they can manage their links.
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

  let slug = body.slug ? String(body.slug).trim() : "";
  if (slug) {
    if (!isValidSlug(slug)) return errorResponse("invalid slug", 400);
    if (isReservedSlug(slug, env.RESERVED_SLUGS || "")) return errorResponse("slug is reserved", 400);
    if (await getLink(env, slug)) return errorResponse("slug already taken", 409);
  } else {
    const len = Math.max(4, Math.min(32, Number(env.DEFAULT_SLUG_LENGTH) || 6));
    for (let i = 0; i < 6; i++) {
      slug = randomSlug(len + Math.floor(i / 2));
      if (isReservedSlug(slug, env.RESERVED_SLUGS || "")) { slug = ""; continue; }
      if (!(await getLink(env, slug))) break;
      slug = "";
    }
    if (!slug) return errorResponse("could not allocate slug", 500);
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
  };

  if (Number.isFinite(body.ttl) && body.ttl > 0) {
    record.expiresAt = now + Math.max(60, Math.floor(body.ttl)) * 1000;
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

  await putLink(env, slug, record);
  await indexLink(env, slug, owner);

  const base = publicBaseFromRequest(request, env);
  const payload = {
    ok: true,
    slug,
    shortUrl: `${base}/${slug}`,
    url: dest,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt || null,
    maxClicks: record.maxClicks || null,
    editToken,
    editUrl: `${base}/${slug}:${editToken}`,
    owner,
  };
  const res = jsonResponse(payload, { status: 201 });
  return setCookie ? withCookies(res, setCookie) : res;
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

async function handleOwnerGet(request, env, identity, slug) {
  const rec = await getLink(env, slug);
  if (!rec) return errorResponse("not found", 404);
  if (!isOwnerOf(identity, rec)) return errorResponse("forbidden", 403);
  const stats = await getStats(env, slug);
  return jsonResponse({ ok: true, slug, ...rec, ...stats });
}

async function handleOwnerPatch(request, env, identity, slug) {
  const rec = await getLink(env, slug);
  if (!rec) return errorResponse("not found", 404);
  if (!isOwnerOf(identity, rec)) return errorResponse("forbidden", 403);
  return applyPatch(request, env, slug, rec);
}

async function handleOwnerDelete(request, env, identity, slug) {
  const rec = await getLink(env, slug);
  if (!rec) return errorResponse("not found", 404);
  if (!isOwnerOf(identity, rec)) return errorResponse("forbidden", 403);
  await deleteLink(env, slug, rec.owner);
  return jsonResponse({ ok: true });
}

// ---------- Admin ----------

async function handlePatchAdmin(request, env, slug) {
  const rec = await getLink(env, slug);
  if (!rec) return errorResponse("not found", 404);
  return applyPatch(request, env, slug, rec);
}

// ---------- Edit-by-token (HTML page + form) ----------

async function handleTokenEditGet(request, env, slug, token) {
  const rec = await getLink(env, slug);
  if (!rec) return htmlResponse(tokenEditPage({ slug, link: null, error: "Link not found." }), 404);
  const ok = await verifyEditToken(rec, token);
  if (!ok) return htmlResponse(tokenEditPage({ slug, link: null, error: "Edit token does not match this slug." }), 401);
  const stats = await getStats(env, slug);
  return htmlResponse(tokenEditPage({ slug, link: { ...rec, clicks: stats.clicks || 0 } }));
}

async function handleTokenEditPost(request, env, slug, token) {
  const rec = await getLink(env, slug);
  if (!rec) return htmlResponse(tokenEditPage({ slug, link: null, error: "Link not found." }), 404);
  const ok = await verifyEditToken(rec, token);
  if (!ok) return htmlResponse(tokenEditPage({ slug, link: null, error: "Edit token does not match this slug." }), 401);

  const body = await readForm(request);
  const action = String(body.action || "update");

  if (action === "delete") {
    await deleteLink(env, slug, rec.owner);
    return htmlResponse(tokenEditPage({ slug, link: null, flash: "Link deleted." }));
  }

  // Build a JSON-shaped patch from the form input.
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
    const stats = await getStats(env, slug);
    return htmlResponse(tokenEditPage({ slug, link: { ...rec, clicks: stats.clicks || 0 }, error: next.error }), 400);
  }
  await putLink(env, slug, next.record);
  const stats = await getStats(env, slug);
  return htmlResponse(tokenEditPage({ slug, link: { ...next.record, clicks: stats.clicks || 0 }, flash: "Saved." }));
}

async function handleTokenApi(request, env, slug) {
  // Authorization: Token <editToken>
  const auth = request.headers.get("authorization") || "";
  const m = auth.match(/^Token\s+([A-Za-z0-9_-]{16,128})$/i);
  if (!m) return errorResponse("missing edit token", 401);
  const token = m[1];
  const rec = await getLink(env, slug);
  if (!rec) return errorResponse("not found", 404);
  if (!(await verifyEditToken(rec, token))) return errorResponse("invalid edit token", 401);

  if (request.method === "GET") {
    const stats = await getStats(env, slug);
    return jsonResponse({ ok: true, slug, url: rec.url, expiresAt: rec.expiresAt || null, maxClicks: rec.maxClicks || null, note: rec.note || "", clicks: stats.clicks || 0, requiresPassword: !!rec.passwordHash });
  }
  if (request.method === "DELETE") {
    await deleteLink(env, slug, rec.owner);
    return jsonResponse({ ok: true });
  }
  if (request.method === "PATCH") {
    return applyPatch(request, env, slug, rec);
  }
  return errorResponse("method not allowed", 405);
}

async function verifyEditToken(rec, token) {
  if (!rec || !rec.editTokenHash || !isValidToken(token)) return false;
  const got = await sha256Hex(token);
  return timingSafeEqual(got, rec.editTokenHash);
}

// ---------- Shared patch logic ----------

async function applyPatch(request, env, slug, current) {
  let body;
  try { body = await request.json(); } catch { return errorResponse("invalid JSON body", 400); }
  const next = await mergePatch(current, body);
  if (next.error) return errorResponse(next.error, 400);
  await putLink(env, slug, next.record);
  return jsonResponse({ ok: true, slug, ...next.record });
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
    // empty string = keep existing
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

async function handlePreview(request, env, slug) {
  const rec = await getLink(env, slug);
  if (!rec) return errorResponse("not found", 404);
  const stats = await getStats(env, slug);
  return jsonResponse({
    ok: true, slug,
    url: rec.url,
    createdAt: rec.createdAt,
    expiresAt: rec.expiresAt || null,
    maxClicks: rec.maxClicks || null,
    requiresPassword: !!rec.passwordHash,
    clicks: stats.clicks || 0,
  });
}

async function handleRedirect(request, env, ctx, slug) {
  const rec = await getLink(env, slug);
  if (!rec) return notFoundResponse();
  if (rec.expiresAt && rec.expiresAt < Date.now()) {
    ctx.waitUntil(deleteLink(env, slug, rec.owner));
    return goneResponse("This link has expired.");
  }
  if (rec.maxClicks) {
    const cur = await getStats(env, slug);
    if ((cur.clicks || 0) >= rec.maxClicks) {
      return goneResponse("This link has reached its click limit.");
    }
  }
  if (rec.passwordHash) {
    return new Response(passwordGate(slug), { status: 401, headers: HTML_HEADERS });
  }
  ctx.waitUntil(bumpStats(env, slug, {
    referer: request.headers.get("referer") || "",
    userAgent: request.headers.get("user-agent") || "",
    country: request.cf?.country || "",
  }));
  return Response.redirect(rec.url, 302);
}

async function handlePasswordSubmit(request, env, ctx, slug) {
  const rec = await getLink(env, slug);
  if (!rec) return notFoundResponse();
  if (!rec.passwordHash) return Response.redirect(rec.url, 302);

  const body = await readForm(request);
  const provided = String(body.password || "");
  if (!provided) return new Response(passwordGate(slug, "Password is required."), { status: 401, headers: HTML_HEADERS });
  const hash = await sha256Hex(provided);
  if (!timingSafeEqual(hash, rec.passwordHash)) {
    return new Response(passwordGate(slug, "Incorrect password."), { status: 401, headers: HTML_HEADERS });
  }

  if (rec.expiresAt && rec.expiresAt < Date.now()) {
    ctx.waitUntil(deleteLink(env, slug, rec.owner));
    return goneResponse("This link has expired.");
  }
  if (rec.maxClicks) {
    const cur = await getStats(env, slug);
    if ((cur.clicks || 0) >= rec.maxClicks) {
      return goneResponse("This link has reached its click limit.");
    }
  }
  ctx.waitUntil(bumpStats(env, slug, {
    referer: request.headers.get("referer") || "",
    userAgent: request.headers.get("user-agent") || "",
    country: request.cf?.country || "",
  }));
  return new Response(null, {
    status: 302,
    headers: { ...SECURE_REDIRECT_HEADERS, location: rec.url },
  });
}
