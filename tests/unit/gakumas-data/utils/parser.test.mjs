import { test } from "node:test";
import assert from "node:assert/strict";
import { deserializeEffectSequence } from "gakumas-data";
import { parseEffects } from "gakumas-data/utils/parser";

const rhs = (src) => parseEffects(src).effects[0].expr.rhs;

test("a minus right after an operand is subtraction", () => {
  for (const src of ["x=a-1", "x=2-1", "x=(a)-1"]) {
    const expr = rhs(src);
    assert.equal(expr.type, "binary", src);
    assert.equal(expr.op, "-", src);
  }
  // Still a negative literal where an operand is expected.
  assert.deepEqual(rhs("x=-1"), { type: "number", value: -1 });
  assert.equal(rhs("x=a*-1").right.value, -1);
});

test("a parenthesized arithmetic group can be compared", () => {
  const [effect] = deserializeEffectSequence("if:(genki+1)>2 { score+=1 }");
  assert.equal(effect.conditions[0].type, "comparison");
  assert.equal(effect.conditions[0].op, ">");
});

test("parenthesized conditions still group", () => {
  const [effect] = deserializeEffectSequence(
    "if:(genki>1 | stamina>1) & score>0 { score+=1 }",
  );
  assert.equal(effect.conditions[0].op, "&");
  assert.equal(effect.conditions[0].left.op, "|");
});
