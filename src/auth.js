// Authentication helpers: session cookies, anon cookies, and request → identity.

import { parseCookies, buildCookie, clearCookie, randomToken, randomId, isValidToken } from "./util.js";
import { getSession, putSession, deleteSession, getUser } from "./store.js";

export const SESSION_COOKIE = "shortr_sid";
export const ANON_COOKIE = "shortr_anon";

export const SESSION_TTL = 60 * 60 * 24 * 30; // 30 days
const ANON_TTL = 60 * 60 * 24 * 365; // 1 year

// Read identity for the current request without modifying KV.
export async function readIdentity(request, env) {
  const cookies = parseCookies(request);
  let session = null;
  let user = null;
  if (cookies[SESSION_COOKIE]) {
    session = await getSession(env, cookies[SESSION_COOKIE]);
    if (session?.kind === "user" && session.userId) {
      user = await getUser(env, session.userId);
    }
  }
  return {
    session,
    user,
    anonId: cookies[ANON_COOKIE] || null,
    cookies,
  };
}

// Compute the owner descriptor used on link records.
export function ownerForIdentity(identity) {
  if (identity.session?.kind === "admin") {
    return { kind: "admin" };
  }
  if (identity.session?.kind === "user" && identity.user) {
    return { kind: "user", userId: identity.user.id };
  }
  if (identity.anonId) {
    return { kind: "anon", anonId: identity.anonId };
  }
  return null;
}

// Issue a session cookie (admin or user).
export async function startSession(env, kind, { userId } = {}) {
  const token = randomToken(48);
  const now = Date.now();
  const session = {
    kind,
    userId,
    createdAt: now,
    expiresAt: now + SESSION_TTL * 1000,
  };
  await putSession(env, token, session, SESSION_TTL);
  return {
    token,
    cookie: buildCookie(SESSION_COOKIE, token, {
      maxAge: SESSION_TTL,
      sameSite: "Lax",
      httpOnly: true,
      secure: true,
    }),
  };
}

export async function endSession(env, request) {
  const cookies = parseCookies(request);
  const tok = cookies[SESSION_COOKIE];
  if (tok) await deleteSession(env, tok);
  return clearCookie(SESSION_COOKIE);
}

// Ensure an anonymous identity cookie exists. Returns a Set-Cookie header
// to apply when the cookie is freshly minted, or null when one was already
// present.
export function ensureAnonCookie(identity) {
  if (identity.anonId && isValidToken(identity.anonId)) {
    return { anonId: identity.anonId, setCookie: null };
  }
  const id = "anon_" + randomId();
  const cookie = buildCookie(ANON_COOKIE, id, {
    maxAge: ANON_TTL,
    sameSite: "Lax",
    httpOnly: false, // readable by client JS so the dashboard can show "your" links
    secure: true,
  });
  return { anonId: id, setCookie: cookie };
}

export function appendCookie(headers, cookieValue) {
  if (!cookieValue) return headers;
  // Headers.append supports multiple Set-Cookie.
  if (headers instanceof Headers) {
    headers.append("set-cookie", cookieValue);
    return headers;
  }
  const existing = headers["set-cookie"];
  if (Array.isArray(existing)) headers["set-cookie"] = [...existing, cookieValue];
  else if (existing) headers["set-cookie"] = [existing, cookieValue];
  else headers["set-cookie"] = cookieValue;
  return headers;
}

// Wrap a Response with extra Set-Cookie headers.
export function withCookies(response, cookies) {
  const list = (Array.isArray(cookies) ? cookies : [cookies]).filter(Boolean);
  if (!list.length) return response;
  const h = new Headers(response.headers);
  for (const c of list) h.append("set-cookie", c);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: h,
  });
}
