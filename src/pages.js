// All HTML pages: public landing, login, signup, my-links dashboard, admin
// dashboard, password gate, edit-by-token page.

import { pageShell, escapeHtml } from "./layout.js";

// ---------- Public landing (the shortener form) ----------

export function landingPage({ user, isAdmin, allowPublic, defaultSlugLength, maxUrlLength }) {
  const banner = !user && !isAdmin && !allowPublic
    ? `<div class="banner">This instance has public shortening disabled. <a href="/login">Login</a> or <a href="/signup">create an account</a> to shorten links.</div>`
    : "";

  const body = `${banner}
<div class="card">
<h2>Shorten a URL</h2>
<form id="f" autocomplete="off">
  <label for="url">Long URL</label>
  <input id="url" name="url" type="url" placeholder="https://example.com/very/long/path"
    required maxlength="${maxUrlLength}">

  <details class="advanced">
    <summary>Options</summary>
    <div class="row">
      <div>
        <label for="slug">Custom slug <span class="muted">(optional)</span></label>
        <input id="slug" name="slug" type="text" pattern="[A-Za-z0-9_-]{1,64}" maxlength="64"
          placeholder="auto (${defaultSlugLength} chars)">
      </div>
      <div>
        <label for="ttl">Expires in <span class="muted">(seconds)</span></label>
        <input id="ttl" name="ttl" type="number" min="60" placeholder="never">
      </div>
    </div>
    <div class="row">
      <div>
        <label for="maxClicks">Max clicks <span class="muted">(optional)</span></label>
        <input id="maxClicks" name="maxClicks" type="number" min="1" placeholder="unlimited">
      </div>
      <div>
        <label for="password">Password <span class="muted">(optional)</span></label>
        <input id="password" name="password" type="text" placeholder="prompt before redirect">
      </div>
    </div>
    <label for="note">Note <span class="muted">(optional, private)</span></label>
    <input id="note" name="note" type="text" maxlength="200" placeholder="internal label">
  </details>

  <button type="submit" id="go">Shorten</button>
</form>
<div id="r"></div>
</div>

<div class="card">
  <h2>What happens to your link?</h2>
  <p class="muted" style="margin:0">
    Each link gets a 32-character <strong>edit token</strong>. Anyone with that token can update or delete it via
    a special edit URL — give it to a teammate to delegate management without sharing your account.
    ${user
      ? "Your links are also tied to your account, so you can manage them from <a href='/my'>My links</a>."
      : "Without an account, your links are remembered on this browser via a cookie. <a href='/signup'>Sign up</a> to access them anywhere."}
  </p>
</div>`;

  const script = `<script>${LANDING_SCRIPT}</script>`;
  return pageShell({ title: "shortr — URL shortener", body: body + script, user, isAdmin });
}

const LANDING_SCRIPT = `
const form = document.getElementById("f");
const out = document.getElementById("r");
const btn = document.getElementById("go");

// Local cache of recently created links (anonymous users especially benefit).
const CACHE_KEY = "shortr.recent";
function loadRecent() { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "[]"); } catch { return []; } }
function saveRecent(list) { try { localStorage.setItem(CACHE_KEY, JSON.stringify(list.slice(0, 50))); } catch {} }
function rememberRecent(item) {
  const list = loadRecent().filter((x) => x.slug !== item.slug);
  list.unshift({ ...item, savedAt: Date.now() });
  saveRecent(list);
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  out.innerHTML = ""; btn.disabled = true; btn.textContent = "Shortening...";
  const body = {
    url: form.url.value,
    slug: form.slug.value || undefined,
    ttl: form.ttl.value ? Number(form.ttl.value) : undefined,
    maxClicks: form.maxClicks.value ? Number(form.maxClicks.value) : undefined,
    password: form.password.value || undefined,
    note: form.note.value || undefined,
  };
  try {
    const res = await fetch("/api/shorten", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      out.innerHTML = '<div class="short-result err"></div>';
      out.querySelector(".short-result").textContent = data.error || ("Failed (" + res.status + ")");
      return;
    }
    rememberRecent({
      slug: data.slug, shortUrl: data.shortUrl, url: data.url,
      editToken: data.editToken, editUrl: data.editUrl,
      expiresAt: data.expiresAt || null,
    });
    out.innerHTML = renderResult(data);
    bindCopyButtons(out);
    form.reset();
  } catch (err) {
    out.innerHTML = '<div class="short-result err"></div>';
    out.querySelector(".short-result").textContent = String(err);
  } finally { btn.disabled = false; btn.textContent = "Shorten"; }
});

function renderResult(d) {
  const expires = d.expiresAt ? '<div class="muted">Expires ' + new Date(d.expiresAt).toLocaleString() + '</div>' : '';
  return [
    '<div class="short-result ok" style="margin-top:14px">',
      '<div><a href="' + d.shortUrl + '" target="_blank" rel="noopener">' + d.shortUrl + '</a>',
        '<button class="copy-btn" data-copy="' + d.shortUrl + '" style="margin-left:8px">Copy</button>',
      '</div>',
      expires,
      '<div style="margin-top:10px"><span class="muted">Edit URL (keep secret, share to delegate):</span>',
        '<div class="codebox edit-link" id="elnk">' + d.editUrl + '</div>',
        '<button class="copy-btn" data-copy="' + d.editUrl + '" style="margin-top:6px">Copy edit link</button>',
      '</div>',
    '</div>',
  ].join("");
}

function bindCopyButtons(scope) {
  scope.querySelectorAll(".copy-btn[data-copy]").forEach((b) => {
    b.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(b.dataset.copy);
        const t = b.textContent; b.textContent = "Copied"; setTimeout(() => b.textContent = t, 1100);
      } catch {}
    });
  });
}
`;

