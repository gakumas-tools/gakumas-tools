import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decodeLine,
  encodeLine,
} from "../../../../gakumas-tools/simulator/ndjson.js";

test("round-trips non-finite numbers, alone or in single-element arrays", () => {
  const message = {
    scores: [-Infinity],
    mixed: [3, -Infinity, Infinity, NaN],
    label: "unplayable",
  };
  assert.deepEqual(decodeLine(encodeLine(message)), message);
});
