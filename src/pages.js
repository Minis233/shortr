// All HTML pages: public landing, login, signup, my-links dashboard, admin
// dashboard, password gate, edit-by-token page.
//
// Localized strings come from `src/i18n.js`. Server-side text uses `t(en)` for
// the static fallback (so users without JS still see English), and the same
// `data-i18n="key"` markers so the client bootstrap can swap them.

import { pageShell, escapeHtml } from "./layout.js";
import { I18N_DICT } from "./i18n.js";

// Server-side fallback resolver (English).
const EN = I18N_DICT.en;
const T = (k) => EN[k] || k;

// ---------- Public landing ----------

export function landingPage({ user, isAdmin, allowPublic, defaultSlugLength, maxUrlLength }) {
  const banner = !user && !isAdmin && !allowPublic
    ? `<div class="banner"><span data-i18n="landingPublicOff">${T("landingPublicOff")}</span></div>`
    : "";

  const myLink = user
    ? `<a href="/my" data-i18n="navMy">${T("navMy")}</a>`
    : `<a href="/signup" data-i18n="navSignup">${T("navSignup")}</a>`;

  const explainAccount = user
    ? `<span data-i18n="explainAccount">${T("explainAccount")}</span>`
    : `<span data-i18n="explainAnon">${T("explainAnon")}</span>`;

  const body = `${banner}
<div class="card">
<h2 data-i18n="cardShorten">${T("cardShorten")}</h2>
<form id="f" autocomplete="off">
  <label for="url" data-i18n="longUrl">${T("longUrl")}</label>
  <input id="url" name="url" type="url" data-i18n-attr="placeholder=longUrlPh"
    placeholder="${T("longUrlPh")}" required maxlength="${maxUrlLength}">

  <details class="advanced">
    <summary data-i18n="options">${T("options")}</summary>
    <div class="row">
      <div>
        <label for="slug"><span data-i18n="customSlug">${T("customSlug")}</span> <span class="muted" data-i18n="optional">${T("optional")}</span></label>
        <input id="slug" name="slug" type="text" pattern="[A-Za-z0-9_-]{1,64}" maxlength="64"
          placeholder="${T("autoSlug")} (${defaultSlugLength} ${T("chars")})">
      </div>
      <div>
        <label for="ttl"><span data-i18n="expiresIn">${T("expiresIn")}</span> <span class="muted" data-i18n="seconds">${T("seconds")}</span></label>
        <input id="ttl" name="ttl" type="number" min="60" data-i18n-attr="placeholder=never" placeholder="${T("never")}">
      </div>
    </div>
    <div class="row">
      <div>
        <label for="maxClicks"><span data-i18n="maxClicks">${T("maxClicks")}</span> <span class="muted" data-i18n="optional">${T("optional")}</span></label>
        <input id="maxClicks" name="maxClicks" type="number" min="1" data-i18n-attr="placeholder=unlimited" placeholder="${T("unlimited")}">
      </div>
      <div>
        <label for="password"><span data-i18n="password">${T("password")}</span> <span class="muted" data-i18n="optional">${T("optional")}</span></label>
        <input id="password" name="password" type="text" data-i18n-attr="placeholder=passwordPh" placeholder="${T("passwordPh")}">
      </div>
    </div>
    <label for="note"><span data-i18n="note">${T("note")}</span> <span class="muted" data-i18n="notePrivate">${T("notePrivate")}</span></label>
    <input id="note" name="note" type="text" maxlength="200" data-i18n-attr="placeholder=noteLabelPh" placeholder="${T("noteLabelPh")}">
  </details>

  <button type="submit" id="go" data-i18n="btnShorten">${T("btnShorten")}</button>
</form>
<div id="r"></div>
</div>

<div class="card">
  <h2 data-i18n="cardWhatHappens">${T("cardWhatHappens")}</h2>
  <p class="muted" style="margin:0">
    <span data-i18n="explainBase">${T("explainBase")}</span>
    ${explainAccount.replace("My links", `<a href="/my">${T("navMy")}</a>`).replace("Sign up", `<a href="/signup">${T("navSignup")}</a>`)}
  </p>
  <p class="muted" style="margin:8px 0 0">${myLink}</p>
</div>`;

  const script = `<script>${LANDING_SCRIPT}</script>`;
  return pageShell({ title: T("titleLanding"), titleKey: "titleLanding", body: body + script, user, isAdmin });
}