// ---------- Login / Signup ----------

export function authPage({ kind, error = "", username = "" }) {
  const isLogin = kind === "login";
  const body = `<div class="card" style="max-width:440px;margin:30px auto">
<h2>${isLogin ? "Sign in" : "Create account"}</h2>
${error ? `<div class="banner error">${escapeHtml(error)}</div>` : ""}
<form method="POST" action="/api/auth/${isLogin ? "login" : "signup"}" autocomplete="${isLogin ? "on" : "off"}">
  <label>Username</label>
  <input name="username" type="text" required minlength="3" maxlength="32"
    pattern="[a-zA-Z0-9._-]{3,32}" value="${escapeHtml(username)}" autofocus>
  <label>Password</label>
  <input name="password" type="password" required minlength="6" maxlength="200">
  <button type="submit">${isLogin ? "Sign in" : "Sign up"}</button>
</form>
<div class="muted" style="margin-top:14px">
  ${isLogin
    ? "No account yet? <a href='/signup'>Create one</a>."
    : "Already have an account? <a href='/login'>Sign in</a>."}
</div>
</div>`;
  return pageShell({ title: isLogin ? "Sign in — shortr" : "Sign up — shortr", body });
}

// ---------- "My links" dashboard ----------

export function myPage({ user, anonId }) {
  const who = user ? `signed in as <strong>@${escapeHtml(user.username)}</strong>` : "browsing anonymously";
  const intro = user
    ? "Links you created while signed in to this account."
    : "Links you created from this browser. Set up an account to keep them across devices.";
  const body = `<div class="card">
  <h2>My links</h2>
  <div class="muted" style="margin-top:0">${who}. ${intro}</div>
  ${user ? "" : "<div class='banner' style='margin-top:12px'>You're not signed in. We're matching links by your browser cookie. Cookie id: <code class='mono'>" + escapeHtml(anonId || "(none yet)") + "</code></div>"}
  <div class="toolbar" style="margin-top:14px">
    <button class="ghost inline" id="refresh">Refresh</button>
    <button class="ghost inline" id="newLink" type="button">New link</button>
    <button class="ghost inline" id="recovery">Edit by token...</button>
    <span class="muted" id="count"></span>
  </div>
  <div id="tableWrap"></div>
</div>

<div class="card">
  <h2>Recent (this browser)</h2>
  <div class="muted">Cached locally. Useful when cookies are cleared but you copied an edit link earlier.</div>
  <div id="cacheWrap"></div>
</div>

<dialog id="newDlg">
  <h3 style="margin:0 0 10px">New link</h3>
  <form id="newForm">
    <label>Long URL</label>
    <input name="url" type="url" required>
    <div class="row" style="margin-top:8px">
      <div><label>Custom slug</label><input name="slug" type="text" pattern="[A-Za-z0-9_-]{1,64}"></div>
      <div><label>TTL (seconds)</label><input name="ttl" type="number" min="60"></div>
    </div>
    <div class="row" style="margin-top:8px">
      <div><label>Max clicks</label><input name="maxClicks" type="number" min="1"></div>
      <div><label>Password</label><input name="password" type="text"></div>
    </div>
    <label>Note</label>
    <input name="note" type="text" maxlength="200">
    <div class="actions">
      <button type="button" class="ghost" id="newCancel">Cancel</button>
      <button type="submit">Create</button>
    </div>
  </form>
</dialog>

<dialog id="editDlg">
  <h3 style="margin:0 0 10px">Edit link</h3>
  <form id="editForm">
    <input type="hidden" id="eSlug">
    <input type="hidden" id="eTok">
    <label>Slug</label><input id="eSlugDisplay" type="text" readonly>
    <label>Destination URL</label><input id="eUrl" type="url" required>
    <div class="row" style="margin-top:8px">
      <div><label>Expires at <span class="muted">(local datetime)</span></label><input id="eExp" type="datetime-local"></div>
      <div><label>Max clicks</label><input id="eMax" type="number" min="0"></div>
    </div>
    <div class="row" style="margin-top:8px">
      <div><label>Password (blank=keep, "-"=remove)</label><input id="ePwd" type="text"></div>
      <div><label>Note</label><input id="eNote" type="text"></div>
    </div>
    <div class="actions">
      <button type="button" class="ghost" id="eCancel">Cancel</button>
      <button type="button" class="danger" id="eDelete">Delete</button>
      <button type="submit">Save</button>
    </div>
  </form>
</dialog>

<dialog id="tokDlg">
  <h3 style="margin:0 0 10px">Edit by token</h3>
  <p class="muted" style="margin:0 0 10px">Paste an edit link or just the token.</p>
  <form id="tokForm">
    <input id="tokInput" type="text" placeholder="https://this-host/abcd:tokentoken... or slug:token" required>
    <div class="actions">
      <button type="button" class="ghost" id="tokCancel">Cancel</button>
      <button type="submit">Open</button>
    </div>
  </form>
</dialog>

<script>${MY_SCRIPT}</script>`;
  return pageShell({ title: "My links — shortr", body, user, wide: true });
}

