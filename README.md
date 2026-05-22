# shortr

A minimal, fast URL shortener that runs entirely on Cloudflare Workers + Workers KV. No external server, no database, no daemons. One Worker, one KV namespace, two secrets.

- Custom domain wildcards: bind `*.example.com/*`, `example.com/*`, or any single-host route
- Three account modes: admin, registered users, anonymous (cookie-tracked)
- Per-link 32-character edit token — share to delegate management without sharing your account
- Custom slugs, auto-generated slugs (no `0/O/1/l`), TTL expiry, click caps, password-protected redirects
- Built-in admin dashboard at `/<KV_ID>/<ADMIN_TOKEN>` — bookmark the URL, open it from any device, get an HTTP-only session cookie
- "My links" dashboard for everyone, including anonymous visitors (cached locally + cookie-bound)
- Click counters with last-seen referer/UA/country
- 0 runtime dependencies (only `wrangler` as a devDep)

## Deployment

You'll need a Cloudflare account and Node 18+.

```bash
git clone https://github.com/Minis233/shortr.git
cd shortr
npm install

# 1. Create a KV namespace and copy the printed id into wrangler.toml.
#    Set the SAME id under [vars] LINKS_NAMESPACE_ID — the admin login URL
#    is /<LINKS_NAMESPACE_ID>/<ADMIN_TOKEN>.
npx wrangler kv namespace create LINKS

# 2. Set the admin token. Generate something long and random.
openssl rand -hex 32 | tr -d '\n' | npx wrangler secret put ADMIN_TOKEN

# 3. (Optional) Mount custom domains by editing the [[routes]] section
#    in wrangler.toml. Examples are inlined.

# 4. Deploy.
npx wrangler deploy
```

The admin login URL is `https://<your-host>/<LINKS_NAMESPACE_ID>/<ADMIN_TOKEN>`. Visiting it sets a 30-day HTTP-only session cookie and redirects to `/admin`. Bookmark this URL on the device(s) you trust and never paste it elsewhere.

## Custom domain wildcards

Cloudflare's route patterns are wildcard-aware. Drop them into `wrangler.toml`:

```toml
# Single subdomain (managed DNS + cert):
[[routes]]
pattern = "s.example.com"
custom_domain = true

# All subdomains under a zone — the * is wild and matches anything:
[[routes]]
pattern = "*.example.com/*"
zone_name = "example.com"

# Apex domain on the same zone:
[[routes]]
pattern = "example.com/*"
zone_name = "example.com"
```

The Worker is host-agnostic. The host of every short URL is computed from the incoming request, so `https://a.example.com/abc` and `https://b.example.com/abc` resolve to the same record but each prints itself when echoed.

## Identities and ownership

Every link record carries an `owner` field with one of three shapes:

| Owner | Set when | Cookie | Persists across browsers? |
| --- | --- | --- | --- |
| `admin` | Created from the admin dashboard | `shortr_sid` (HttpOnly) | Wherever you signed in |
| `user`  | Created while signed in to a user account | `shortr_sid` (HttpOnly) | Yes |
| `anon`  | Created anonymously (only when `ALLOW_PUBLIC=true`) | `shortr_anon` (readable JS) | No — bound to one browser |

Anonymous visitors get a random `anon_<id>` cookie the first time they create or visit `/my`. That cookie is the only thing tying their browser to the links they made. To make ownership portable, sign up for an account.

In addition to the cookie, every link gets a 32-character edit token. The token is stored hashed (SHA-256). Anyone who has the token (or the `/<slug>:<token>` URL) can update or delete the link without logging in. Share the edit URL to delegate control without sharing your account.

The browser-side dashboard also keeps a `localStorage` cache of links you created on that device, so even if cookies are wiped you can recover an edit URL from `My links → Recent (this browser)`.

## API

JSON unless stated. Cookie auth comes from `shortr_sid` / `shortr_anon`. Edit-token auth uses `Authorization: Token <editToken>`.

### `POST /api/shorten`

Create a short link. No auth required when `ALLOW_PUBLIC=true`. Returns a 32-char `editToken` and ready-to-share `editUrl`.

```json
{
  "url": "https://example.com/long/path",
  "slug": "blog-2026",        // optional, [A-Za-z0-9_-]{1,64}
  "ttl": 3600,                // optional, seconds (min 60)
  "maxClicks": 100,           // optional
  "password": "hunter2",      // optional
  "note": "Q1 newsletter"     // optional, owner-private label
}
```

Response:

```json
{
  "ok": true,
  "slug": "blog-2026",
  "shortUrl": "https://your-host/blog-2026",
  "url": "https://example.com/long/path",
  "editToken": "u1t4msUvCa0HOwjjljjphC0Kn-P3ojER",
  "editUrl": "https://your-host/blog-2026:u1t4msUvCa0HOwjjljjphC0Kn-P3ojER",
  "owner": { "kind": "user", "userId": "user_..." },
  "createdAt": 1747900000000,
  "expiresAt": null,
  "maxClicks": null
}
```

### `GET /<slug>` / `POST /<slug>`

Issues a `302` to the destination, or returns an HTML password gate (status `401`) when the link has a password. The password gate `POST`s back to `/<slug>` with form field `password=...`.

### `GET /<slug>+`

Public preview without redirect:

```json
{ "ok": true, "slug": "...", "url": "...", "clicks": 42,
  "createdAt": ..., "expiresAt": null, "maxClicks": null,
  "requiresPassword": false }
```

### `GET /<slug>:<editToken>`

Renders an HTML edit form for that link. The 32-char token is hashed and constant-time compared. Anyone with the token can update or delete the link.