const LANDING_SCRIPT = `
const form = document.getElementById("f");
const out = document.getElementById("r");
const btn = document.getElementById("go");
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
  out.innerHTML = ""; btn.disabled = true; btn.textContent = window.t("btnShortening");
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
    rememberRecent({ slug: data.slug, shortUrl: data.shortUrl, url: data.url, editToken: data.editToken, editUrl: data.editUrl, expiresAt: data.expiresAt || null });
    out.innerHTML = renderResult(data);
    bindCopyButtons(out);
    form.reset();
  } catch (err) {
    out.innerHTML = '<div class="short-result err"></div>';
    out.querySelector(".short-result").textContent = String(err);
  } finally { btn.disabled = false; btn.textContent = window.t("btnShorten"); }
});

function renderResult(d) {
  const expires = d.expiresAt ? '<div class="muted">' + window.t("resultExpires") + " " + new Date(d.expiresAt).toLocaleString() + '</div>' : '';
  return [
    '<div class="short-result ok" style="margin-top:14px">',
      '<div><a href="' + d.shortUrl + '" target="_blank" rel="noopener">' + d.shortUrl + '</a>',
        '<button class="copy-btn" data-copy="' + d.shortUrl + '" style="margin-left:8px">' + window.t("btnCopy") + '</button>',
      '</div>',
      expires,
      '<div style="margin-top:10px"><span class="muted">' + window.t("resultEditUrl") + '</span>',
        '<div class="codebox edit-link" id="elnk">' + d.editUrl + '</div>',
        '<button class="copy-btn" data-copy="' + d.editUrl + '" style="margin-top:6px">' + window.t("btnCopyEdit") + '</button>',
      '</div>',
    '</div>',
  ].join("");
}

function bindCopyButtons(scope) {
  scope.querySelectorAll(".copy-btn[data-copy]").forEach((b) => {
    b.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(b.dataset.copy);
        const t = b.textContent; b.textContent = window.t("btnCopied"); setTimeout(() => b.textContent = t, 1100);
      } catch {}
    });
  });
}
`;

// ---------- Login / Signup ----------

export function authPage({ kind, error = "", username = "" }) {
  const isLogin = kind === "login";
  const heading = isLogin ? "authSignin" : "authCreate";
  const submitKey = isLogin ? "btnSignin" : "btnSignup";

  const switchPrompt = isLogin
    ? `<span data-i18n="noAccount">${T("noAccount")}</span> <a href="/signup" data-i18n="createOne">${T("createOne")}</a>`
    : `<span data-i18n="haveAccount">${T("haveAccount")}</span> <a href="/login" data-i18n="signInLink">${T("signInLink")}</a>`;

  const body = `<div class="card" style="max-width:440px;margin:30px auto">
<h2 data-i18n="${heading}">${T(heading)}</h2>
${error ? `<div class="banner error">${escapeHtml(error)}</div>` : ""}
<form method="POST" action="/api/auth/${isLogin ? "login" : "signup"}" autocomplete="${isLogin ? "on" : "off"}">
  <label data-i18n="username">${T("username")}</label>
  <input name="username" type="text" required minlength="3" maxlength="32"
    pattern="[a-zA-Z0-9._-]{3,32}" value="${escapeHtml(username)}" autofocus>
  <label data-i18n="password">${T("password")}</label>
  <input name="password" type="password" required minlength="6" maxlength="200">
  <button type="submit" data-i18n="${submitKey}">${T(submitKey)}</button>
</form>
<div class="muted" style="margin-top:14px">${switchPrompt}</div>
</div>`;

  const titleKey = isLogin ? "titleLogin" : "titleSignup";
  return pageShell({ title: T(titleKey), titleKey, body });
}

// ---------- "My links" dashboard ----------