const MY_SCRIPT = `
const $ = (id) => document.getElementById(id);
const CACHE_KEY = "shortr.recent";

async function api(path, opts = {}) {
  const headers = { "content-type": "application/json", ...(opts.headers || {}) };
  const res = await fetch(path, { ...opts, headers });
  let data; try { data = await res.json(); } catch { data = null; }
  if (!res.ok) {
    const err = new Error((data && data.error) || ("HTTP " + res.status));
    err.status = res.status;
    throw err;
  }
  return data;
}

function loadRecent() { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "[]"); } catch { return []; } }
function saveRecent(list) { try { localStorage.setItem(CACHE_KEY, JSON.stringify(list.slice(0, 50))); } catch {} }
function rememberRecent(item) {
  const list = loadRecent().filter((x) => x.slug !== item.slug);
  list.unshift({ ...item, savedAt: Date.now() });
  saveRecent(list);
}
function dropRecent(slug) { saveRecent(loadRecent().filter((x) => x.slug !== slug)); }

function tag(text, cls) { return '<span class="tag ' + cls + '">' + text + '</span>'; }

function rowHtml(it, opts = {}) {
  const flags = [];
  if (it.expiresAt) flags.push(tag("TTL", "warn"));
  if (it.maxClicks) flags.push(tag("cap " + it.maxClicks, "warn"));
  if (it.passwordHash || it.requiresPassword) flags.push(tag("pwd", "danger"));
  if (it.owner) flags.push(tag(it.owner.kind, it.owner.kind));
  return '<tr data-slug="' + it.slug + '">'
    + '<td class="mono"><a href="/' + it.slug + '" target="_blank" rel="noopener">' + it.slug + '</a>'
        + ' <button class="copy-btn" data-copy="' + location.origin + '/' + it.slug + '">copy</button></td>'
    + '<td><span class="dest mono" title="' + esc(it.url) + '">' + esc(it.url) + '</span>'
      + (it.note ? '<div class="muted">' + esc(it.note) + '</div>' : '') + '</td>'
    + '<td>' + (it.clicks || 0) + '</td>'
    + '<td>' + flags.join(" ") + '</td>'
    + '<td>' + (it.createdAt ? new Date(it.createdAt).toLocaleString() : '') + '</td>'
    + '<td><button class="icon-btn ghost" data-edit="' + it.slug + '">Edit</button> '
      + '<button class="icon-btn danger" data-del="' + it.slug + '">Delete</button></td>'
    + '</tr>';
}

function esc(s) { return String(s == null ? "" : s).replace(/[&<>\\"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;","'":"&#39;"})[c]); }

async function refresh() {
  try {
    const data = await api("/api/me/links");
    const wrap = $("tableWrap");
    if (!data.items.length) {
      wrap.innerHTML = '<div class="empty">No links yet. <a href="#" id="emptyNew">Create your first one.</a></div>';
      $("count").textContent = "";
      $("emptyNew")?.addEventListener("click", (e) => { e.preventDefault(); openNewDlg(); });
      return;
    }
    wrap.innerHTML = '<table><thead><tr><th>Slug</th><th>Destination</th><th>Clicks</th><th>Flags</th><th>Created</th><th></th></tr><tbody>' + data.items.map((i) => rowHtml(i)).join("") + '</tbody></table>';
    $("count").textContent = data.items.length + " link" + (data.items.length === 1 ? "" : "s");
  } catch (err) {
    $("tableWrap").innerHTML = '<div class="banner error">' + esc(err.message) + '</div>';
  }
  renderCache();
}

function renderCache() {
  const list = loadRecent();
  if (!list.length) { $("cacheWrap").innerHTML = '<div class="empty">Nothing cached yet.</div>'; return; }
  $("cacheWrap").innerHTML = '<table><thead><tr><th>Slug</th><th>Edit URL</th><th>Saved</th><th></th></tr><tbody>'
    + list.map((it) => '<tr><td class="mono">' + esc(it.slug) + '</td>'
        + '<td><span class="edit-link mono">' + esc(it.editUrl) + '</span> <button class="copy-btn" data-copy="' + esc(it.editUrl) + '">copy</button></td>'
        + '<td class="muted">' + (it.savedAt ? new Date(it.savedAt).toLocaleString() : "") + '</td>'
        + '<td><button class="icon-btn ghost" data-tok-open="' + esc(it.editUrl) + '">Open</button>'
          + ' <button class="icon-btn danger" data-cache-drop="' + esc(it.slug) + '">Forget</button></td></tr>').join("")
    + '</tbody></table>';
}

function openNewDlg() { $("newDlg").showModal(); }
$("newLink").addEventListener("click", openNewDlg);
$("refresh").addEventListener("click", refresh);
$("newCancel").addEventListener("click", () => $("newDlg").close());
$("eCancel").addEventListener("click", () => $("editDlg").close());
$("tokCancel").addEventListener("click", () => $("tokDlg").close());
$("recovery").addEventListener("click", () => $("tokDlg").showModal());

$("newForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const body = {
    url: fd.get("url"),
    slug: fd.get("slug") || undefined,
    ttl: fd.get("ttl") ? Number(fd.get("ttl")) : undefined,
    maxClicks: fd.get("maxClicks") ? Number(fd.get("maxClicks")) : undefined,
    password: fd.get("password") || undefined,
    note: fd.get("note") || undefined,
  };
  try {
    const data = await api("/api/shorten", { method: "POST", body: JSON.stringify(body) });
    rememberRecent({ slug: data.slug, shortUrl: data.shortUrl, url: data.url, editToken: data.editToken, editUrl: data.editUrl, expiresAt: data.expiresAt || null });
    $("newDlg").close(); e.target.reset();
    await refresh();
  } catch (err) { alert(err.message); }
});

$("tableWrap").addEventListener("click", async (e) => {
  const t = e.target.closest("button"); if (!t) return;
  if (t.dataset.copy) { try { await navigator.clipboard.writeText(t.dataset.copy); t.textContent="copied"; setTimeout(()=>t.textContent="copy",900); } catch {} return; }
  if (t.dataset.del) {
    if (!confirm("Delete /" + t.dataset.del + "?")) return;
    try { await api("/api/me/links/" + encodeURIComponent(t.dataset.del), { method: "DELETE" }); dropRecent(t.dataset.del); await refresh(); }
    catch (err) { alert(err.message); }
    return;
  }
  if (t.dataset.edit) {
    try {
      const data = await api("/api/me/links/" + encodeURIComponent(t.dataset.edit));
      openEdit(data);
    } catch (err) { alert(err.message); }
  }
});

$("cacheWrap").addEventListener("click", (e) => {
  const t = e.target.closest("button"); if (!t) return;
  if (t.dataset.copy) { navigator.clipboard.writeText(t.dataset.copy).catch(()=>{}); t.textContent="copied"; setTimeout(()=>t.textContent="copy",900); return; }
  if (t.dataset.cacheDrop) { dropRecent(t.dataset.cacheDrop); renderCache(); return; }
  if (t.dataset.tokOpen) { window.location.href = t.dataset.tokOpen; }
});

function openEdit(rec) {
  $("eSlug").value = rec.slug;
  $("eTok").value = "";  // unused for /api/me path
  $("eSlugDisplay").value = rec.slug;
  $("eUrl").value = rec.url;
  $("eExp").value = rec.expiresAt ? toLocalInput(rec.expiresAt) : "";
  $("eMax").value = rec.maxClicks || "";
  $("ePwd").value = "";
  $("eNote").value = rec.note || "";
  $("editDlg").dataset.endpoint = "/api/me/links/" + encodeURIComponent(rec.slug);
  $("editDlg").showModal();
}

function toLocalInput(ms) {
  const d = new Date(ms); const pad = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + pad(d.getMonth()+1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
}

$("editForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const endpoint = $("editDlg").dataset.endpoint;
  const body = {
    url: $("eUrl").value,
    expiresAt: $("eExp").value ? new Date($("eExp").value).getTime() : null,
    maxClicks: $("eMax").value ? Number($("eMax").value) : null,
    password: $("ePwd").value === "" ? undefined : $("ePwd").value,
    note: $("eNote").value || "",
  };
  try { await api(endpoint, { method: "PATCH", body: JSON.stringify(body) }); $("editDlg").close(); await refresh(); }
  catch (err) { alert(err.message); }
});

$("eDelete").addEventListener("click", async () => {
  const slug = $("eSlug").value;
  if (!confirm("Delete /" + slug + "?")) return;
  try { await api("/api/me/links/" + encodeURIComponent(slug), { method: "DELETE" }); dropRecent(slug); $("editDlg").close(); await refresh(); }
  catch (err) { alert(err.message); }
});

$("tokForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const raw = $("tokInput").value.trim();
  if (!raw) return;
  // Accept full URL like https://host/slug:token, "slug:token", or "/slug:token".
  let m = raw.match(/(?:^|\\/)([A-Za-z0-9_-]{1,64}):([A-Za-z0-9_-]{16,128})$/);
  if (!m) { alert("Could not parse slug:token"); return; }
  window.location.href = "/" + m[1] + ":" + m[2];
});

refresh();
`;

