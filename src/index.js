// shortr — URL shortener on Cloudflare Workers + KV.
//
// Routes:
//   GET  /                     → public landing page
//   POST /api/shorten          → create a link (Bearer or public)
//   GET  /admin                → admin dashboard
//   GET  /api/me               → check admin token
//   GET  /api/list             → list links (admin)
//   GET  /api/links/<slug>     → get link record (admin)
//   PATCH/DELETE /api/links/<slug>
//   GET  /<slug>               → 302 to destination (or password gate)
//   POST /<slug>               → submit password
//   GET  /<slug>+              → preview JSON (clicks etc.)
//   GET  /healthz              → liveness

import {
  getLink,
  putLink,
  deleteLink,
  getStats,
  bumpStats,
  listLinks,
} from "./store.js";
import {
  randomSlug,
  isValidSlug,
  isReservedSlug,
  normalizeUrl,
  sha256Hex,
  timingSafeEqual,
  jsonResponse,
  errorResponse,
  getClientIp,
  publicBaseFromRequest,
} from "./util.js";
import { publicHtml, passwordGateHtml } from "./ui.js";
import { adminHtml } from "./admin-ui.js";

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
      return errorResponse(
        "KV binding LINKS is not configured. Edit wrangler.toml.",
        500,
      );
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // Static / public pages
      if (path === "/" || path === "/index.html") {
        if (request.method !== "GET") return errorResponse("method not allowed", 405);
        return new Response(
          publicHtml({
            allowPublic: env.ALLOW_PUBLIC === "true",
            defaultSlugLength: Number(env.DEFAULT_SLUG_LENGTH) || 6,
            maxUrlLength: Number(env.MAX_URL_LENGTH) || 2048,
          }),
          { headers: HTML_HEADERS },
        );
      }

      if (path === "/admin" || path === "/admin/") {
        if (request.method !== "GET") return errorResponse("method not allowed", 405);
        return new Response(adminHtml(), {
          headers: { ...HTML_HEADERS, "x-robots-tag": "noindex,nofollow" },
        });
      }

      if (path === "/healthz") {
        return jsonResponse({ ok: true, ts: Date.now() });
      }

      if (path === "/robots.txt") {
        return new Response("User-agent: *\nDisallow: /admin\n", {
          headers: { "content-type": "text/plain" },
        });
      }

      // API
      if (path === "/api/shorten" && request.method === "POST") {
        return await handleShorten(request, env);
      }

      if (path === "/api/me" && request.method === "GET") {
        if (!isAdmin(request, env)) return errorResponse("unauthorized", 401);
        return jsonResponse({ ok: true });
      }

      if (path === "/api/list" && request.method === "GET") {
        if (!isAdmin(request, env)) return errorResponse("unauthorized", 401);
        const prefix = url.searchParams.get("prefix") || "";
        const cursor = url.searchParams.get("cursor") || null;
        const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 200);
        const data = await listLinks(env, { prefix, cursor, limit });
        return jsonResponse({ ok: true, ...data });
      }

      const linkApi = path.match(/^\/api\/links\/([^/]+)$/);
      if (linkApi) {
        if (!isAdmin(request, env)) return errorResponse("unauthorized", 401);
        const slug = decodeURIComponent(linkApi[1]);
        if (!isValidSlug(slug)) return errorResponse("invalid slug", 400);
        if (request.method === "GET") {
          const rec = await getLink(env, slug);
          if (!rec) return errorResponse("not found", 404);
          const stats = await getStats(env, slug);
          return jsonResponse({ ok: true, slug, ...rec, ...stats });
        }
        if (request.method === "DELETE") {
          await deleteLink(env, slug);
          return jsonResponse({ ok: true });
        }
        if (request.method === "PATCH") {
          return await handlePatch(request, env, slug);
        }
        return errorResponse("method not allowed", 405);
      }

      // Slug routes
      const slugMatch = path.match(/^\/([^/+]+)(\+)?$/);
      if (slugMatch) {
        const raw = decodeURIComponent(slugMatch[1]);
        const isPreview = slugMatch[2] === "+";
        if (!isValidSlug(raw)) return errorResponse("not found", 404);
        if (isPreview) {
          return await handlePreview(request, env, raw);
        }
        if (request.method === "GET" || request.method === "HEAD") {
          return await handleRedirect(request, env, raw, ctx);
        }
        if (request.method === "POST") {
          return await handlePasswordSubmit(request, env, raw, ctx);
        }
        return errorResponse("method not allowed", 405);
      }

      return errorResponse("not found", 404);
    } catch (err) {
      console.error("unhandled", err);
      return errorResponse("internal error", 500);
    }
  },
};