export function myPage({ user, anonId }) {
  const whoLine = user
    ? `<span data-i18n="signedInAs">${T("signedInAs")}</span> <strong>@${escapeHtml(user.username)}</strong>`
    : `<span data-i18n="anonBrowsing">${T("anonBrowsing")}</span>`;
  const introKey = user ? "introUser" : "introAnon";

  const cookieBanner = user ? "" : `<div class='banner' style='margin-top:12px'>
    <span data-i18n="cookieBanner">${T("cookieBanner")}</span>
    <span data-i18n="cookieIdLabel">${T("cookieIdLabel")}</span>
    <code class='mono'>${escapeHtml(anonId || T("cookieIdNone"))}</code>
  </div>`;

  const body = `<div class="card">
  <h2 data-i18n="cardMyLinks">${T("cardMyLinks")}</h2>
  <div class="muted" style="margin-top:0">${whoLine}. <span data-i18n="${introKey}">${T(introKey)}</span></div>
  ${cookieBanner}
  <div class="toolbar" style="margin-top:14px">
    <button class="ghost inline" id="refresh" data-i18n="btnRefresh">${T("btnRefresh")}</button>
    <button class="ghost inline" id="newLink" type="button" data-i18n="btnNewLink">${T("btnNewLink")}</button>
    <button class="ghost inline" id="recovery" data-i18n="btnEditByToken">${T("btnEditByToken")}</button>
    <span class="muted count" id="count"></span>
  </div>
  <div id="tableWrap"></div>
</div>

<div class="card">
  <h2 data-i18n="cardCacheTitle">${T("cardCacheTitle")}</h2>
  <div class="muted" data-i18n="cardCacheHint">${T("cardCacheHint")}</div>
  <div id="cacheWrap"></div>
</div>

<dialog id="newDlg">
  <h3 style="margin:0 0 10px" data-i18n="dlgNewTitle">${T("dlgNewTitle")}</h3>
  <form id="newForm">
    <label data-i18n="longUrl">${T("longUrl")}</label>
    <input name="url" type="url" required>
    <div class="row" style="margin-top:8px">
      <div><label data-i18n="customSlug">${T("customSlug")}</label><input name="slug" type="text" pattern="[A-Za-z0-9_-]{1,64}"></div>
      <div><label><span data-i18n="expiresIn">${T("expiresIn")}</span> <span class="muted" data-i18n="seconds">${T("seconds")}</span></label><input name="ttl" type="number" min="60"></div>
    </div>
    <div class="row" style="margin-top:8px">
      <div><label data-i18n="maxClicks">${T("maxClicks")}</label><input name="maxClicks" type="number" min="1"></div>
      <div><label data-i18n="password">${T("password")}</label><input name="password" type="text"></div>
    </div>
    <label data-i18n="note">${T("note")}</label>
    <input name="note" type="text" maxlength="200">
    <div class="actions">
      <button type="button" class="ghost" id="newCancel" data-i18n="btnCancel">${T("btnCancel")}</button>
      <button type="submit" data-i18n="btnCreate">${T("btnCreate")}</button>
    </div>
  </form>
</dialog>

<dialog id="editDlg">
  <h3 style="margin:0 0 10px" data-i18n="dlgEditTitle">${T("dlgEditTitle")}</h3>
  <form id="editForm">
    <input type="hidden" id="eSlug">
    <input type="hidden" id="eTok">
    <label data-i18n="fieldSlug">${T("fieldSlug")}</label><input id="eSlugDisplay" type="text" readonly>
    <label data-i18n="fieldDestUrl">${T("fieldDestUrl")}</label><input id="eUrl" type="url" required>
    <div class="row" style="margin-top:8px">
      <div><label><span data-i18n="fieldExpiresAt">${T("fieldExpiresAt")}</span> <span class="muted" data-i18n="fieldDatetimeLocal">${T("fieldDatetimeLocal")}</span></label><input id="eExp" type="datetime-local"></div>
      <div><label data-i18n="maxClicks">${T("maxClicks")}</label><input id="eMax" type="number" min="0"></div>
    </div>
    <div class="row" style="margin-top:8px">
      <div><label data-i18n="fieldPasswordRule">${T("fieldPasswordRule")}</label><input id="ePwd" type="text"></div>
      <div><label data-i18n="note">${T("note")}</label><input id="eNote" type="text"></div>
    </div>
    <div class="actions">
      <button type="button" class="ghost" id="eCancel" data-i18n="btnCancel">${T("btnCancel")}</button>
      <button type="button" class="danger" id="eDelete" data-i18n="btnDelete">${T("btnDelete")}</button>
      <button type="submit" data-i18n="btnSave">${T("btnSave")}</button>
    </div>
  </form>
</dialog>

<dialog id="tokDlg">
  <h3 style="margin:0 0 10px" data-i18n="dlgTokenTitle">${T("dlgTokenTitle")}</h3>
  <p class="muted" style="margin:0 0 10px" data-i18n="dlgTokenHint">${T("dlgTokenHint")}</p>
  <form id="tokForm">
    <input id="tokInput" type="text" data-i18n-attr="placeholder=tokInputPh" placeholder="${T("tokInputPh")}" required>
    <div class="actions">
      <button type="button" class="ghost" id="tokCancel" data-i18n="btnCancel">${T("btnCancel")}</button>
      <button type="submit" data-i18n="btnOpen">${T("btnOpen")}</button>
    </div>
  </form>
</dialog>

<script>${MY_SCRIPT}</script>`;
  return pageShell({ title: T("titleMy"), titleKey: "titleMy", body, user, wide: true });
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
function ownerTag(o) {
  if (!o || !o.kind) return '';
  return tag(window.t("owner" + o.kind.charAt(0).toUpperCase() + o.kind.slice(1)), o.kind);
}

function rowHtml(it) {
  const flags = [];
  if (it.expiresAt) flags.push(tag(window.t("flagTtl"), "warn"));
  if (it.maxClicks) flags.push(tag(window.t("flagCap") + " " + it.maxClicks, "warn"));
  if (it.passwordHash || it.requiresPassword) flags.push(tag(window.t("flagPwd"), "danger"));
  flags.push(ownerTag(it.owner));
  return '<tr data-slug="' + it.slug + '">'
    + '<td data-label="' + esc(window.t("thSlug")) + '" class="mono"><a href="/' + it.slug + '" target="_blank" rel="noopener">' + it.slug + '</a>'
        + ' <button class="copy-btn" data-copy="' + location.origin + '/' + it.slug + '">' + window.t("btnCopy") + '</button></td>'
    + '<td data-label="' + esc(window.t("thDestination")) + '"><span class="dest mono" title="' + esc(it.url) + '">' + esc(it.url) + '</span>'
      + (it.note ? '<div class="muted">' + esc(it.note) + '</div>' : '') + '</td>'
    + '<td data-label="' + esc(window.t("thClicks")) + '">' + (it.clicks || 0) + '</td>'
    + '<td data-label="' + esc(window.t("thFlags")) + '">' + flags.join(" ") + '</td>'
    + '<td data-label="' + esc(window.t("thCreated")) + '" class="muted">' + (it.createdAt ? new Date(it.createdAt).toLocaleString() : '') + '</td>'
    + '<td class="actions-cell"><button class="icon-btn ghost" data-edit="' + it.slug + '">' + window.t("btnEdit") + '</button> '
      + '<button class="icon-btn danger" data-del="' + it.slug + '">' + window.t("btnDelete") + '</button></td>'
    + '</tr>';
}

function esc(s) { return String(s == null ? "" : s).replace(/[&<>\\"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;","'":"&#39;"})[c]); }