// ---------- Admin dashboard ----------

export function adminPage({ kvId }) {
  const body = `<div class="card">
  <h2>Admin dashboard</h2>
  <div class="muted">Manage every link in the namespace. The login URL is bound to <code class="mono">${escapeHtml(kvId)}</code>.</div>
  <div class="toolbar" style="margin-top:14px">
    <input id="search" type="search" placeholder="Filter slug prefix...">
    <button class="ghost inline" id="refresh">Refresh</button>
    <button class="ghost inline" id="newLink">New link</button>
    <span class="muted" id="count"></span>
  </div>
  <div id="tableWrap"></div>
  <div style="margin-top:10px;display:flex;justify-content:flex-end;gap:8px">
    <button class="ghost inline" id="more" style="display:none">Load more</button>
  </div>
</div>

<dialog id="newDlg">
  <h3 style="margin:0 0 10px">New link (admin)</h3>
  <form id="newForm">
    <label>Long URL</label>
    <input name="url" type="url" required>
    <div class="row" style="margin-top:8px">
      <div><label>Custom slug</label><input name="slug" type="text" pattern="[A-Za-z0-9_-]{1,64}"></div>
      <div><label>TTL (seconds)</label><input name="ttl" type="number" min="60"></div>
    </div>
    <div class="row" style="margin-top:8px">
      <div><label>Max clicks</label><input name="maxClicks" type="number" min="1"></div>
      <div><label>Password</label><input name="password" type="text"></div>
    </div>
    <label>Note</label>
    <input name="note" type="text" maxlength="200">
    <div class="actions">
      <button type="button" class="ghost" id="newCancel">Cancel</button>
      <button type="submit">Create</button>
    </div>
  </form>
</dialog>

<dialog id="editDlg">
  <h3 style="margin:0 0 10px">Edit link (admin)</h3>
  <form id="editForm">
    <input type="hidden" id="eSlug">
    <label>Slug</label><input id="eSlugDisplay" type="text" readonly>
    <label>Destination URL</label><input id="eUrl" type="url" required>
    <div class="row" style="margin-top:8px">
      <div><label>Expires at</label><input id="eExp" type="datetime-local"></div>
      <div><label>Max clicks (0=unlimited)</label><input id="eMax" type="number" min="0"></div>
    </div>
    <div class="row" style="margin-top:8px">
      <div><label>Password (blank=keep, "-"=remove)</label><input id="ePwd" type="text"></div>
      <div><label>Note</label><input id="eNote" type="text"></div>
    </div>
    <label>Owner</label>
    <input id="eOwner" type="text" readonly class="mono">
    <div class="actions">
      <button type="button" class="ghost" id="eCancel">Cancel</button>
      <button type="button" class="danger" id="eDelete">Delete</button>
      <button type="submit">Save</button>
    </div>
  </form>
</dialog>

<script>${ADMIN_SCRIPT}</script>`;
  return pageShell({ title: "Admin — shortr", body, isAdmin: true, wide: true });
}

