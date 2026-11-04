import { test } from "node:test";
import assert from "node:assert/strict";
import { highlightEffects } from "../../../../gakumas-tools/utils/effectSyntax.js";

const classes = (input) =>
  highlightEffects(input).map(({ className, text }) => [className, text]);

test("highlights numbers as written", () => {
  assert.deepEqual(classes("do:score*=1.50").slice(-1), [["number", "1.50"]]);
  assert.deepEqual(classes("do:score+=007").slice(-1), [["number", "007"]]);
  assert.deepEqual(classes("do:score=-0").slice(-1), [["number", "-0"]]);
});

test("a minus after an identifier stays an operator", () => {
  assert.deepEqual(classes("do:x-1").slice(-3), [
    ["identifier", "x"],
    ["operator", "-"],
    ["number", "1"],
  ]);
});