async function refresh() {
  try {
    const data = await api("/api/me/links");
    const wrap = $("tableWrap");
    if (!data.items.length) {
      wrap.innerHTML = '<div class="empty">' + window.t("emptyNoLinks") + ' <a href="#" id="emptyNew">' + window.t("emptyCreateFirst") + '</a></div>';
      $("count").textContent = "";
      $("emptyNew") && $("emptyNew").addEventListener("click", (e) => { e.preventDefault(); openNewDlg(); });
      renderCache();
      return;
    }
    wrap.innerHTML = '<table class="responsive"><thead><tr>'
      + '<th>' + window.t("thSlug") + '</th>'
      + '<th>' + window.t("thDestination") + '</th>'
      + '<th>' + window.t("thClicks") + '</th>'
      + '<th>' + window.t("thFlags") + '</th>'
      + '<th>' + window.t("thCreated") + '</th>'
      + '<th></th></tr><tbody>' + data.items.map(rowHtml).join("") + '</tbody></table>';
    const word = data.items.length === 1 ? window.t("countLink") : window.t("countLinks");
    $("count").textContent = data.items.length + " " + word;
  } catch (err) {
    $("tableWrap").innerHTML = '<div class="banner error">' + esc(err.message) + '</div>';
  }
  renderCache();
}

