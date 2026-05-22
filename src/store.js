// KV storage helpers.
//
// Schema:
//   link:<host>:<slug>      -> JSON LinkRecord (with KV expirationTtl when expires)
//                              <host> is the host-prefix (subdomain) WITHOUT the BASE_DOMAIN,
//                              or "" for the apex/default host. Always lowercase ASCII.
//   stats:<host>:<slug>     -> JSON StatsRecord
//   user:<userId>           -> JSON UserRecord
//   username:<lowercase>    -> userId
//   session:<sessionToken>  -> JSON SessionRecord (with TTL)
//   idx:user:<userId>:<host>:<slug>   -> "1"
//   idx:anon:<anonId>:<host>:<slug>   -> "1"
//   idx:host:<host>:<slug>            -> "1"  (admin can list all hosts in one place)
//
// LinkRecord {
//   url, createdAt, expiresAt?, maxClicks?, passwordHash?, note?, creatorIp?,
//   host,                        // "" or e.g. "my", lowercase
//   slug,                        // path slug, may be "" when host-only
//   owner: { kind, userId?, anonId? },
//   editTokenHash,
// }

const LINK_PREFIX = "link:";
const STATS_PREFIX = "stats:";
const USER_PREFIX = "user:";
const USERNAME_PREFIX = "username:";
const SESSION_PREFIX = "session:";
const IDX_USER_PREFIX = "idx:user:";
const IDX_ANON_PREFIX = "idx:anon:";
const IDX_HOST_PREFIX = "idx:host:";

function linkKey(host, slug) { return LINK_PREFIX + (host || "") + ":" + (slug || ""); }
function statsKey(host, slug) { return STATS_PREFIX + (host || "") + ":" + (slug || ""); }

// ---------- Links ----------

export async function getLink(env, host, slug) {
  const raw = await env.LINKS.get(linkKey(host, slug));
  return raw ? JSON.parse(raw) : null;
}

export async function putLink(env, host, slug, record) {
  const opts = {};
  if (record.expiresAt) {
    const ttl = Math.floor((record.expiresAt - Date.now()) / 1000);
    if (ttl > 60) opts.expirationTtl = ttl;
  }
  await env.LINKS.put(linkKey(host, slug), JSON.stringify(record), opts);
}

export async function deleteLink(env, host, slug, owner) {
  const tasks = [
    env.LINKS.delete(linkKey(host, slug)),
    env.LINKS.delete(statsKey(host, slug)),
    env.LINKS.delete(IDX_HOST_PREFIX + (host || "") + ":" + (slug || "")),
  ];
  if (owner) {
    if (owner.kind === "user" && owner.userId) {
      tasks.push(env.LINKS.delete(IDX_USER_PREFIX + owner.userId + ":" + (host || "") + ":" + (slug || "")));
    } else if (owner.kind === "anon" && owner.anonId) {
      tasks.push(env.LINKS.delete(IDX_ANON_PREFIX + owner.anonId + ":" + (host || "") + ":" + (slug || "")));
    }
  }
  await Promise.all(tasks);
}

export async function indexLink(env, host, slug, owner) {
  const hs = (host || "") + ":" + (slug || "");
  const tasks = [env.LINKS.put(IDX_HOST_PREFIX + hs, "1")];
  if (owner) {
    if (owner.kind === "user" && owner.userId) {
      tasks.push(env.LINKS.put(IDX_USER_PREFIX + owner.userId + ":" + hs, "1"));
    } else if (owner.kind === "anon" && owner.anonId) {
      tasks.push(env.LINKS.put(IDX_ANON_PREFIX + owner.anonId + ":" + hs, "1"));
    }
  }
  await Promise.all(tasks);
}

// ---------- Stats ----------

export async function getStats(env, host, slug) {
  const raw = await env.LINKS.get(statsKey(host, slug));
  return raw ? JSON.parse(raw) : { clicks: 0 };
}

export async function bumpStats(env, host, slug, info) {
  const cur = await getStats(env, host, slug);
  const next = {
    clicks: (cur.clicks || 0) + 1,
    lastSeenAt: Date.now(),
    lastReferer: info.referer || cur.lastReferer,
    lastUserAgent: info.userAgent || cur.lastUserAgent,
    lastCountry: info.country || cur.lastCountry,
  };
  await env.LINKS.put(statsKey(host, slug), JSON.stringify(next));
  return next;
}

// ---------- Listing ----------