function isAdmin(request, env) {
  const tok = bearerToken(request);
  if (!tok || !env.ADMIN_TOKEN) return false;
  return timingSafeEqual(tok, env.ADMIN_TOKEN);
}

function isUploader(request, env) {
  const tok = bearerToken(request);
  if (!tok) return false;
  if (env.ADMIN_TOKEN && timingSafeEqual(tok, env.ADMIN_TOKEN)) return true;
  if (env.UPLOAD_TOKEN && timingSafeEqual(tok, env.UPLOAD_TOKEN)) return true;
  return false;
}

function bearerToken(request) {
  const h = request.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

async function handleShorten(request, env) {
  const allowPublic = env.ALLOW_PUBLIC === "true";
  if (!allowPublic && !isUploader(request, env)) {
    return errorResponse("unauthorized", 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse("invalid JSON body", 400);
  }

  const maxLen = Number(env.MAX_URL_LENGTH) || 2048;
  if (typeof body.url !== "string" || body.url.length > maxLen) {
    return errorResponse("url too long or missing", 400);
  }
  const dest = normalizeUrl(body.url);
  if (!dest) return errorResponse("invalid destination URL", 400);

  let slug = body.slug ? String(body.slug).trim() : "";
  if (slug) {
    if (!isValidSlug(slug)) return errorResponse("invalid slug", 400);
    if (isReservedSlug(slug, env.RESERVED_SLUGS || "")) {
      return errorResponse("slug is reserved", 400);
    }
    const exists = await getLink(env, slug);
    if (exists) return errorResponse("slug already taken", 409);
  } else {
    const len = Math.max(
      4,
      Math.min(32, Number(env.DEFAULT_SLUG_LENGTH) || 6),
    );
    // Try a handful of times in the unlikely case of collision.
    for (let i = 0; i < 6; i++) {
      slug = randomSlug(len + Math.floor(i / 2)); // grow length on retries
      if (isReservedSlug(slug, env.RESERVED_SLUGS || "")) continue;
      const exists = await getLink(env, slug);
      if (!exists) break;
      slug = "";
    }
    if (!slug) return errorResponse("could not allocate slug", 500);
  }

  const now = Date.now();
  const record = {
    url: dest,
    createdAt: now,
    creatorIp: getClientIp(request),
  };

  if (Number.isFinite(body.ttl) && body.ttl > 0) {
    const ttlSec = Math.max(60, Math.floor(body.ttl));
    record.expiresAt = now + ttlSec * 1000;
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

  const base = publicBaseFromRequest(request, env);
  return jsonResponse(
    {
      ok: true,
      slug,
      shortUrl: `${base}/${slug}`,
      url: dest,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt || null,
      maxClicks: record.maxClicks || null,
    },
    { status: 201 },
  );
}

async function handlePatch(request, env, slug) {
  const cur = await getLink(env, slug);
  if (!cur) return errorResponse("not found", 404);

  let body;
  try { body = await request.json(); } catch { return errorResponse("invalid JSON body", 400); }

  const next = { ...cur };

  if (typeof body.url === "string") {
    const dest = normalizeUrl(body.url);
    if (!dest) return errorResponse("invalid destination URL", 400);
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
    if (body.password === "" || body.password === null) {
      // empty string = keep existing (no-op handled by frontend);
      // explicit null = remove
      if (body.password === null) delete next.passwordHash;
    } else if (body.password === "-") {
      delete next.passwordHash;
    } else if (typeof body.password === "string") {
      next.passwordHash = await sha256Hex(body.password);
    }
  }

  if (typeof body.note === "string") {
    next.note = body.note.slice(0, 200);
  } else if (body.note === null) {
    delete next.note;
  }

  await putLink(env, slug, next);
  return jsonResponse({ ok: true, slug, ...next });
}

async function handlePreview(request, env, slug) {
  const rec = await getLink(env, slug);
  if (!rec) return errorResponse("not found", 404);
  const stats = await getStats(env, slug);
  // Strip private fields from public preview.
  return jsonResponse({
    ok: true,
    slug,
    url: rec.url,
    createdAt: rec.createdAt,
    expiresAt: rec.expiresAt || null,
    maxClicks: rec.maxClicks || null,
    requiresPassword: !!rec.passwordHash,
    clicks: stats.clicks || 0,
  });
}

async function handleRedirect(request, env, slug, ctx) {
  const rec = await getLink(env, slug);
  if (!rec) return notFoundHtml();

  // Expiry check (defensive even when KV TTL is set).
  if (rec.expiresAt && rec.expiresAt < Date.now()) {
    ctx.waitUntil(deleteLink(env, slug));
    return goneHtml("This link has expired.");
  }

  // Click cap check.
  if (rec.maxClicks) {
    const cur = await getStats(env, slug);
    if ((cur.clicks || 0) >= rec.maxClicks) {
      return goneHtml("This link has reached its click limit.");
    }
  }

  // Password gate: render an interstitial form (cannot transmit a header
  // password on a plain GET in a browser).
  if (rec.passwordHash) {
    return new Response(passwordGateHtml(slug), { status: 401, headers: HTML_HEADERS });
  }

  ctx.waitUntil(
    bumpStats(env, slug, {
      referer: request.headers.get("referer") || "",
      userAgent: request.headers.get("user-agent") || "",
      country: request.cf?.country || "",
    }),
  );

  return Response.redirect(rec.url, 302);
}

async function handlePasswordSubmit(request, env, slug, ctx) {
  const rec = await getLink(env, slug);
  if (!rec) return notFoundHtml();
  if (!rec.passwordHash) return Response.redirect(rec.url, 302);

  const ct = request.headers.get("content-type") || "";
  let provided = "";
  if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
    const form = await request.formData();
    provided = String(form.get("password") || "");
  } else if (ct.includes("application/json")) {
    try {
      const body = await request.json();
      provided = String(body.password || "");
    } catch {}
  }

  if (!provided) {
    return new Response(passwordGateHtml(slug, "Password is required."), { status: 401, headers: HTML_HEADERS });
  }
  const hash = await sha256Hex(provided);
  if (!timingSafeEqual(hash, rec.passwordHash)) {
    return new Response(passwordGateHtml(slug, "Incorrect password."), { status: 401, headers: HTML_HEADERS });
  }

  // Same caps/expiry guards as GET.
  if (rec.expiresAt && rec.expiresAt < Date.now()) {
    ctx.waitUntil(deleteLink(env, slug));
    return goneHtml("This link has expired.");
  }
  if (rec.maxClicks) {
    const cur = await getStats(env, slug);
    if ((cur.clicks || 0) >= rec.maxClicks) {
      return goneHtml("This link has reached its click limit.");
    }
  }

  ctx.waitUntil(
    bumpStats(env, slug, {
      referer: request.headers.get("referer") || "",
      userAgent: request.headers.get("user-agent") || "",
      country: request.cf?.country || "",
    }),
  );

  return new Response(null, {
    status: 302,
    headers: { ...SECURE_REDIRECT_HEADERS, location: rec.url },
  });
}

function notFoundHtml() {
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>Not found</title>
<style>body{font:15px/1.5 system-ui,sans-serif;background:#0b1020;color:#e8ecf7;margin:0;min-height:100vh;display:grid;place-items:center}
@media (prefers-color-scheme: light){body{background:#f7f8fc;color:#1a1f33}}
.box{text-align:center;padding:24px}h1{margin:0 0 6px;font-size:22px}p{margin:0;color:#9aa3bf}</style>
<div class="box"><h1>404 — not found</h1><p>This link does not exist.</p></div>`,
    { status: 404, headers: HTML_HEADERS },
  );
}

function goneHtml(message) {
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>Gone</title>
<style>body{font:15px/1.5 system-ui,sans-serif;background:#0b1020;color:#e8ecf7;margin:0;min-height:100vh;display:grid;place-items:center}
@media (prefers-color-scheme: light){body{background:#f7f8fc;color:#1a1f33}}
.box{text-align:center;padding:24px}h1{margin:0 0 6px;font-size:22px}p{margin:0;color:#9aa3bf}</style>
<div class="box"><h1>410 — gone</h1><p>${message}</p></div>`,
    { status: 410, headers: HTML_HEADERS },
  );
}