function renderCache() {
  const list = loadRecent();
  if (!list.length) { $("cacheWrap").innerHTML = '<div class="empty">' + window.t("emptyCacheNothing") + '</div>'; return; }
  $("cacheWrap").innerHTML = '<table class="responsive"><thead><tr>'
    + '<th>' + window.t("thSlug") + '</th>'
    + '<th>' + window.t("thEditUrl") + '</th>'
    + '<th>' + window.t("thSaved") + '</th>'
    + '<th></th></tr><tbody>'
    + list.map((it) => '<tr>'
        + '<td data-label="' + esc(window.t("thSlug")) + '" class="mono">' + esc(it.slug) + '</td>'
        + '<td data-label="' + esc(window.t("thEditUrl")) + '"><span class="edit-link mono">' + esc(it.editUrl) + '</span> <button class="copy-btn" data-copy="' + esc(it.editUrl) + '">' + window.t("btnCopy") + '</button></td>'
        + '<td data-label="' + esc(window.t("thSaved")) + '" class="muted">' + (it.savedAt ? new Date(it.savedAt).toLocaleString() : "") + '</td>'
        + '<td class="actions-cell"><button class="icon-btn ghost" data-tok-open="' + esc(it.editUrl) + '">' + window.t("btnOpen") + '</button>'
          + ' <button class="icon-btn danger" data-cache-drop="' + esc(it.slug) + '">' + window.t("btnForget") + '</button></td></tr>').join("")
    + '</tbody></table>';
}

function openNewDlg() { $("newDlg").showModal(); }
$("newLink").addEventListener("click", openNewDlg);
$("refresh").addEventListener("click", refresh);
$("newCancel").addEventListener("click", () => $("newDlg").close());
$("eCancel").addEventListener("click", () => $("editDlg").close());
$("tokCancel").addEventListener("click", () => $("tokDlg").close());
$("recovery").addEventListener("click", () => $("tokDlg").showModal());

window.__shortrAfterLang = function(){ refresh(); };

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
  if (t.dataset.copy) { try { await navigator.clipboard.writeText(t.dataset.copy); const old = t.textContent; t.textContent = window.t("btnCopied"); setTimeout(()=>t.textContent=old,900); } catch {} return; }
  if (t.dataset.del) {
    if (!confirm(window.t("confirmDeleteSlug", { slug: t.dataset.del }))) return;
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
  if (t.dataset.copy) { navigator.clipboard.writeText(t.dataset.copy).catch(()=>{}); const old = t.textContent; t.textContent = window.t("btnCopied"); setTimeout(()=>t.textContent=old,900); return; }
  if (t.dataset.cacheDrop) { dropRecent(t.dataset.cacheDrop); renderCache(); return; }
  if (t.dataset.tokOpen) { window.location.href = t.dataset.tokOpen; }
});

function openEdit(rec) {
  $("eSlug").value = rec.slug;
  $("eTok").value = "";
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
  if (!confirm(window.t("confirmDeleteSlug", { slug }))) return;
  try { await api("/api/me/links/" + encodeURIComponent(slug), { method: "DELETE" }); dropRecent(slug); $("editDlg").close(); await refresh(); }
  catch (err) { alert(err.message); }
});

$("tokForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const raw = $("tokInput").value.trim();
  if (!raw) return;
  let m = raw.match(/(?:^|\\/)([A-Za-z0-9_-]{1,64}):([A-Za-z0-9_-]{16,128})$/);
  if (!m) { alert(window.t("tokParseFail")); return; }
  window.location.href = "/" + m[1] + ":" + m[2];
});