### `POST /<slug>:<editToken>`

Form-encoded submission with `action=update` (default) or `action=delete`. Fields: `url`, `expiresAtLocal` (HTML `datetime-local`), `maxClicks`, `password`, `note`.

### `PATCH /api/edit/<slug>`, `DELETE /api/edit/<slug>`, `GET /api/edit/<slug>`

JSON edit by token. Pass `Authorization: Token <editToken>`.

### Account API

Form-encoded so it works without JS:

- `POST /api/auth/signup` → `{ username, password }` (3-32 / 6-200 chars). Issues `shortr_sid`, redirects `/my`.
- `POST /api/auth/login` → same fields. Issues `shortr_sid`, redirects `/my`.
- `POST /api/auth/logout` → clears `shortr_sid`, redirects `/`.

Passwords are stored as PBKDF2-SHA256 (100k iterations, the Workers cap) with a per-user random salt.

### Owner-scoped API

For both registered users (cookie session) and anonymous visitors (anon cookie):

- `GET    /api/me/links`                       — list links you own
- `GET    /api/me/links/<slug>`                — read full record (must own)
- `PATCH  /api/me/links/<slug>`                — update fields (must own)
- `DELETE /api/me/links/<slug>`                — delete (must own)

Patch body accepts the same fields as `mergePatch`: `url`, `expiresAt` (`null` to clear), `maxClicks` (`null`/`0` to clear), `password` (`""` keep, `"-"` remove, otherwise replace), `note`.

### Admin API

Cookie session from `/<KV_ID>/<ADMIN_TOKEN>`. Admins can manage any link regardless of owner.

- `GET    /api/admin/links?prefix=&cursor=&limit=` — paginated list
- `GET    /api/admin/links/<slug>`                 — full record
- `PATCH  /api/admin/links/<slug>`                 — same fields as owner patch
- `DELETE /api/admin/links/<slug>`                 — drop link + stats

## Configuration (`wrangler.toml`)

| Var | Default | Meaning |
| --- | --- | --- |
| `LINKS_NAMESPACE_ID` | (required) | Same as the `[[kv_namespaces]] id`. Used to build the admin login URL. |
| `PUBLIC_BASE` | `""` | Override the base URL printed by the API (useful behind a CDN). |
| `RESERVED_SLUGS` | reserved list | Slugs that cannot be assigned. |
| `DEFAULT_SLUG_LENGTH` | `6` | Length of auto-generated slugs (clamped to 4..32). |
| `MAX_URL_LENGTH` | `2048` | Reject destinations longer than this many characters. |
| `ALLOW_PUBLIC` | `true` | When `false`, anonymous shortening is rejected; users must log in. |

Secrets:

| Secret | Required | Meaning |
| --- | --- | --- |
| `ADMIN_TOKEN` | yes | Bearer-style token in the admin login URL `/<KV_ID>/<ADMIN_TOKEN>`. |

## Routes summary

```
GET    /                          public landing
GET    /login | /signup           account auth pages
POST   /api/auth/login            sets cookie, 303 → /my
POST   /api/auth/signup           sets cookie, 303 → /my
POST   /api/auth/logout           clears cookie, 303 → /

GET    /my                        user/anon dashboard
GET    /<KV_ID>/<ADMIN_TOKEN>     admin login → 303 /admin
GET    /admin                     admin dashboard

GET    /<slug>                    302 redirect (or password gate)
POST   /<slug>                    submit password
GET    /<slug>+                   JSON preview
GET    /<slug>:<token>            edit form
POST   /<slug>:<token>            apply edit / delete

POST   /api/shorten               create
GET/PATCH/DELETE /api/me/links    owner-scoped
GET/PATCH/DELETE /api/admin/links admin-scoped
GET/PATCH/DELETE /api/edit/<slug> edit-token-scoped JSON
GET    /healthz                   liveness
```

## Development

```bash
# Pure-Node smoke tests (no Cloudflare emulator required):
npm test                  # 32 integration cases against a fake KV

# Live dev server (requires CF account + Wrangler login):
npx wrangler dev

# Tail production logs:
npx wrangler tail
```

`wrangler dev` does not run inside some restricted Linux sandboxes (e.g. Alpine PRoot) because Miniflare needs `uv_interface_addresses`. The smoke tests work everywhere.

## Source layout

- `src/index.js` — router, handlers, redirect logic
- `src/store.js` — KV schema (links, stats, users, sessions, ownership index)
- `src/util.js` — slug RNG, URL normalisation, PBKDF2 hashing, cookie helpers
- `src/auth.js` — identity resolution, session creation, anon cookie issuance
- `src/layout.js` — shared HTML head, nav, CSS
- `src/pages.js` — landing, auth, my-links, admin, edit-by-token, password gate

## Security notes

- Edit tokens are stored as SHA-256 hashes and compared in constant time; the raw token is only seen once at creation. Treat edit URLs like passwords.
- User passwords use PBKDF2-SHA256 with 100k iterations (Workers' platform cap) and random 16-byte salts. Login intentionally runs the verifier even on unknown usernames to avoid timing oracles.
- The admin URL doubles as a bearer token in the path. Use a fully random secret (e.g. `openssl rand -hex 32`) and keep the URL out of analytics, referrer headers, and chat history.
- Open redirects: any HTTP/HTTPS destination is permitted by design. To allow-list, edit `normalizeUrl` in `src/util.js`.
- All session cookies are HTTP-only + SameSite=Lax + Secure. The anon cookie is JS-readable on purpose so the dashboard can show the cookie ID for debugging.

## License

MIT — see [LICENSE](LICENSE).