const ADMIN_SCRIPT = `
const $ = (id) => document.getElementById(id);
let cursor = null;

async function api(path, opts = {}) {
  const headers = { "content-type": "application/json", ...(opts.headers || {}) };
  const res = await fetch(path, { ...opts, headers });
  let data; try { data = await res.json(); } catch { data = null; }
  if (!res.ok) { const e = new Error((data && data.error) || ("HTTP " + res.status)); e.status = res.status; throw e; }
  return data;
}
function esc(s) { return String(s == null ? "" : s).replace(/[&<>\\"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;","'":"&#39;"})[c]); }
function tag(t, c) { return '<span class="tag ' + c + '">' + t + '</span>'; }

function rowHtml(it) {
  const flags = [];
  if (it.expiresAt) flags.push(tag("TTL", "warn"));
  if (it.maxClicks) flags.push(tag("cap " + it.maxClicks, "warn"));
  if (it.passwordHash) flags.push(tag("pwd", "danger"));
  if (it.owner) flags.push(tag(it.owner.kind, it.owner.kind));
  return '<tr><td class="mono"><a href="/' + it.slug + '" target="_blank" rel="noopener">' + it.slug + '</a></td>'
    + '<td><span class="dest mono" title="' + esc(it.url) + '">' + esc(it.url) + '</span>'
    + (it.note ? '<div class="muted">' + esc(it.note) + '</div>' : '') + '</td>'
    + '<td>' + (it.clicks || 0) + '</td>'
    + '<td>' + flags.join(" ") + '</td>'
    + '<td class="muted">' + (it.createdAt ? new Date(it.createdAt).toLocaleString() : "") + '</td>'
    + '<td><button class="icon-btn ghost" data-edit="' + esc(it.slug) + '">Edit</button>'
      + ' <button class="icon-btn danger" data-del="' + esc(it.slug) + '">Delete</button></td></tr>';
}

async function load(reset) {
  if (reset) cursor = null;
  const params = new URLSearchParams();
  const prefix = $("search").value.trim(); if (prefix) params.set("prefix", prefix);
  if (cursor) params.set("cursor", cursor);
  const data = await api("/api/admin/links?" + params.toString());
  cursor = data.cursor;
  $("more").style.display = cursor ? "inline-block" : "none";
  if (reset) $("tableWrap").innerHTML = "";
  if (!data.items.length && reset) {
    $("tableWrap").innerHTML = '<div class="empty">No links yet.</div>'; $("count").textContent = ""; return;
  }
  if (reset) {
    $("tableWrap").innerHTML = '<table><thead><tr><th>Slug</th><th>Destination</th><th>Clicks</th><th>Flags</th><th>Created</th><th></th></tr><tbody></tbody></table>';
  }
  const tbody = $("tableWrap").querySelector("tbody");
  tbody.insertAdjacentHTML("beforeend", data.items.map(rowHtml).join(""));
  $("count").textContent = tbody.children.length + " shown";
}

$("refresh").addEventListener("click", () => load(true));
$("search").addEventListener("input", debounce(() => load(true), 200));
$("more").addEventListener("click", () => load(false));
$("newLink").addEventListener("click", () => $("newDlg").showModal());
$("newCancel").addEventListener("click", () => $("newDlg").close());
$("eCancel").addEventListener("click", () => $("editDlg").close());

$("newForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const body = {
    url: fd.get("url"), slug: fd.get("slug") || undefined,
    ttl: fd.get("ttl") ? Number(fd.get("ttl")) : undefined,
    maxClicks: fd.get("maxClicks") ? Number(fd.get("maxClicks")) : undefined,
    password: fd.get("password") || undefined, note: fd.get("note") || undefined,
  };
  try { await api("/api/shorten", { method: "POST", body: JSON.stringify(body) }); $("newDlg").close(); e.target.reset(); await load(true); }
  catch (err) { alert(err.message); }
});

$("tableWrap").addEventListener("click", async (e) => {
  const t = e.target.closest("button"); if (!t) return;
  if (t.dataset.del) {
    if (!confirm("Delete /" + t.dataset.del + "?")) return;
    try { await api("/api/admin/links/" + encodeURIComponent(t.dataset.del), { method: "DELETE" }); await load(true); } catch (err) { alert(err.message); }
    return;
  }
  if (t.dataset.edit) {
    try {
      const data = await api("/api/admin/links/" + encodeURIComponent(t.dataset.edit));
      $("eSlug").value = data.slug; $("eSlugDisplay").value = data.slug;
      $("eUrl").value = data.url;
      $("eExp").value = data.expiresAt ? toLocalInput(data.expiresAt) : "";
      $("eMax").value = data.maxClicks || "";
      $("ePwd").value = "";
      $("eNote").value = data.note || "";
      $("eOwner").value = data.owner ? JSON.stringify(data.owner) : "(none)";
      $("editDlg").showModal();
    } catch (err) { alert(err.message); }
  }
});

$("editForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const slug = $("eSlug").value;
  const body = {
    url: $("eUrl").value,
    expiresAt: $("eExp").value ? new Date($("eExp").value).getTime() : null,
    maxClicks: $("eMax").value ? Number($("eMax").value) : null,
    password: $("ePwd").value === "" ? undefined : $("ePwd").value,
    note: $("eNote").value || "",
  };
  try { await api("/api/admin/links/" + encodeURIComponent(slug), { method: "PATCH", body: JSON.stringify(body) }); $("editDlg").close(); await load(true); }
  catch (err) { alert(err.message); }
});

$("eDelete").addEventListener("click", async () => {
  const slug = $("eSlug").value;
  if (!confirm("Delete /" + slug + "?")) return;
  try { await api("/api/admin/links/" + encodeURIComponent(slug), { method: "DELETE" }); $("editDlg").close(); await load(true); } catch (err) { alert(err.message); }
});

function toLocalInput(ms) { const d = new Date(ms); const p = (n) => String(n).padStart(2,"0"); return d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate())+"T"+p(d.getHours())+":"+p(d.getMinutes()); }
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

load(true);
`;

