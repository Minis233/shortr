// Slug generation, URL validation, and small utilities.

const SLUG_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
// Removed: 0/O/o, 1/I/l — easier to read aloud and type.

export function randomSlug(length = 6) {
  const buf = new Uint8Array(length);
  crypto.getRandomValues(buf);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += SLUG_ALPHABET[buf[i] % SLUG_ALPHABET.length];
  }
  return out;
}

const SLUG_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function isValidSlug(slug) {
  return typeof slug === "string" && SLUG_RE.test(slug);
}

export function isReservedSlug(slug, reservedCsv = "") {
  const reserved = new Set(
    reservedCsv
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  return reserved.has(slug.toLowerCase());
}

export function normalizeUrl(input) {
  if (typeof input !== "string") return null;
  let s = input.trim();
  if (!s) return null;
  // If no scheme, default to https://
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s)) {
    s = "https://" + s;
  }
  let u;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  // Only http(s) destinations are allowed. javascript:, data:, file:, etc. are rejected.
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (!u.hostname || u.hostname.length < 3) return null;
  return u.toString();
}

export async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", data);
  const arr = new Uint8Array(buf);
  let hex = "";
  for (let i = 0; i < arr.length; i++) {
    hex += arr[i].toString(16).padStart(2, "0");
  }
  return hex;
}

export function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function jsonResponse(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init.headers || {}),
    },
  });
}

export function errorResponse(message, status = 400) {
  return jsonResponse({ ok: false, error: message }, { status });
}

export function getClientIp(request) {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

export function publicBaseFromRequest(request, env) {
  if (env.PUBLIC_BASE) return env.PUBLIC_BASE.replace(/\/$/, "");
  const u = new URL(request.url);
  return `${u.protocol}//${u.host}`;
}
