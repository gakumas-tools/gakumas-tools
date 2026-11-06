import { test } from "node:test";
import assert from "node:assert/strict";
import sitemap from "../../../../gakumas-tools/app/sitemap.js";

test("every page is listed once in each locale", () => {
  const urls = sitemap().map((entry) => entry.url);
  assert.equal(new Set(urls).size, urls.length);
  for (const prefix of ["", "/en", "/ko", "/zh-Hans"]) {
    assert.ok(urls.includes(`https://gktools.ris.moe${prefix}`));
    assert.ok(urls.includes(`https://gktools.ris.moe${prefix}/simulator`));
  }
  assert.ok(!urls.some((url) => url.includes("/ja")));
});

test("each entry's alternates are the same set of listed URLs", () => {
  const entries = sitemap();
  const byUrl = new Map(entries.map((entry) => [entry.url, entry]));
  for (const entry of entries) {
    const { languages } = entry.alternates;
    assert.ok(Object.values(languages).includes(entry.url), entry.url);
    for (const url of Object.values(languages)) {
      assert.deepEqual(byUrl.get(url)?.alternates.languages, languages, url);
    }
  }
});
