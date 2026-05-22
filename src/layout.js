// Shared HTML scaffolding: head, layout, common CSS, i18n hook.

import { I18N_BOOTSTRAP } from "./i18n.js";

export const COMMON_CSS = `
:root {
  --bg:#0b1020;--bg-elev:#131a33;--fg:#e8ecf7;--muted:#9aa3bf;--line:#232c4a;
  --accent:#74a8ff;--accent-fg:#0b1020;--danger:#ff8181;--ok:#74e8a3;--warn:#ffb86b;
}
@media (prefers-color-scheme: light) {
  :root { --bg:#f7f8fc;--bg-elev:#fff;--fg:#1a1f33;--muted:#5b637a;--line:#e3e6ef;--accent:#2f5fff;--accent-fg:#fff; }
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
  background: var(--bg); color: var(--fg);
  min-height: 100vh; display: flex; flex-direction: column;
  -webkit-text-size-adjust: 100%;
}
a { color: var(--accent); }
nav.top {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  padding: 10px 14px;
  border-bottom: 1px solid var(--line); background: var(--bg);
  position: sticky; top: 0; z-index: 5;
}
nav.top .brand { font-weight: 700; font-size: 16px; letter-spacing: -0.3px; }
nav.top .brand a { color: var(--fg); text-decoration: none; }
nav.top .grow { flex: 1; min-width: 8px; }
nav.top a.btn, nav.top button.btn {
  font-size: 13px; padding: 6px 11px; border-radius: 7px;
  background: transparent; color: var(--fg);
  border: 1px solid var(--line); text-decoration: none; cursor: pointer; line-height: 1;
  width: auto; margin: 0;
}
nav.top a.btn.primary { background: var(--accent); color: var(--accent-fg); border-color: transparent; }
nav.top .user { font-size: 13px; color: var(--muted); margin-right: 4px; }
nav.top .lang-btn { min-width: 38px; }
nav.top .logout-form { display: inline-flex; margin: 0; padding: 0; }
nav.top .logout-btn { width: auto; margin: 0; }
main {
  flex: 1; width: 100%; max-width: 760px; margin: 0 auto; padding: 18px 14px 60px;
}
.page-wide main { max-width: 1100px; }
.card {
  background: var(--bg-elev); border: 1px solid var(--line); border-radius: 14px;
  padding: 16px; margin-bottom: 14px;
  box-shadow: 0 1px 0 rgba(255,255,255,0.02), 0 4px 20px rgba(0,0,0,0.18);
}
.card h2 { margin: 0 0 12px; font-size: 14px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.6px; }
label { display: block; font-size: 13px; color: var(--muted); margin: 12px 0 6px; }
input[type=text], input[type=url], input[type=password], input[type=email], input[type=number], input[type=search], input[type=datetime-local], textarea, select {
  width: 100%; padding: 11px 12px;
  background: var(--bg); border: 1px solid var(--line); border-radius: 9px;
  color: var(--fg); font: inherit; outline: none; transition: border-color .15s;
  font-size: 16px; /* prevent iOS zoom on focus */
}
input:focus, textarea:focus, select:focus { border-color: var(--accent); }
.row { display: flex; gap: 10px; flex-wrap: wrap; }
.row > * { flex: 1 1 180px; min-width: 0; }
button, .btn-primary {
  margin-top: 16px; width: 100%; padding: 12px;
  border: 0; border-radius: 9px; background: var(--accent); color: var(--accent-fg);
  font-weight: 600; font-size: 15px; cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
button:disabled { opacity: 0.55; cursor: not-allowed; }
button.ghost { background: transparent; color: var(--fg); border: 1px solid var(--line); }
button.danger { background: transparent; color: var(--danger); border: 1px solid var(--line); }
button.inline { width: auto; margin: 0; padding: 7px 12px; font-size: 13px; }
.muted { color: var(--muted); font-size: 12px; margin-top: 6px; }
.tag { display: inline-block; font-size: 11px; padding: 1px 7px; border-radius: 99px;
  background: var(--bg); border: 1px solid var(--line); color: var(--muted); margin-right: 4px; }
.tag.warn { color: var(--warn); border-color: #3a2a18; }
.tag.danger { color: var(--danger); border-color: #3a1f1f; }
.tag.ok { color: var(--ok); border-color: #1f3a2a; }
.tag.admin { color: #c4a3ff; border-color: #2a1f3a; }
.tag.user { color: var(--accent); border-color: #1a2a4a; }
.tag.anon { color: var(--muted); }
.toolbar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-bottom: 10px; }
.toolbar input { flex: 1 1 200px; }
.toolbar .count { flex: 0 0 auto; }
.empty { padding: 36px 0; text-align: center; color: var(--muted); }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th, td { padding: 9px 8px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted); font-weight: 600; }
.mono { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 12px; }
.dest { max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: block; }
.copy-btn, .icon-btn {
  background: transparent; border: 1px solid var(--line); color: var(--muted);
  padding: 5px 10px; border-radius: 6px; font-size: 11px; cursor: pointer;
  margin: 0; width: auto; line-height: 1.2;
  -webkit-tap-highlight-color: transparent;
}
.icon-btn.ghost { color: var(--fg); }
.icon-btn.danger { color: var(--danger); }
.banner {
  background: var(--bg-elev); border: 1px solid var(--line); border-radius: 10px;
  padding: 11px 14px; margin-bottom: 14px; font-size: 13px; color: var(--muted);
}
.banner.error { border-color: var(--danger); color: var(--danger); }
.banner.ok { border-color: var(--ok); color: var(--ok); }
footer.foot {
  text-align: center; padding: 16px; color: var(--muted); font-size: 12px; border-top: 1px solid var(--line);
}
.advanced { margin-top: 10px; border-top: 1px dashed var(--line); padding-top: 8px; }
summary { cursor: pointer; font-size: 13px; color: var(--muted); list-style: none; padding: 6px 0; }
summary::before { content: "\\25B8  "; }
details[open] summary::before { content: "\\25BE  "; }
dialog {
  background: var(--bg-elev); color: var(--fg); border: 1px solid var(--line); border-radius: 12px;
  padding: 18px; max-width: 92vw; width: 460px;
  max-height: calc(100vh - 32px); overflow: auto;
}
dialog::backdrop { background: rgba(0,0,0,0.55); }
.actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 14px; flex-wrap: wrap; }
.actions button { width: auto; margin: 0; }
.short-result { padding: 12px; background: var(--bg); border: 1px solid var(--line); border-radius: 9px; word-break: break-all; }
.short-result.ok { border-color: var(--ok); }
.short-result.err { border-color: var(--danger); color: var(--danger); }
.short-result a { font-family: ui-monospace, monospace; font-size: 15px; }
.edit-link { font-family: ui-monospace, monospace; font-size: 12px; word-break: break-all; }
.codebox { background: var(--bg); border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; font-family: ui-monospace, monospace; font-size: 12px; word-break: break-all; }

/* ---------- Mobile (<= 640px): collapse tables to cards, tighten chrome ---------- */
@media (max-width: 640px) {
  body { font-size: 14px; }
  nav.top { padding: 8px 10px; gap: 5px; }
  nav.top .brand { font-size: 15px; }
  nav.top a.btn, nav.top button.btn { padding: 6px 9px; font-size: 12px; }
  nav.top .user { font-size: 12px; max-width: 28vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-right: 0; }
  nav.top .lang-btn { min-width: 0; padding: 6px 8px; }
  /* When signed in, drop the "My links" pill on tiny screens — the user can
     still tap @username to find it via the future link. */
  nav.top .nav-only-wide { display: none; }
  main { padding: 14px 12px 60px; }
  .card { padding: 14px; border-radius: 12px; }
  .row { gap: 8px; }
  .row > * { flex: 1 1 100%; }
  .toolbar { gap: 6px; }
  .toolbar input { flex: 1 1 100%; }
  .toolbar .inline { flex: 1 1 calc(50% - 4px); }
  dialog { width: 100%; padding: 16px; border-radius: 12px 12px 0 0; max-height: 90vh;
    margin: auto auto 0; position: fixed; left: 0; right: 0; bottom: 0; top: auto; }

  /* Card-style table on small screens. */
  table.responsive thead { display: none; }
  table.responsive, table.responsive tbody, table.responsive tr, table.responsive td { display: block; width: 100%; }
  table.responsive tr {
    border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px;
    margin-bottom: 10px; background: var(--bg);
  }
  table.responsive td {
    padding: 4px 0; border: 0;
    display: flex; gap: 8px; align-items: flex-start; justify-content: space-between;
    flex-wrap: wrap;
  }
  table.responsive td::before {
    content: attr(data-label);
    font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;
    color: var(--muted); font-weight: 600; flex: 0 0 auto;
    padding-top: 2px;
  }
  table.responsive td > * { flex: 1 1 auto; min-width: 0; }
  table.responsive td .dest { max-width: 100%; white-space: normal; overflow: visible; word-break: break-all; }
  table.responsive td.actions-cell { justify-content: flex-end; gap: 6px; padding-top: 6px; }
  table.responsive td.actions-cell::before { display: none; }
}

@media (max-width: 380px) {
  /* Squeeze a bit more for very narrow phones. */
  nav.top .brand { display: none; }
}
`;

