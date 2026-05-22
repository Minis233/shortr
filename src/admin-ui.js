// Admin dashboard: a single-file HTML app that talks to /api/* using a
// Bearer token stored in localStorage.

export function adminHtml() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark light">
<meta name="robots" content="noindex,nofollow">
<title>shortr — admin</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%230b1020'/%3E%3Cpath d='M11 16h10M16 11l5 5-5 5' stroke='%2374a8ff' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round' fill='none'/%3E%3C/svg%3E">
<style>
:root {
  --bg:#0b1020;--bg-elev:#131a33;--fg:#e8ecf7;--muted:#9aa3bf;--line:#232c4a;
  --accent:#74a8ff;--accent-fg:#0b1020;--danger:#ff8181;--ok:#74e8a3;
}
@media (prefers-color-scheme: light) {
  :root { --bg:#f7f8fc;--bg-elev:#fff;--fg:#1a1f33;--muted:#5b637a;--line:#e3e6ef;--accent:#2f5fff;--accent-fg:#fff; }
}
*{box-sizing:border-box}html,body{margin:0;padding:0}
body{font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:var(--bg);color:var(--fg);min-height:100vh}
header{padding:16px 20px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:12px}
header h1{margin:0;font-size:18px;font-weight:600}
header .grow{flex:1}
header .who{font-size:12px;color:var(--muted)}
main{padding:18px 20px;max-width:1100px;margin:0 auto}
.card{background:var(--bg-elev);border:1px solid var(--line);border-radius:12px;padding:16px;margin-bottom:16px}
.card h2{margin:0 0 12px;font-size:14px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:0.6px}
input,select,textarea{width:100%;padding:9px 10px;background:var(--bg);border:1px solid var(--line);border-radius:8px;color:var(--fg);font:inherit;outline:none}
input:focus{border-color:var(--accent)}
button{background:var(--accent);color:var(--accent-fg);border:0;padding:9px 14px;border-radius:8px;cursor:pointer;font:inherit;font-weight:600}
button.ghost{background:transparent;color:var(--fg);border:1px solid var(--line)}
button.danger{background:transparent;color:var(--danger);border:1px solid var(--line)}
button:disabled{opacity:0.55;cursor:not-allowed}
.row{display:flex;gap:10px;flex-wrap:wrap}.row > *{flex:1 1 180px;min-width:0}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{padding:9px 8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
th{font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:var(--muted);font-weight:600}
.mono{font-family:ui-monospace,"SF Mono",Menlo,monospace;font-size:12px}
.dest{max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block}
.tag{display:inline-block;font-size:11px;padding:1px 7px;border-radius:99px;background:var(--bg);border:1px solid var(--line);color:var(--muted);margin-right:4px}
.tag.warn{color:#ffb86b;border-color:#3a2a18}
.tag.danger{color:var(--danger);border-color:#3a1f1f}
.tag.ok{color:var(--ok);border-color:#1f3a2a}
.toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px}
.toolbar input{flex:1 1 240px}
.muted{color:var(--muted);font-size:12px}
.empty{padding:40px 0;text-align:center;color:var(--muted)}
.kbd{font-family:ui-monospace,monospace;font-size:11px;padding:2px 6px;background:var(--bg);border:1px solid var(--line);border-radius:4px}
dialog{background:var(--bg-elev);color:var(--fg);border:1px solid var(--line);border-radius:12px;padding:18px;max-width:90vw;width:420px}
dialog::backdrop{background:rgba(0,0,0,0.55)}
.actions{display:flex;gap:8px;justify-content:flex-end;margin-top:14px}
.icon-btn{padding:5px 8px;font-size:12px}
.copy-btn{background:transparent;border:1px solid var(--line);color:var(--muted);padding:3px 8px;border-radius:5px;font-size:11px;cursor:pointer;margin-left:6px}
</style>
</head>
<body>
<header>
  <h1>shortr <span class="muted">admin</span></h1>
  <div class="grow"></div>
  <div class="who muted" id="who"></div>
  <button class="ghost icon-btn" id="logout">Logout</button>
</header>
<main>

<section class="card" id="loginCard" style="display:none">
  <h2>Sign in</h2>
  <form id="loginForm">
    <label class="muted" for="tk">Admin token</label>
    <input id="tk" type="password" autocomplete="off" placeholder="ADMIN_TOKEN" required>
    <div class="actions">
      <button type="submit">Continue</button>
    </div>
    <div class="muted" id="loginErr" style="color:var(--danger)"></div>
  </form>
</section>

<section class="card" id="createCard" style="display:none">
  <h2>Create link</h2>
  <form id="createForm" autocomplete="off">
    <div class="row">
      <input id="cUrl" type="url" placeholder="Long URL" required>
      <input id="cSlug" type="text" pattern="[A-Za-z0-9_-]{1,64}" placeholder="Custom slug (optional)">
    </div>
    <div class="row" style="margin-top:10px">
      <input id="cTtl" type="number" min="60" placeholder="TTL seconds (optional)">
      <input id="cMax" type="number" min="1" placeholder="Max clicks (optional)">
      <input id="cPwd" type="text" placeholder="Password (optional)">
      <input id="cNote" type="text" placeholder="Note (optional)">
    </div>
    <div class="actions">
      <button type="submit" id="cBtn">Shorten</button>
    </div>
    <div id="cOut" class="muted"></div>
  </form>
</section>

<section class="card" id="listCard" style="display:none">
  <h2>Links</h2>
  <div class="toolbar">
    <input id="search" type="search" placeholder="Filter slug prefix...">
    <button class="ghost" id="refresh">Refresh</button>
    <span class="muted" id="count"></span>
  </div>
  <div id="tableWrap"></div>
  <div style="margin-top:10px;display:flex;justify-content:flex-end;gap:8px">
    <button class="ghost" id="more" style="display:none">Load more</button>
  </div>
</section>

<dialog id="editDlg">
  <h3 style="margin:0 0 10px">Edit link</h3>
  <form id="editForm">
    <input type="hidden" id="eSlug">
    <label class="muted">Destination URL</label>
    <input id="eUrl" type="url" required>
    <div class="row" style="margin-top:8px">
      <div>
        <label class="muted">Expires at (epoch ms, blank = never)</label>
        <input id="eExp" type="number">
      </div>
      <div>
        <label class="muted">Max clicks (blank = unlimited)</label>
        <input id="eMax" type="number" min="0">
      </div>
    </div>
    <div class="row" style="margin-top:8px">
      <div>
        <label class="muted">New password (blank = keep, "-" = remove)</label>
        <input id="ePwd" type="text">
      </div>
      <div>
        <label class="muted">Note</label>
        <input id="eNote" type="text">
      </div>
    </div>
    <div class="actions">
      <button type="button" class="ghost" id="eCancel">Cancel</button>
      <button type="submit">Save</button>
    </div>
  </form>
</dialog>

</main>
<script>
const TK_KEY = "shortr.admin.token";
let token = localStorage.getItem(TK_KEY) || "";
let cursor = null;

const $ = (id) => document.getElementById(id);

function setLogged(on) {
  $("loginCard").style.display = on ? "none" : "block";
  $("createCard").style.display = on ? "block" : "none";
  $("listCard").style.display = on ? "block" : "none";
  $("logout").style.display = on ? "inline-block" : "none";
  $("who").textContent = on ? "authenticated" : "";
}

async function api(path, opts = {}) {
  const headers = { "content-type": "application/json", ...(opts.headers || {}) };
  if (token) headers.authorization = "Bearer " + token;
  const res = await fetch(path, { ...opts, headers });
  let data;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok) {
    const msg = (data && data.error) || ("HTTP " + res.status);
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return data;
}

$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("loginErr").textContent = "";
  token = $("tk").value.trim();
  try {
    await api("/api/me");
    localStorage.setItem(TK_KEY, token);
    setLogged(true);
    await load(true);
  } catch (err) {
    token = "";
    $("loginErr").textContent = err.message;
  }
});

$("logout").addEventListener("click", () => {
  token = "";
  localStorage.removeItem(TK_KEY);
  setLogged(false);
  $("tableWrap").innerHTML = "";
});

$("createForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("cBtn"); btn.disabled = true;
  $("cOut").textContent = "";
  try {
    const body = {
      url: $("cUrl").value,
      slug: $("cSlug").value || undefined,
      ttl: $("cTtl").value ? Number($("cTtl").value) : undefined,
      maxClicks: $("cMax").value ? Number($("cMax").value) : undefined,
      password: $("cPwd").value || undefined,
      note: $("cNote").value || undefined,
    };
    const data = await api("/api/shorten", { method: "POST", body: JSON.stringify(body) });
    $("cOut").innerHTML = "Created <a class='mono' href='" + data.shortUrl + "' target='_blank' rel='noopener'>" + data.shortUrl + "</a>";
    $("createForm").reset();
    await load(true);
  } catch (err) {
    $("cOut").textContent = "Error: " + err.message;
    $("cOut").style.color = "var(--danger)";
  } finally { btn.disabled = false; }
});

function rowHtml(it) {
  const flags = [];
  if (it.expiresAt) flags.push("<span class='tag warn'>TTL</span>");
  if (it.maxClicks) flags.push("<span class='tag warn'>cap " + it.maxClicks + "</span>");
  if (it.passwordHash) flags.push("<span class='tag danger'>pwd</span>");
  return "<tr data-slug='" + it.slug + "'>"
    + "<td class='mono'><a href='/" + it.slug + "' target='_blank' rel='noopener'>" + it.slug + "</a><button class='copy-btn' data-copy='/" + it.slug + "'>copy</button></td>"
    + "<td><span class='dest mono' title='" + escapeAttr(it.url) + "'>" + escapeHtml(it.url) + "</span>" + (it.note ? "<div class='muted'>" + escapeHtml(it.note) + "</div>" : "") + "</td>"
    + "<td>" + (it.clicks || 0) + "</td>"
    + "<td>" + flags.join(" ") + "</td>"
    + "<td>" + new Date(it.createdAt).toLocaleString() + "</td>"
    + "<td><button class='ghost icon-btn' data-edit='" + it.slug + "'>Edit</button> <button class='danger icon-btn' data-del='" + it.slug + "'>Delete</button></td>"
    + "</tr>";
}

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;","'":"&#39;"})[c]); }
function escapeAttr(s) { return escapeHtml(s); }

async function load(reset) {
  if (reset) cursor = null;
  const prefix = $("search").value.trim();
  const data = await api("/api/list?prefix=" + encodeURIComponent(prefix) + (cursor ? "&cursor=" + encodeURIComponent(cursor) : ""));
  cursor = data.cursor;
  $("more").style.display = cursor ? "inline-block" : "none";
  if (reset) $("tableWrap").innerHTML = "";

  if (!data.items.length && reset) {
    $("tableWrap").innerHTML = "<div class='empty'>No links yet.</div>";
    $("count").textContent = "";
    return;
  }
  if (reset) {
    $("tableWrap").innerHTML = "<table><thead><tr><th>Slug</th><th>Destination</th><th>Clicks</th><th>Flags</th><th>Created</th><th></th></tr><tbody></tbody></table>";
  }
  const tbody = $("tableWrap").querySelector("tbody");
  tbody.insertAdjacentHTML("beforeend", data.items.map(rowHtml).join(""));
  $("count").textContent = tbody.children.length + " shown";
}

$("refresh").addEventListener("click", () => load(true));
$("search").addEventListener("input", debounce(() => load(true), 200));
$("more").addEventListener("click", () => load(false));

$("tableWrap").addEventListener("click", async (e) => {
  const t = e.target.closest("button");
  if (!t) return;
  if (t.dataset.copy) {
    try { await navigator.clipboard.writeText(location.origin + t.dataset.copy); t.textContent = "copied"; setTimeout(()=>t.textContent="copy",900); } catch {}
    return;
  }
  if (t.dataset.del) {
    if (!confirm("Delete /" + t.dataset.del + "?")) return;
    try { await api("/api/links/" + t.dataset.del, { method: "DELETE" }); await load(true); } catch (err) { alert(err.message); }
    return;
  }
  if (t.dataset.edit) {
    const slug = t.dataset.edit;
    try {
      const data = await api("/api/links/" + slug);
      $("eSlug").value = slug;
      $("eUrl").value = data.url;
      $("eExp").value = data.expiresAt || "";
      $("eMax").value = data.maxClicks || "";
      $("ePwd").value = "";
      $("eNote").value = data.note || "";
      $("editDlg").showModal();
    } catch (err) { alert(err.message); }
  }
});

$("eCancel").addEventListener("click", () => $("editDlg").close());
$("editForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const slug = $("eSlug").value;
  const body = {
    url: $("eUrl").value,
    expiresAt: $("eExp").value ? Number($("eExp").value) : null,
    maxClicks: $("eMax").value ? Number($("eMax").value) : null,
    password: $("ePwd").value === "" ? undefined : $("ePwd").value,
    note: $("eNote").value || "",
  };
  try {
    await api("/api/links/" + slug, { method: "PATCH", body: JSON.stringify(body) });
    $("editDlg").close();
    await load(true);
  } catch (err) { alert(err.message); }
});

function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

(async function init() {
  if (token) {
    try { await api("/api/me"); setLogged(true); await load(true); return; } catch {}
    token = ""; localStorage.removeItem(TK_KEY);
  }
  setLogged(false);
})();
</script>
</body>
</html>`;
}