refresh();
`;

// ---------- Admin dashboard ----------

export function adminPage() {
  const body = `<div class="card">
  <h2 data-i18n="cardAdmin">${T("cardAdmin")}</h2>
  <div class="toolbar" style="margin-top:14px">
    <input id="search" type="search" data-i18n-attr="placeholder=searchPh" placeholder="${T("searchPh")}">
    <button class="ghost inline" id="refresh" data-i18n="btnRefresh">${T("btnRefresh")}</button>
    <button class="ghost inline" id="newLink" data-i18n="btnNewLink">${T("btnNewLink")}</button>
    <span class="muted count" id="count"></span>
  </div>
  <div id="tableWrap"></div>
  <div style="margin-top:10px;display:flex;justify-content:flex-end;gap:8px">
    <button class="ghost inline" id="more" style="display:none" data-i18n="btnLoadMore">${T("btnLoadMore")}</button>
  </div>
</div>

<dialog id="newDlg">
  <h3 style="margin:0 0 10px" data-i18n="dlgNewTitleAdmin">${T("dlgNewTitleAdmin")}</h3>
  <form id="newForm">
    <label data-i18n="longUrl">${T("longUrl")}</label>
    <input name="url" type="url" required>
    <div class="row" style="margin-top:8px">
      <div><label data-i18n="customSlug">${T("customSlug")}</label><input name="slug" type="text" pattern="[A-Za-z0-9_-]{1,64}"></div>
      <div><label><span data-i18n="expiresIn">${T("expiresIn")}</span> <span class="muted" data-i18n="seconds">${T("seconds")}</span></label><input name="ttl" type="number" min="60"></div>
    </div>
    <div class="row" style="margin-top:8px">
      <div><label data-i18n="maxClicks">${T("maxClicks")}</label><input name="maxClicks" type="number" min="1"></div>
      <div><label data-i18n="password">${T("password")}</label><input name="password" type="text"></div>
    </div>
    <label data-i18n="note">${T("note")}</label>
    <input name="note" type="text" maxlength="200">
    <div class="actions">
      <button type="button" class="ghost" id="newCancel" data-i18n="btnCancel">${T("btnCancel")}</button>
      <button type="submit" data-i18n="btnCreate">${T("btnCreate")}</button>
    </div>
  </form>
</dialog>

<dialog id="editDlg">
  <h3 style="margin:0 0 10px" data-i18n="dlgEditTitleAdmin">${T("dlgEditTitleAdmin")}</h3>
  <form id="editForm">
    <input type="hidden" id="eSlug">
    <label data-i18n="fieldSlug">${T("fieldSlug")}</label><input id="eSlugDisplay" type="text" readonly>
    <label data-i18n="fieldDestUrl">${T("fieldDestUrl")}</label><input id="eUrl" type="url" required>
    <div class="row" style="margin-top:8px">
      <div><label data-i18n="fieldExpiresAt">${T("fieldExpiresAt")}</label><input id="eExp" type="datetime-local"></div>
      <div><label data-i18n="fieldMaxClicksZero">${T("fieldMaxClicksZero")}</label><input id="eMax" type="number" min="0"></div>
    </div>
    <div class="row" style="margin-top:8px">
      <div><label data-i18n="fieldPasswordRule">${T("fieldPasswordRule")}</label><input id="ePwd" type="text"></div>
      <div><label data-i18n="note">${T("note")}</label><input id="eNote" type="text"></div>
    </div>
    <label data-i18n="fieldOwner">${T("fieldOwner")}</label>
    <input id="eOwner" type="text" readonly class="mono">
    <div class="actions">
      <button type="button" class="ghost" id="eCancel" data-i18n="btnCancel">${T("btnCancel")}</button>
      <button type="button" class="danger" id="eDelete" data-i18n="btnDelete">${T("btnDelete")}</button>
      <button type="submit" data-i18n="btnSave">${T("btnSave")}</button>
    </div>
  </form>
</dialog>

