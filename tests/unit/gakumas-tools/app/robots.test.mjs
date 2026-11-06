import { test } from "node:test";
import assert from "node:assert/strict";
import robots from "../../../../gakumas-tools/app/robots.js";

// Google's robots.txt precedence (which Twitterbot follows): the longest
// matching rule wins, and allow wins a tie.
function allowed(rules, path) {
  let best = { length: -1, allow: true };
  for (const rule of rules) {
    for (const [paths, allow] of [
      [rule.allow, true],
      [rule.disallow, false],
    ]) {
      for (const p of [].concat(paths ?? [])) {
        if (!path.startsWith(p)) continue;
        if (p.length > best.length || (p.length == best.length && allow)) {
          best = { length: p.length, allow };
        }
      }
    }
  }
  return best.allow;
}

test("crawlers may fetch share images but not other API routes", () => {
  const { rules } = robots();
  assert.equal(allowed(rules, "/api/preview?stage=1&cards=1-2"), true);
  assert.equal(allowed(rules, "/api/tier-list-preview?d=S4%3D1"), true);
  assert.equal(allowed(rules, "/api/memory"), false);
  assert.equal(allowed(rules, "/api/loadout"), false);
  assert.equal(allowed(rules, "/ja/simulator"), true);
});