// ---------- Edit by token page ----------

export function tokenEditPage({ slug, link, error = "", flash = "" }) {
  const body = `<div class="card" style="max-width:560px;margin:30px auto">
  <h2>Edit /${escapeHtml(slug)}</h2>
  ${error ? `<div class="banner error">${escapeHtml(error)}</div>` : ""}
  ${flash ? `<div class="banner ok">${escapeHtml(flash)}</div>` : ""}
  ${link ? `
  <div class="muted">Anyone with the edit token can update or delete this link. Treat it like a password.</div>
  <form method="POST" action="" autocomplete="off" id="editForm">
    <input type="hidden" name="action" value="update">
    <label>Destination URL</label>
    <input name="url" type="url" required value="${escapeHtml(link.url)}">
    <div class="row" style="margin-top:8px">
      <div><label>Expires at</label><input name="expiresAtLocal" type="datetime-local" value="${link.expiresAt ? localInput(link.expiresAt) : ""}"></div>
      <div><label>Max clicks (0=unlimited)</label><input name="maxClicks" type="number" min="0" value="${link.maxClicks || ""}"></div>
    </div>
    <div class="row" style="margin-top:8px">
      <div><label>Password (blank=keep, "-"=remove)</label><input name="password" type="text"></div>
      <div><label>Note</label><input name="note" type="text" value="${escapeHtml(link.note || "")}"></div>
    </div>
    <button type="submit">Save changes</button>
  </form>
  <form method="POST" action="" style="margin-top:14px" onsubmit="return confirm('Delete this link?')">
    <input type="hidden" name="action" value="delete">
    <button type="submit" class="danger">Delete this link</button>
  </form>
  <div class="muted" style="margin-top:18px">
    Slug: <code class="mono">${escapeHtml(slug)}</code><br>
    Created: ${link.createdAt ? new Date(link.createdAt).toLocaleString() : "(unknown)"}<br>
    Clicks so far: ${link.clicks || 0}
  </div>` : `<div class="muted">Link not found or token invalid.</div>`}
</div>`;
  return pageShell({ title: "Edit link — shortr", body });
}

