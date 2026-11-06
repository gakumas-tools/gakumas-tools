import { test } from "node:test";
import assert from "node:assert/strict";
import { highlightEffects } from "../../../../gakumas-tools/utils/effectSyntax.js";

function numbers(input) {
  return highlightEffects(input)
    .filter((part) => part.className == "number")
    .map((part) => part.text);
}

test("Highlighting keeps the input text intact", () => {
  for (const input of [
    "at:startOfTurn,do:score+=1.0",
    "if:stamina>=05,do:block+=3",
    "do:x+=0.50;do:y+=1",
    "do:x-=-05,do:y+=1.",
  ]) {
    assert.equal(
      highlightEffects(input)
        .map((part) => part.text)
        .join(""),
      input,
    );
  }
});

test("Numbers are highlighted as written", () => {
  assert.deepEqual(numbers("at:startOfTurn,do:score+=1.0"), ["1.0"]);
  assert.deepEqual(numbers("if:stamina>=05,do:block+=3"), ["05", "3"]);
  assert.deepEqual(numbers("do:x+=0.50;do:y+=1"), ["0.50", "1"]);
  assert.deepEqual(numbers("do:x-=-05,do:y+=1."), ["-05", "1."]);
});

test("A minus before a spaced number stays an operator", () => {
  const parts = highlightEffects("do:score+=x - 5");
  assert.deepEqual(parts.slice(-3), [
    { className: "operator", text: "-" },
    { className: null, text: " " },
    { className: "number", text: "5" },
  ]);
});
