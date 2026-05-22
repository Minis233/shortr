// KV storage helpers.
//
// Schema:
//   link:<slug>    -> JSON LinkRecord (with KV expirationTtl when expires)
//   stats:<slug>   -> JSON StatsRecord (clicks, lastSeenAt, etc.)
//
// LinkRecord {
//   url: string,
//   createdAt: number,        // ms epoch
//   expiresAt?: number,       // ms epoch
//   maxClicks?: number,
//   passwordHash?: string,    // sha256 hex of password
//   note?: string,
//   creatorIp?: string,
// }
//
// StatsRecord {
//   clicks: number,
//   lastSeenAt?: number,
//   lastReferer?: string,
//   lastUserAgent?: string,
//   lastCountry?: string,
// }

const LINK_PREFIX = "link:";
const STATS_PREFIX = "stats:";

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

export async function deleteLink(env, slug) {
  await Promise.all([
    env.LINKS.delete(LINK_PREFIX + slug),
    env.LINKS.delete(STATS_PREFIX + slug),
  ]);
}

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
  // Stats inherit the link's KV TTL implicitly via short retention; we just
  // write without TTL because they tend to be tiny.
  await env.LINKS.put(STATS_PREFIX + slug, JSON.stringify(next));
  return next;
}

export async function listLinks(env, { prefix = "", cursor = null, limit = 50 } = {}) {
  const list = await env.LINKS.list({
    prefix: LINK_PREFIX + prefix,
    cursor: cursor || undefined,
    limit,
  });
  // Fetch records in parallel.
  const records = await Promise.all(
    list.keys.map(async (k) => {
      const slug = k.name.slice(LINK_PREFIX.length);
      const [linkRaw, statsRaw] = await Promise.all([
        env.LINKS.get(k.name),
        env.LINKS.get(STATS_PREFIX + slug),
      ]);
      if (!linkRaw) return null;
      const link = JSON.parse(linkRaw);
      const stats = statsRaw ? JSON.parse(statsRaw) : { clicks: 0 };
      return { slug, ...link, clicks: stats.clicks || 0, lastSeenAt: stats.lastSeenAt };
    }),
  );
  return {
    items: records.filter(Boolean),
    cursor: list.list_complete ? null : list.cursor,
    listComplete: !!list.list_complete,
  };
}
