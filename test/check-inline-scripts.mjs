// Validate that the inline <script> blocks inside generated HTML pages parse.
import { landingPage, myPage, adminPage, tokenEditPage, authPage } from "../src/pages.js";
import { writeFileSync } from "node:fs";

const samples = [
  ["landing", landingPage({ user: null, isAdmin: false, allowPublic: true, defaultSlugLength: 6, maxUrlLength: 2048 })],
  ["landing-pub-off", landingPage({ user: null, isAdmin: false, allowPublic: false, defaultSlugLength: 6, maxUrlLength: 2048 })],
  ["my-anon", myPage({ user: null, anonId: "anon_abc" })],
  ["my-user", myPage({ user: { username: "alice" }, anonId: null })],
  ["admin", adminPage({ kvId: "test-id" })],
  ["token-edit", tokenEditPage({ slug: "abcd", link: { url: "https://x.test", createdAt: 0, clicks: 1 } })],
  ["token-edit-err", tokenEditPage({ slug: "abcd", link: null, error: "Bad token" })],
  ["auth-login", authPage({ kind: "login" })],
  ["auth-signup", authPage({ kind: "signup", error: "x" })],
];

let failed = 0;
for (const [name, html] of samples) {
  const matches = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  for (let i = 0; i < matches.length; i++) {
    const script = matches[i][1];
    if (!script.trim()) continue;
    const path = `/tmp/shortr-script-${name}-${i}.js`;
    writeFileSync(path, script);
    try {
      // Use Function to validate it parses as a script body.
      new Function(script);
      console.log(`OK ${name}#${i} (${script.length} chars)`);
    } catch (e) {
      console.error(`FAIL ${name}#${i} - ${e.message}`);
      failed++;
    }
  }
}
process.exit(failed ? 1 : 0);
