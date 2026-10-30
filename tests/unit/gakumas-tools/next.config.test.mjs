import { test } from "node:test";
import assert from "node:assert/strict";
import nextConfig from "../../../gakumas-tools/next.config.mjs";

async function securityHeaders() {
  const rules = (await nextConfig.headers?.()) ?? [];
  const rule = rules.find((r) => r.source === "/:path*");
  assert.ok(rule, "no header rule covers every route");
  return Object.fromEntries(rule.headers.map(({ key, value }) => [key, value]));
}

test("every route denies framing and sniffing", async () => {
  const headers = await securityHeaders();
  assert.equal(headers["X-Frame-Options"], "DENY");
  assert.equal(headers["X-Content-Type-Options"], "nosniff");
  assert.equal(headers["Referrer-Policy"], "strict-origin-when-cross-origin");
  assert.match(headers["Permissions-Policy"], /camera=\(\)/);
});

test("CSP allows the third parties the app loads", async () => {
  const csp = (await securityHeaders())["Content-Security-Policy-Report-Only"];
  const directive = (name) =>
    csp.split("; ").find((d) => d.startsWith(`${name} `));
  assert.match(directive("script-src"), /'wasm-unsafe-eval'/);
  assert.match(directive("script-src"), /cdn\.jsdelivr\.net/);
  assert.match(directive("connect-src"), /cdn\.jsdelivr\.net/);
  assert.match(directive("img-src"), /cdn\.discordapp\.com/);
  assert.match(directive("worker-src"), /blob:/);
  assert.match(directive("form-action"), /https:\/\/discord\.com/);
  assert.match(directive("frame-src"), /www\.youtube\.com/);
  assert.equal(directive("frame-ancestors"), "frame-ancestors 'none'");
});