<script>${ADMIN_SCRIPT}</script>`;
  return pageShell({ title: T("titleAdmin"), titleKey: "titleAdmin", body, isAdmin: true, wide: true });
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
function ownerTag(o) { if (!o || !o.kind) return ''; return tag(window.t("owner" + o.kind.charAt(0).toUpperCase() + o.kind.slice(1)), o.kind); }

function rowHtml(it) {
  const flags = [];
  if (it.expiresAt) flags.push(tag(window.t("flagTtl"), "warn"));
  if (it.maxClicks) flags.push(tag(window.t("flagCap") + " " + it.maxClicks, "warn"));
  if (it.passwordHash) flags.push(tag(window.t("flagPwd"), "danger"));
  flags.push(ownerTag(it.owner));
  return '<tr>'
    + '<td data-label="' + esc(window.t("thSlug")) + '" class="mono"><a href="/' + it.slug + '" target="_blank" rel="noopener">' + it.slug + '</a></td>'
    + '<td data-label="' + esc(window.t("thDestination")) + '"><span class="dest mono" title="' + esc(it.url) + '">' + esc(it.url) + '</span>'
    + (it.note ? '<div class="muted">' + esc(it.note) + '</div>' : '') + '</td>'
    + '<td data-label="' + esc(window.t("thClicks")) + '">' + (it.clicks || 0) + '</td>'
    + '<td data-label="' + esc(window.t("thFlags")) + '">' + flags.join(" ") + '</td>'
    + '<td data-label="' + esc(window.t("thCreated")) + '" class="muted">' + (it.createdAt ? new Date(it.createdAt).toLocaleString() : "") + '</td>'
    + '<td class="actions-cell"><button class="icon-btn ghost" data-edit="' + esc(it.slug) + '">' + window.t("btnEdit") + '</button>'
      + ' <button class="icon-btn danger" data-del="' + esc(it.slug) + '">' + window.t("btnDelete") + '</button></td></tr>';
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
    $("tableWrap").innerHTML = '<div class="empty">' + window.t("emptyNoLinks") + '</div>'; $("count").textContent = ""; return;
  }
  if (reset) {
    $("tableWrap").innerHTML = '<table class="responsive"><thead><tr>'
      + '<th>' + window.t("thSlug") + '</th>'
      + '<th>' + window.t("thDestination") + '</th>'
      + '<th>' + window.t("thClicks") + '</th>'
      + '<th>' + window.t("thFlags") + '</th>'
      + '<th>' + window.t("thCreated") + '</th>'
      + '<th></th></tr><tbody></tbody></table>';
  }
  const tbody = $("tableWrap").querySelector("tbody");
  tbody.insertAdjacentHTML("beforeend", data.items.map(rowHtml).join(""));
  $("count").textContent = tbody.children.length + " " + window.t("countShown");
}

window.__shortrAfterLang = function(){ load(true); };

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
    if (!confirm(window.t("confirmDeleteSlug", { slug: t.dataset.del }))) return;
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
  if (!confirm(window.t("confirmDeleteSlug", { slug }))) return;
  try { await api("/api/admin/links/" + encodeURIComponent(slug), { method: "DELETE" }); $("editDlg").close(); await load(true); } catch (err) { alert(err.message); }
});

function toLocalInput(ms) { const d = new Date(ms); const p = (n) => String(n).padStart(2,"0"); return d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate())+"T"+p(d.getHours())+":"+p(d.getMinutes()); }
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

load(true);
`;

// ---------- Edit by token page ----------

