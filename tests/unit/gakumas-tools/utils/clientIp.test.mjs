import { test } from "node:test";
import assert from "node:assert/strict";
import { clientIp } from "../../../../gakumas-tools/utils/clientIp.js";

const headers = (entries) => new Headers(entries);

test("clientIp prefers Cloudflare's connecting IP over X-Forwarded-For", () => {
  assert.equal(
    clientIp(
      headers({
        "cf-connecting-ip": "203.0.113.7",
        "x-forwarded-for": "198.51.100.1, 203.0.113.7",
      }),
    ),
    "203.0.113.7",
  );
});

test("clientIp ignores the client-chosen first X-Forwarded-For entry", () => {
  const ips = ["1.1.1.1", "2.2.2.2"].map((spoofed) =>
    clientIp(headers({ "x-forwarded-for": `${spoofed}, 203.0.113.7` })),
  );
  assert.deepEqual(ips, ["203.0.113.7", "203.0.113.7"]);
});

test("clientIp falls back to unknown without forwarding headers", () => {
  assert.equal(clientIp(headers({})), "unknown");
});