export async function listAllLinks(env, { prefix = "", cursor = null, limit = 50 } = {}) {
  // prefix searches by slug across all hosts via the IDX_HOST index.
  const list = await env.LINKS.list({
    prefix: IDX_HOST_PREFIX,
    cursor: cursor || undefined,
    limit: Math.min(limit * 4, 1000),
  });
  const candidates = [];
  for (const k of list.keys) {
    const id = k.name.slice(IDX_HOST_PREFIX.length);
    const sep = id.indexOf(":");
    if (sep < 0) continue;
    const host = id.slice(0, sep);
    const slug = id.slice(sep + 1);
    if (prefix && !slug.startsWith(prefix) && !host.startsWith(prefix)) continue;
    candidates.push({ host, slug });
    if (candidates.length >= limit) break;
  }
  const records = await Promise.all(candidates.map((c) => loadLinkWithStats(env, c.host, c.slug)));
  return {
    items: records.filter(Boolean),
    cursor: list.list_complete ? null : list.cursor,
    listComplete: !!list.list_complete,
  };
}

export async function listOwnerLinks(env, owner, { cursor = null, limit = 100 } = {}) {
  if (!owner) return { items: [], cursor: null, listComplete: true };
  const idxPrefix =
    owner.kind === "user" && owner.userId
      ? IDX_USER_PREFIX + owner.userId + ":"
      : owner.kind === "anon" && owner.anonId
      ? IDX_ANON_PREFIX + owner.anonId + ":"
      : null;
  if (!idxPrefix) return { items: [], cursor: null, listComplete: true };

  const list = await env.LINKS.list({ prefix: idxPrefix, cursor: cursor || undefined, limit });
  const refs = list.keys.map((k) => {
    const tail = k.name.slice(idxPrefix.length);
    const sep = tail.indexOf(":");
    if (sep < 0) return null;
    return { host: tail.slice(0, sep), slug: tail.slice(sep + 1) };
  }).filter(Boolean);
  const records = await Promise.all(refs.map((r) => loadLinkWithStats(env, r.host, r.slug)));
  const items = [];
  const cleanups = [];
  for (let i = 0; i < records.length; i++) {
    if (records[i]) items.push(records[i]);
    else cleanups.push(env.LINKS.delete(idxPrefix + (refs[i].host || "") + ":" + (refs[i].slug || "")));
  }
  if (cleanups.length) await Promise.all(cleanups);
  return {
    items,
    cursor: list.list_complete ? null : list.cursor,
    listComplete: !!list.list_complete,
  };
}

async function loadLinkWithStats(env, host, slug) {
  const [linkRaw, statsRaw] = await Promise.all([
    env.LINKS.get(linkKey(host, slug)),
    env.LINKS.get(statsKey(host, slug)),
  ]);
  if (!linkRaw) return null;
  const link = JSON.parse(linkRaw);
  const stats = statsRaw ? JSON.parse(statsRaw) : { clicks: 0 };
  return {
    host: link.host || "",
    slug: link.slug || "",
    ...link,
    clicks: stats.clicks || 0,
    lastSeenAt: stats.lastSeenAt,
  };
}

// ---------- Users ----------

export async function getUser(env, userId) {
  if (!userId) return null;
  const raw = await env.LINKS.get(USER_PREFIX + userId);
  return raw ? JSON.parse(raw) : null;
}

export async function getUserIdByUsername(env, username) {
  if (!username) return null;
  return await env.LINKS.get(USERNAME_PREFIX + username.toLowerCase());
}

export async function putUser(env, user) {
  await env.LINKS.put(USER_PREFIX + user.id, JSON.stringify(user));
  await env.LINKS.put(USERNAME_PREFIX + user.usernameLower, user.id);
}

// ---------- Sessions ----------

export async function getSession(env, token) {
  if (!token) return null;
  const raw = await env.LINKS.get(SESSION_PREFIX + token);
  if (!raw) return null;
  const sess = JSON.parse(raw);
  if (sess.expiresAt && sess.expiresAt < Date.now()) {
    await env.LINKS.delete(SESSION_PREFIX + token);
    return null;
  }
  return sess;
}

export async function putSession(env, token, session, ttlSeconds) {
  await env.LINKS.put(SESSION_PREFIX + token, JSON.stringify(session), {
    expirationTtl: Math.max(60, Math.floor(ttlSeconds)),
  });
}

export async function deleteSession(env, token) {
  if (!token) return;
  await env.LINKS.delete(SESSION_PREFIX + token);
}
