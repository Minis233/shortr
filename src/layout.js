// Shared HTML scaffolding: head, layout, common CSS.

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
  font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: var(--bg); color: var(--fg);
  min-height: 100vh; display: flex; flex-direction: column;
}
a { color: var(--accent); }
nav.top {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 18px; border-bottom: 1px solid var(--line);
  background: var(--bg);
}
nav.top .brand { font-weight: 700; font-size: 16px; letter-spacing: -0.3px; }
nav.top .brand a { color: var(--fg); text-decoration: none; }
nav.top .grow { flex: 1; }
nav.top a.btn, nav.top button.btn {
  font-size: 13px; padding: 6px 12px; border-radius: 7px;
  background: transparent; color: var(--fg);
  border: 1px solid var(--line); text-decoration: none; cursor: pointer;
}
nav.top a.btn.primary { background: var(--accent); color: var(--accent-fg); border-color: transparent; }
nav.top .user { font-size: 13px; color: var(--muted); margin-right: 6px; }
main {
  flex: 1; width: 100%; max-width: 760px; margin: 0 auto; padding: 22px 18px 60px;
}
.page-wide main { max-width: 1100px; }
.card {
  background: var(--bg-elev); border: 1px solid var(--line); border-radius: 14px;
  padding: 18px; margin-bottom: 16px;
  box-shadow: 0 1px 0 rgba(255,255,255,0.02), 0 4px 20px rgba(0,0,0,0.18);
}
.card h2 { margin: 0 0 12px; font-size: 14px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.6px; }
label { display: block; font-size: 13px; color: var(--muted); margin: 12px 0 6px; }
input[type=text], input[type=url], input[type=password], input[type=email], input[type=number], input[type=search], textarea, select {
  width: 100%; padding: 10px 12px;
  background: var(--bg); border: 1px solid var(--line); border-radius: 9px;
  color: var(--fg); font: inherit; outline: none; transition: border-color .15s;
}
input:focus, textarea:focus, select:focus { border-color: var(--accent); }
.row { display: flex; gap: 10px; flex-wrap: wrap; }
.row > * { flex: 1 1 180px; min-width: 0; }
button, .btn-primary {
  margin-top: 16px; width: 100%; padding: 12px;
  border: 0; border-radius: 9px; background: var(--accent); color: var(--accent-fg);
  font-weight: 600; font-size: 15px; cursor: pointer;
}
button:disabled { opacity: 0.55; cursor: not-allowed; }
button.ghost { background: transparent; color: var(--fg); border: 1px solid var(--line); }
button.danger { background: transparent; color: var(--danger); border: 1px solid var(--line); }
button.inline { width: auto; margin: 0; padding: 6px 12px; font-size: 13px; }
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
.toolbar input { flex: 1 1 240px; }
.empty { padding: 36px 0; text-align: center; color: var(--muted); }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th, td { padding: 9px 8px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted); font-weight: 600; }
.mono { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 12px; }
.dest { max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: block; }
.copy-btn, .icon-btn {
  background: transparent; border: 1px solid var(--line); color: var(--muted);
  padding: 4px 9px; border-radius: 6px; font-size: 11px; cursor: pointer;
  margin: 0; width: auto;
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
summary::before { content: "▸  "; }
details[open] summary::before { content: "▾  "; }
dialog { background: var(--bg-elev); color: var(--fg); border: 1px solid var(--line); border-radius: 12px; padding: 18px; max-width: 90vw; width: 460px; }
dialog::backdrop { background: rgba(0,0,0,0.55); }
.actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 14px; }
.actions button { width: auto; margin: 0; }
.short-result { padding: 12px; background: var(--bg); border: 1px solid var(--line); border-radius: 9px; word-break: break-all; }
.short-result.ok { border-color: var(--ok); }
.short-result.err { border-color: var(--danger); color: var(--danger); }
.short-result a { font-family: ui-monospace, monospace; font-size: 15px; }
.edit-link { font-family: ui-monospace, monospace; font-size: 12px; word-break: break-all; }
.codebox { background: var(--bg); border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; font-family: ui-monospace, monospace; font-size: 12px; word-break: break-all; }
`;

export const FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%230b1020'/%3E%3Cpath d='M11 16h10M16 11l5 5-5 5' stroke='%2374a8ff' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round' fill='none'/%3E%3C/svg%3E";

export function navBar({ user, isAdmin }) {
  const userTag = user
    ? `<span class="user">@${escapeHtml(user.username)}</span>
       <a class="btn" href="/my">My links</a>
       <form method="POST" action="/api/auth/logout" style="display:inline;margin:0">
         <button class="btn" type="submit">Logout</button>
       </form>`
    : isAdmin
    ? `<span class="user tag admin">admin</span>
       <a class="btn" href="/admin">Dashboard</a>
       <form method="POST" action="/api/auth/logout" style="display:inline;margin:0">
         <button class="btn" type="submit">Logout</button>
       </form>`
    : `<a class="btn" href="/login">Login</a>
       <a class="btn primary" href="/signup">Sign up</a>`;
  return `<nav class="top">
    <div class="brand"><a href="/">shortr</a></div>
    <div class="grow"></div>
    ${userTag}
  </nav>`;
}

export function pageShell({ title, body, user, isAdmin, wide = false, extraHead = "" }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark light">
<title>${escapeHtml(title)}</title>
<link rel="icon" href="${FAVICON}">
<style>${COMMON_CSS}</style>
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
