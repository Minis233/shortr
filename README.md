# shortr

A minimal, fast URL shortener that runs entirely on Cloudflare Workers + Workers KV. No server, no database, no daemons — just one Worker, one KV namespace, and a couple of secrets.

- ⚡ Edge-routed redirects with KV reads
- 🪪 Custom slugs, auto-generated slugs (Crockford-ish alphabet, no `0/O/1/l`)
- ⏳ Optional TTL expiry (KV `expirationTtl`) and click caps
- 🔒 Optional per-link passwords (SHA-256 hashed) with an interstitial form
- 📊 Click counters, last-seen referrer/UA/country
- 🧰 Built-in admin dashboard (`/admin`) + JSON API
- 🧱 Public form on `/` with the same form gated by an upload token when `ALLOW_PUBLIC=false`
- 0 npm dependencies in the Worker bundle (only `wrangler` as a devDep)

## Live demo

The reference deployment lives at the URL printed by `wrangler deploy`. There is no shared public instance — everyone runs their own.

## Quick start

You will need a Cloudflare account and the `wrangler` CLI (Node 18+).

```bash
git clone https://github.com/Minis233/shortr.git
cd shortr
npm install

# 1. Create a KV namespace and copy the printed id into wrangler.toml
npx wrangler kv namespace create LINKS

# 2. Set secrets
#    ADMIN_TOKEN gates /admin and the management API.
#    UPLOAD_TOKEN (optional) lets non-admin clients call /api/shorten.
npx wrangler secret put ADMIN_TOKEN
npx wrangler secret put UPLOAD_TOKEN   # optional

# 3. Deploy
npx wrangler deploy
```

Open the printed `https://shortr.<your-subdomain>.workers.dev/` to use the public form, or `/admin` to manage links.

## Configuration

`wrangler.toml` exposes a few `[vars]` you can edit:

| Var | Default | Meaning |
| --- | --- | --- |
| `PUBLIC_BASE` | `""` | Override the base URL printed by the API. Useful when you bind a custom domain. |
| `RESERVED_SLUGS` | `api,admin,login,...` | Slugs that cannot be assigned. |
| `DEFAULT_SLUG_LENGTH` | `6` | Length of auto-generated slugs (clamped to 4..32). |
| `MAX_URL_LENGTH` | `2048` | Reject destinations longer than this many characters. |
| `ALLOW_PUBLIC` | `false` | When `true`, anyone can call `POST /api/shorten` without a token. |

Secrets (`wrangler secret put ...`):

| Secret | Required | Meaning |
| --- | --- | --- |
| `ADMIN_TOKEN` | yes | Bearer token for `/admin` UI and `/api/list`, `/api/links/<slug>`. |
| `UPLOAD_TOKEN` | no | Bearer token that can call `POST /api/shorten` without admin rights. Defaults to `ADMIN_TOKEN` when unset. |

## API

All JSON. Authentication is `Authorization: Bearer <TOKEN>` unless noted.

### `POST /api/shorten`

Create a short link. Requires `UPLOAD_TOKEN` or `ADMIN_TOKEN` (or `ALLOW_PUBLIC=true`).

```json
{
  "url": "https://example.com/long/path",
  "slug": "blog-2026",        // optional, must match [A-Za-z0-9_-]{1,64}
  "ttl": 3600,                // optional, seconds (min 60)
  "maxClicks": 100,           // optional
  "password": "hunter2",      // optional; users see an interstitial form
  "note": "Q1 newsletter"     // optional, private label visible in /admin
}
```

Response:

```json
{
  "ok": true,
  "slug": "blog-2026",
  "shortUrl": "https://shortr.example.workers.dev/blog-2026",
  "url": "https://example.com/long/path",
  "createdAt": 1747900000000,
  "expiresAt": 1747903600000,
  "maxClicks": 100
}
```

### `GET /<slug>`

Issues a `302` to the destination. If the link has a password, returns an HTML form (status `401`) that submits via `POST /<slug>` with `password=...`.

### `GET /<slug>+`

Returns metadata for the slug without redirecting:

```json
{ "ok": true, "slug": "blog-2026", "url": "https://...", "clicks": 42,
  "expiresAt": null, "maxClicks": null, "requiresPassword": false }
```

### `GET /api/list?prefix=&cursor=&limit=`

Admin only. Paginated list of links with click counts.

### `GET /api/links/<slug>`

Admin only. Full record including `passwordHash` presence and `lastSeenAt`.

### `PATCH /api/links/<slug>`

Admin only. Update any of `url`, `expiresAt`, `maxClicks`, `password`, `note`.

- `expiresAt: null` → never expires
- `maxClicks: null` or `0` → unlimited
- `password: "-"` → remove password
- `password: "newpass"` → set/replace password (hashed before storage)

### `DELETE /api/links/<slug>`

Admin only. Drops the link record and its stats.

### `GET /healthz`

Liveness probe. Returns `{"ok":true,"ts":...}`.

## Custom domain

Bind a domain by adding a route to `wrangler.toml`:

```toml
[[routes]]
pattern = "s.example.com"
custom_domain = true
```

Then `npx wrangler deploy`. Cloudflare creates the DNS record and SSL certificate automatically (the zone must be in the same account).

## Security notes

- Passwords are stored as SHA-256 hashes and compared with a constant-time check. They are not encrypted at rest beyond Cloudflare KV's defaults.
- `creatorIp` is recorded for auditing in the admin view. Drop it if your jurisdiction prefers — it's a single field in `src/index.js`.
- Open redirects: any HTTP/HTTPS destination is permitted by design. If you need allow-listing, edit `normalizeUrl` in `src/util.js`.
- The admin token rides in `Authorization` headers and `localStorage`. Use a long random secret (e.g. `openssl rand -hex 32`) and rotate via `wrangler secret put` when needed.

## Development

```bash
npx wrangler dev     # local dev server with KV preview
npx wrangler tail    # live logs from production
```

The Worker is split into:

- `src/index.js` — router, request handlers, redirect logic
- `src/store.js` — KV schema + read/write helpers
- `src/util.js` — slug RNG, URL normalisation, hashing
- `src/ui.js` — public landing page + password gate
- `src/admin-ui.js` — `/admin` dashboard

There are no build steps — `wrangler` bundles ES modules directly.

## License

MIT — see [LICENSE](LICENSE).
