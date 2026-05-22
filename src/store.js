// KV storage helpers.
//
// Schema:
//   link:<slug>             -> JSON LinkRecord (with KV expirationTtl when expires)
//   stats:<slug>            -> JSON StatsRecord
//   user:<userId>           -> JSON UserRecord (no password value, only PBKDF2 hash)
//   username:<lowercase>    -> userId  (uniqueness lookup)
//   session:<sessionToken>  -> JSON SessionRecord (with TTL)
//   idx:user:<userId>:<slug>-> "1"  (membership for fast listing)
//   idx:anon:<anonId>:<slug>-> "1"
//
// LinkRecord {
//   url, createdAt, expiresAt?, maxClicks?, passwordHash?, note?, creatorIp?,
//   owner: { kind: 'admin'|'user'|'anon', userId?, anonId? },
//   editTokenHash,            // sha256 hex of the 32-char edit token
// }
//
// UserRecord {
//   id, username, usernameLower, passwordHash (pbkdf2 string), createdAt,
// }
//
// SessionRecord {
//   kind: 'admin' | 'user',
//   userId?: string,
//   createdAt: number,
//   expiresAt: number,
// }

const LINK_PREFIX = "link:";
const STATS_PREFIX = "stats:";
const USER_PREFIX = "user:";
const USERNAME_PREFIX = "username:";
const SESSION_PREFIX = "session:";
const IDX_USER_PREFIX = "idx:user:";
const IDX_ANON_PREFIX = "idx:anon:";

// ---------- Links ----------

export async function getLink(env, slug) {
  const raw = await env.LINKS.get(LINK_PREFIX + slug);
  return raw ? JSON.parse(raw) : null;
}

export async function putLink(env, slug, record) {
  const opts = {};
  if (record.expiresAt) {
    const ttl = Math.floor((record.expiresAt - Date.now()) / 1000);
    if (ttl > 60) opts.expirationTtl = ttl;
  }
  await env.LINKS.put(LINK_PREFIX + slug, JSON.stringify(record), opts);
}

export async function deleteLink(env, slug, owner) {
  const tasks = [
    env.LINKS.delete(LINK_PREFIX + slug),
    env.LINKS.delete(STATS_PREFIX + slug),
  ];
  if (owner) {
    if (owner.kind === "user" && owner.userId) {
      tasks.push(env.LINKS.delete(IDX_USER_PREFIX + owner.userId + ":" + slug));
    } else if (owner.kind === "anon" && owner.anonId) {
      tasks.push(env.LINKS.delete(IDX_ANON_PREFIX + owner.anonId + ":" + slug));
    }
  }
  await Promise.all(tasks);
}

export async function indexLink(env, slug, owner) {
  if (!owner) return;
  if (owner.kind === "user" && owner.userId) {
    await env.LINKS.put(IDX_USER_PREFIX + owner.userId + ":" + slug, "1");
  } else if (owner.kind === "anon" && owner.anonId) {
    await env.LINKS.put(IDX_ANON_PREFIX + owner.anonId + ":" + slug, "1");
  }
}

// ---------- Stats ----------

export async function getStats(env, slug) {
  const raw = await env.LINKS.get(STATS_PREFIX + slug);
  return raw ? JSON.parse(raw) : { clicks: 0 };
}

export async function bumpStats(env, slug, info) {
  const cur = await getStats(env, slug);
  const next = {
    clicks: (cur.clicks || 0) + 1,
    lastSeenAt: Date.now(),
    lastReferer: info.referer || cur.lastReferer,
    lastUserAgent: info.userAgent || cur.lastUserAgent,
    lastCountry: info.country || cur.lastCountry,
  };
  await env.LINKS.put(STATS_PREFIX + slug, JSON.stringify(next));
  return next;
}

// ---------- Listing ----------

export async function listAllLinks(env, { prefix = "", cursor = null, limit = 50 } = {}) {
  const list = await env.LINKS.list({
    prefix: LINK_PREFIX + prefix,
    cursor: cursor || undefined,
    limit,
  });
  const records = await Promise.all(
    list.keys.map((k) => loadLinkWithStats(env, k.name.slice(LINK_PREFIX.length))),
  );
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
  const slugs = list.keys.map((k) => k.name.slice(idxPrefix.length));
  const records = await Promise.all(slugs.map((s) => loadLinkWithStats(env, s)));
  // Drop dangling index entries (link expired/deleted).
  const items = [];
  const cleanups = [];
  for (let i = 0; i < records.length; i++) {
    if (records[i]) items.push(records[i]);
    else cleanups.push(env.LINKS.delete(idxPrefix + slugs[i]));
  }
  if (cleanups.length) await Promise.all(cleanups);
  return {
    items,
    cursor: list.list_complete ? null : list.cursor,
    listComplete: !!list.list_complete,
  };
}

async function loadLinkWithStats(env, slug) {
  const [linkRaw, statsRaw] = await Promise.all([
    env.LINKS.get(LINK_PREFIX + slug),
    env.LINKS.get(STATS_PREFIX + slug),
  ]);
  if (!linkRaw) return null;
  const link = JSON.parse(linkRaw);
  const stats = statsRaw ? JSON.parse(statsRaw) : { clicks: 0 };
  return {
    slug,
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