function localInput(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ---------- Password gate (interstitial) ----------

export function passwordGate(slug, errorMessage = "") {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark light">
<title>Protected link</title>
<style>
body { font: 15px/1.5 system-ui, sans-serif; background: #0b1020; color: #e8ecf7; margin: 0;
  min-height: 100vh; display: grid; place-items: center; }
@media (prefers-color-scheme: light){ body { background:#f7f8fc; color:#1a1f33; } }
.box { width: min(420px, 92vw); background: #131a33; border: 1px solid #232c4a; border-radius: 14px; padding: 22px; }
@media (prefers-color-scheme: light){ .box { background:#fff; border-color:#e3e6ef; } }
h1 { margin: 0 0 10px; font-size: 18px; }
p { margin: 0 0 14px; color: #9aa3bf; font-size: 13px; }
input { width: 100%; padding: 11px 12px; border-radius: 9px; border: 1px solid #232c4a; background: #0b1020; color: inherit; font: inherit; box-sizing: border-box; }
@media (prefers-color-scheme: light){ input { background:#f7f8fc; border-color:#e3e6ef; } }
button { width: 100%; margin-top: 12px; padding: 12px; border: 0; border-radius: 9px; background: #74a8ff; color: #0b1020; font-weight: 600; font-size: 15px; cursor: pointer; }
.err { color: #ff8181; font-size: 13px; margin-top: 8px; }
</style></head>
<body><div class="box">
  <h1>This link is password-protected</h1>
  <p>Enter the password to continue.</p>
  <form method="POST" action="/${escapeHtml(slug)}">
    <input name="password" type="password" autofocus required placeholder="Password">
    <button type="submit">Continue</button>
    ${errorMessage ? `<div class="err">${escapeHtml(errorMessage)}</div>` : ""}
  </form>
</div></body></html>`;
}

// ---------- Helpers for response helpers ----------

export function notFoundHtml(message = "This link does not exist.") {
  return `<!doctype html><meta charset="utf-8"><title>Not found</title>
<style>body{font:15px/1.5 system-ui,sans-serif;background:#0b1020;color:#e8ecf7;margin:0;min-height:100vh;display:grid;place-items:center}
@media (prefers-color-scheme: light){body{background:#f7f8fc;color:#1a1f33}}
.box{text-align:center;padding:24px}h1{margin:0 0 6px;font-size:22px}p{margin:0;color:#9aa3bf}a{color:#74a8ff}</style>
<div class="box"><h1>404 — not found</h1><p>${escapeHtml(message)}</p><p><a href="/">Go home</a></p></div>`;
}

export function goneHtml(message) {
  return `<!doctype html><meta charset="utf-8"><title>Gone</title>
<style>body{font:15px/1.5 system-ui,sans-serif;background:#0b1020;color:#e8ecf7;margin:0;min-height:100vh;display:grid;place-items:center}
@media (prefers-color-scheme: light){body{background:#f7f8fc;color:#1a1f33}}
.box{text-align:center;padding:24px}h1{margin:0 0 6px;font-size:22px}p{margin:0;color:#9aa3bf}a{color:#74a8ff}</style>
<div class="box"><h1>410 — gone</h1><p>${escapeHtml(message)}</p><p><a href="/">Go home</a></p></div>`;
}
