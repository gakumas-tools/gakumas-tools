import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEffects } from "gakumas-data/utils/parser";
import { validateEffectAst } from "gakumas-data/utils/validator";

const errors = (src) => validateEffectAst(parseEffects(src));

test("expressions only accept names the Evaluator can resolve", () => {
  // Special actions run as statements, not as values.
  assert.deepEqual(errors("if:drawCard() { score+=1 }"), [
    "Unknown function call: drawCard",
  ]);
  // Intermediate fields and turn types aren't readable values.
  assert.deepEqual(errors("if:fixedStamina>=0 { score+=1 }"), [
    "Unknown identifier: fixedStamina",
  ]);
  assert.deepEqual(errors("if:vocal==vocal { score+=1 }"), [
    "Unknown identifier: vocal",
    "Unknown identifier: vocal",
  ]);
});

test("names passed as function arguments are still accepted", () => {
  assert.deepEqual(errors("if:cardHasEffect(fixedStamina) { score+=1 }"), []);
  assert.deepEqual(errors("drawCard; score+=genki*0.5"), []);
});
