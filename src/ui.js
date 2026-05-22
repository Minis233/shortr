// Public landing page: a single-file HTML form that hits POST /api/shorten.

export function publicHtml({ allowPublic, defaultSlugLength, maxUrlLength }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark light">
<title>shortr — URL shortener</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%230b1020'/%3E%3Cpath d='M11 16h10M16 11l5 5-5 5' stroke='%2374a8ff' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round' fill='none'/%3E%3C/svg%3E">
<style>
:root {
  --bg: #0b1020;
  --bg-elev: #131a33;
  --fg: #e8ecf7;
  --muted: #9aa3bf;
  --line: #232c4a;
  --accent: #74a8ff;
  --accent-fg: #0b1020;
  --danger: #ff8181;
  --ok: #74e8a3;
}
@media (prefers-color-scheme: light) {
  :root {
    --bg: #f7f8fc;
    --bg-elev: #ffffff;
    --fg: #1a1f33;
    --muted: #5b637a;
    --line: #e3e6ef;
    --accent: #2f5fff;
    --accent-fg: #ffffff;
  }
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  background: var(--bg);
  color: var(--fg);
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
header {
  padding: 28px 20px 12px;
  text-align: center;
}
header h1 {
  margin: 0 0 4px;
  font-size: 28px;
  letter-spacing: -0.5px;
}
header p { margin: 0; color: var(--muted); font-size: 14px; }
main {
  flex: 1;
  width: 100%;
  max-width: 640px;
  margin: 0 auto;
  padding: 16px 20px 60px;
}
.card {
  background: var(--bg-elev);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 18px;
  box-shadow: 0 1px 0 rgba(255,255,255,0.02), 0 4px 20px rgba(0,0,0,0.18);
}
label {
  display: block;
  font-size: 13px;
  color: var(--muted);
  margin: 12px 0 6px;
}
input[type=text], input[type=url], input[type=password], input[type=number], textarea {
  width: 100%;
  padding: 11px 12px;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 9px;
  color: var(--fg);
  font: inherit;
  outline: none;
  transition: border-color .15s;
}
input:focus, textarea:focus { border-color: var(--accent); }
.row { display: flex; gap: 10px; flex-wrap: wrap; }
.row > * { flex: 1 1 140px; min-width: 0; }
button {
  margin-top: 16px;
  width: 100%;
  padding: 12px;
  border: 0;
  border-radius: 9px;
  background: var(--accent);
  color: var(--accent-fg);
  font-weight: 600;
  font-size: 15px;
  cursor: pointer;
}
button:disabled { opacity: 0.6; cursor: not-allowed; }
.result {
  margin-top: 14px;
  padding: 14px;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 9px;
  display: none;
  word-break: break-all;
}
.result.show { display: block; }
.result.error { border-color: var(--danger); color: var(--danger); }
.result.ok { border-color: var(--ok); }
.result .short {
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  font-size: 16px;
  color: var(--accent);
}
.result .copy {
  margin-left: 8px;
  background: transparent;
  border: 1px solid var(--line);
  color: var(--muted);
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  width: auto;
  margin-top: 0;
  cursor: pointer;
  display: inline-block;
}
.muted { color: var(--muted); font-size: 12px; margin-top: 6px; }
.advanced {
  margin-top: 10px;
  border-top: 1px dashed var(--line);
  padding-top: 8px;
}
summary {
  cursor: pointer;
  font-size: 13px;
  color: var(--muted);
  list-style: none;
  padding: 6px 0;
}
summary::before { content: "▸  "; }
details[open] summary::before { content: "▾  "; }
footer {
  text-align: center;
  padding: 18px;
  color: var(--muted);
  font-size: 12px;
  border-top: 1px solid var(--line);
}
footer a { color: var(--muted); }
.banner {
  background: var(--bg-elev);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 12px 14px;
  margin-bottom: 14px;
  font-size: 13px;
  color: var(--muted);
}
</style>
</head>
<body>
<header>
  <h1>shortr</h1>
  <p>Tiny URL shortener on Cloudflare Workers + KV.</p>
</header>
<main>
  ${
    allowPublic
      ? ""
      : `<div class="banner">This instance has public shortening disabled. Provide an API token in the field below to create links.</div>`
  }
  <div class="card">
    <form id="f" autocomplete="off">
      <label for="url">Long URL</label>
      <input id="url" name="url" type="url" placeholder="https://example.com/some/very/long/path"
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
        ${
          allowPublic
            ? ""
            : `<label for="token">API token</label>
        <input id="token" name="token" type="password" placeholder="UPLOAD_TOKEN" required>`
        }
      </details>

      <button type="submit" id="go">Shorten</button>
    </form>
    <div id="r" class="result"></div>
  </div>
</main>
<footer>
  <a href="https://github.com/Minis233/shortr" target="_blank" rel="noopener">github.com/Minis233/shortr</a>
</footer>
<script>
const form = document.getElementById("f");
const out = document.getElementById("r");
const btn = document.getElementById("go");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  out.className = "result";
  out.textContent = "";
  btn.disabled = true;
  btn.textContent = "Shortening...";

  const body = {
    url: form.url.value,
    slug: form.slug.value || undefined,
    ttl: form.ttl.value ? Number(form.ttl.value) : undefined,
    maxClicks: form.maxClicks.value ? Number(form.maxClicks.value) : undefined,
    password: form.password.value || undefined,
    note: form.note.value || undefined,
  };
  const headers = { "content-type": "application/json" };
  if (form.token && form.token.value) {
    headers["authorization"] = "Bearer " + form.token.value;
  }
  try {
    const res = await fetch("/api/shorten", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      out.className = "result show error";
      out.textContent = data.error || ("Failed (" + res.status + ")");
      return;
    }
    out.className = "result show ok";
    out.innerHTML = "";
    const a = document.createElement("a");
    a.className = "short";
    a.href = data.shortUrl;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = data.shortUrl;
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "copy";
    copy.textContent = "Copy";
    copy.onclick = async () => {
      try { await navigator.clipboard.writeText(data.shortUrl); copy.textContent = "Copied"; setTimeout(()=>copy.textContent="Copy", 1200); } catch {}
    };
    out.appendChild(a);
    out.appendChild(copy);
    if (data.expiresAt) {
      const small = document.createElement("div");
      small.className = "muted";
      small.textContent = "Expires " + new Date(data.expiresAt).toLocaleString();
      out.appendChild(small);
    }
  } catch (err) {
    out.className = "result show error";
    out.textContent = String(err);
  } finally {
    btn.disabled = false;
    btn.textContent = "Shorten";
  }
});
</script>
</body>
</html>`;
}

// Password gate page shown before redirecting a password-protected link.
export function passwordGateHtml(slug, errorMessage = "") {
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
input { width: 100%; padding: 11px 12px; border-radius: 9px; border: 1px solid #232c4a; background: #0b1020; color: inherit; font: inherit; }
@media (prefers-color-scheme: light){ input { background:#f7f8fc; border-color:#e3e6ef; } }
button { width: 100%; margin-top: 12px; padding: 12px; border: 0; border-radius: 9px; background: #74a8ff; color: #0b1020; font-weight: 600; font-size: 15px; cursor: pointer; }
.err { color: #ff8181; font-size: 13px; margin-top: 8px; }
</style></head>
<body><div class="box">
  <h1>This link is password-protected</h1>
  <p>Enter the password to continue.</p>
  <form method="POST" action="/${slug}">
    <input name="password" type="password" autofocus required placeholder="Password">
    <button type="submit">Continue</button>
    ${errorMessage ? `<div class="err">${errorMessage}</div>` : ""}
  </form>
</div></body></html>`;
}