export const FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%230b1020'/%3E%3Cpath d='M11 16h10M16 11l5 5-5 5' stroke='%2374a8ff' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round' fill='none'/%3E%3C/svg%3E";

export function navBar({ user, isAdmin }) {
  const userTag = user
    ? `<span class="user">@${escapeHtml(user.username)}</span>
       <a class="btn" href="/my" data-i18n="navMy">My links</a>
       <form method="POST" action="/api/auth/logout" class="logout-form">
         <button class="btn logout-btn" type="submit" data-i18n="navLogout">Logout</button>
       </form>`
    : isAdmin
    ? `<span class="user tag admin" data-i18n="ownerAdmin">admin</span>
       <a class="btn" href="/admin" data-i18n="navDashboard">Dashboard</a>
       <form method="POST" action="/api/auth/logout" class="logout-form">
         <button class="btn logout-btn" type="submit" data-i18n="navLogout">Logout</button>
       </form>`
    : `<a class="btn" href="/login" data-i18n="navLogin">Login</a>
       <a class="btn primary" href="/signup" data-i18n="navSignup">Sign up</a>`;
  return `<nav class="top">
    <div class="brand"><a href="/">shortr</a></div>
    <div class="grow"></div>
    <button class="btn lang-btn" id="langBtn" type="button" onclick="window.shortrToggleLang()" data-i18n="langToggle">中文</button>
    ${userTag}
  </nav>`;
}

export function pageShell({ title, body, user, isAdmin, wide = false, extraHead = "", titleKey = "" }) {
  return `<!doctype html>
<html lang="en"${titleKey ? ` data-i18n-title="${titleKey}"` : ""}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=5">
<meta name="color-scheme" content="dark light">
<meta name="theme-color" content="#0b1020" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="#f7f8fc" media="(prefers-color-scheme: light)">
<title>${escapeHtml(title)}</title>
<link rel="icon" href="${FAVICON}">
<style>${COMMON_CSS}</style>
<script>${I18N_BOOTSTRAP}</script>
${extraHead}
</head>
<body class="${wide ? "page-wide" : ""}">
${navBar({ user, isAdmin })}
<main>
${body}
</main>
<footer class="foot"><a href="https://github.com/Minis233/shortr" target="_blank" rel="noopener">github.com/Minis233/shortr</a></footer>
</body>
</html>`;
}

export function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}
