import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Stages,
  deserializeEffectSequence,
  serializeEffectSequence,
} from "gakumas-data";

// The stage customizer shows a stage's effects with serializeEffectSequence
// and parses the edited text back with all whitespace stripped.
const roundTrip = (effects) =>
  deserializeEffectSequence(
    serializeEffectSequence(effects).replace(/\s/g, ""),
  );

test("every preset stage's effects survive the customizer round trip", () => {
  for (const stage of Stages.getAll()) {
    assert.deepEqual(
      roundTrip(stage.effects),
      stage.effects,
      `stage ${stage.id} ${stage.name}`,
    );
  }
});

test("nested effects round-trip outside do blocks", () => {
  const effects = deserializeEffectSequence(
    "at:cardUsed { if:cumulativeFullPowerCharge>=10 { setEnthusiasmBonus(5,1); at:turn { drawCard(2); limit:1 } }; limit:3 }",
  );
  assert.equal(effects[0].effects.length, 1);
  assert.deepEqual(roundTrip(effects), effects);
});

test("phase filters and each condition round-trip", () => {
  const effects = deserializeEffectSequence(
    "at:cardUsed[cardHasEffect(strength)] { if:genki>=3 { if:turnsElapsed>2 { score+=5; score+=1; limit:2 } } }",
  );
  assert.ok(effects[0].filter);
  assert.equal(effects[0].conditions.length, 2);
  assert.deepEqual(roundTrip(effects), effects);
});
