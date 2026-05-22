// Slug generation, URL validation, password hashing, sessions, and small utilities.

const SLUG_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
// Removed: 0/O/o, 1/I/l — easier to read aloud and type.

// Used for tokens (edit token, session token, user/anon ids). 64 chars ≈ 6 bits/char.
const TOKEN_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function randomFromAlphabet(alphabet, length) {
  const buf = new Uint8Array(length);
  crypto.getRandomValues(buf);
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[buf[i] % alphabet.length];
  return out;
}

export function randomSlug(length = 6) {
  return randomFromAlphabet(SLUG_ALPHABET, length);
}

export function randomToken(length = 32) {
  return randomFromAlphabet(TOKEN_ALPHABET, length);
}

export function randomId() {
  return randomFromAlphabet(TOKEN_ALPHABET, 16);
}

const SLUG_RE = /^[A-Za-z0-9_-]{1,64}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/;

export function isValidSlug(slug) {
  return typeof slug === "string" && SLUG_RE.test(slug);
}

export function isValidToken(token) {
  return typeof token === "string" && TOKEN_RE.test(token);
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

const USERNAME_RE = /^[a-zA-Z0-9._-]{3,32}$/;

export function isValidUsername(u) {
  return typeof u === "string" && USERNAME_RE.test(u);
}

export function normalizeUrl(input) {
  if (typeof input !== "string") return null;
  let s = input.trim();
  if (!s) return null;
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s)) s = "https://" + s;
  let u;
  try { u = new URL(s); } catch { return null; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (!u.hostname || u.hostname.length < 3) return null;
  return u.toString();
}

export async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", data);
  const arr = new Uint8Array(buf);
  let hex = "";
  for (let i = 0; i < arr.length; i++) hex += arr[i].toString(16).padStart(2, "0");
  return hex;
}

// PBKDF2-SHA256 password hashing for user accounts. Format:
//   pbkdf2$<iterations>$<saltB64>$<hashB64>
// Note: Cloudflare Workers caps PBKDF2 iterations at 100000.
const PBKDF2_ITER = 100000;
const PBKDF2_HASHLEN = 32;

export async function hashPassword(password) {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const hash = await pbkdf2(password, salt, PBKDF2_ITER, PBKDF2_HASHLEN);
  return `pbkdf2$${PBKDF2_ITER}$${b64(salt)}$${b64(hash)}`;
}

export async function verifyPassword(password, stored) {
  if (typeof stored !== "string" || !stored.startsWith("pbkdf2$")) return false;
  const parts = stored.split("$");
  if (parts.length !== 4) return false;
  const iter = parseInt(parts[1], 10);
  const salt = b64decode(parts[2]);
  const expected = b64decode(parts[3]);
  if (!iter || !salt || !expected) return false;
  const got = await pbkdf2(password, salt, iter, expected.length);
  return constantTimeBytesEqual(got, expected);
}

async function pbkdf2(password, salt, iterations, byteLen) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    key,
    byteLen * 8,
  );
  return new Uint8Array(bits);
}

function b64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function b64decode(s) {
  try {
    const norm = s.replace(/-/g, "+").replace(/_/g, "/");
    const pad = norm.length % 4 === 0 ? norm : norm + "=".repeat(4 - (norm.length % 4));
    const bin = atob(pad);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch { return null; }
}

function constantTimeBytesEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---------- HTTP helpers ----------

export function jsonResponse(data, init = {}) {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    ...(init.headers || {}),
  };
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function errorResponse(message, status = 400, extra = {}) {
  return jsonResponse({ ok: false, error: message, ...extra }, { status });
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

// ---------- Cookies ----------

export function parseCookies(request) {
  const out = {};
  const header = request.headers.get("cookie");
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (!k) continue;
    try { out[k] = decodeURIComponent(v); } catch { out[k] = v; }
  }
  return out;
}

export function buildCookie(name, value, opts = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push("Path=" + (opts.path || "/"));
  if (opts.maxAge !== undefined) parts.push("Max-Age=" + Math.floor(opts.maxAge));
  if (opts.expires) parts.push("Expires=" + opts.expires.toUTCString());
  parts.push("SameSite=" + (opts.sameSite || "Lax"));
  if (opts.httpOnly !== false) parts.push("HttpOnly");
  if (opts.secure !== false) parts.push("Secure");
  return parts.join("; ");
}

export function clearCookie(name, opts = {}) {
  return buildCookie(name, "", { ...opts, maxAge: 0 });
}