export function tokenEditPage({ slug, link, error = "", flash = "" }) {
  const titleHtml = T("editPageTitle").replace("{slug}", escapeHtml(slug));
  const body = `<div class="card" style="max-width:560px;margin:30px auto">
  <h2>${titleHtml}</h2>
  ${error ? `<div class="banner error">${escapeHtml(error)}</div>` : ""}
  ${flash ? `<div class="banner ok">${escapeHtml(flash)}</div>` : ""}
  ${link ? `
  <div class="muted" data-i18n="editPageHint">${T("editPageHint")}</div>
  <form method="POST" action="" autocomplete="off" id="editForm">
    <input type="hidden" name="action" value="update">
    <label data-i18n="fieldDestUrl">${T("fieldDestUrl")}</label>
    <input name="url" type="url" required value="${escapeHtml(link.url)}">
    <div class="row" style="margin-top:8px">
      <div><label data-i18n="fieldExpiresAt">${T("fieldExpiresAt")}</label><input name="expiresAtLocal" type="datetime-local" value="${link.expiresAt ? localInput(link.expiresAt) : ""}"></div>
      <div><label data-i18n="fieldMaxClicksZero">${T("fieldMaxClicksZero")}</label><input name="maxClicks" type="number" min="0" value="${link.maxClicks || ""}"></div>
    </div>
    <div class="row" style="margin-top:8px">
      <div><label data-i18n="fieldPasswordRule">${T("fieldPasswordRule")}</label><input name="password" type="text"></div>
      <div><label data-i18n="note">${T("note")}</label><input name="note" type="text" value="${escapeHtml(link.note || "")}"></div>
    </div>
    <button type="submit" data-i18n="btnSaveChanges">${T("btnSaveChanges")}</button>
  </form>
  <form method="POST" action="" style="margin-top:14px" onsubmit="return confirm(window.t('confirmDelete'))">
    <input type="hidden" name="action" value="delete">
    <button type="submit" class="danger" data-i18n="btnDeleteThis">${T("btnDeleteThis")}</button>
  </form>
  <div class="muted" style="margin-top:18px">
    <span data-i18n="fieldSlug">${T("fieldSlug")}</span>: <code class="mono">${escapeHtml(slug)}</code><br>
    <span data-i18n="metaCreated">${T("metaCreated")}</span> ${link.createdAt ? new Date(link.createdAt).toLocaleString() : "(unknown)"}<br>
    <span data-i18n="metaClicks">${T("metaClicks")}</span> ${link.clicks || 0}
  </div>` : `<div class="muted" data-i18n="notFoundOrInvalid">${T("notFoundOrInvalid")}</div>`}
</div>`;
  return pageShell({ title: T("titleEdit"), titleKey: "titleEdit", body });
}

function localInput(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ---------- Password gate (interstitial) ----------

export function passwordGate(slug, errorMessage = "") {
  // Use the full pageShell so the gate also gets the language toggle.
  const body = `<div class="card" style="max-width:420px;margin:30px auto">
  <h2 data-i18n="gateHeader">${T("gateHeader")}</h2>
  <p class="muted" style="margin:0 0 14px" data-i18n="gateHint">${T("gateHint")}</p>
  <form method="POST" action="/${escapeHtml(slug)}">
    <input name="password" type="password" autofocus required data-i18n-attr="placeholder=password" placeholder="${T("password")}">
    <button type="submit" data-i18n="btnContinue">${T("btnContinue")}</button>
    ${errorMessage ? `<div class="banner error" style="margin-top:10px">${escapeHtml(errorMessage)}</div>` : ""}
  </form>
</div>`;
  return pageShell({ title: T("titleProtected"), titleKey: "titleProtected", body });
}

// ---------- 404 / 410 ----------

export function notFoundHtml(message = "") {
  const body = `<div class="card" style="max-width:420px;margin:30px auto;text-align:center">
    <h2 data-i18n="notFoundH1">${T("notFoundH1")}</h2>
    <p class="muted" data-i18n="notFoundBody">${escapeHtml(message) || T("notFoundBody")}</p>
    <p><a href="/" data-i18n="goneHome">${T("goneHome")}</a></p>
  </div>`;
  return pageShell({ title: T("titleNotFound"), titleKey: "titleNotFound", body });
}

export function goneHtml(message) {
  // `message` is server-injected English; expose a key client-side via class
  // so the language toggle can still translate the common reasons.
  const isExpired = /expired/i.test(message || "");
  const isCapped = /click limit/i.test(message || "");
  const reasonKey = isExpired ? "goneExpired" : isCapped ? "goneCapped" : null;

  const body = `<div class="card" style="max-width:420px;margin:30px auto;text-align:center">
    <h2 data-i18n="goneH1">${T("goneH1")}</h2>
    <p class="muted"${reasonKey ? ` data-i18n="${reasonKey}"` : ""}>${escapeHtml(message)}</p>
    <p><a href="/" data-i18n="goneHome">${T("goneHome")}</a></p>
  </div>`;
  return pageShell({ title: T("titleGone"), titleKey: "titleGone", body });
}
