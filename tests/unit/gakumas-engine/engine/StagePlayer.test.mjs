import { test } from "node:test";
import assert from "node:assert/strict";
import { S, StagePlayer } from "gakumas-engine";
import ManualStrategy, {
  HoldSelectionRequest,
  MoveToHandSelectionRequest,
} from "../../../../packages/gakumas-engine/strategies/ManualStrategy.js";

function stateWith(turnsRemaining) {
  const state = [];
  state[S.turnsRemaining] = turnsRemaining;
  state[S.score] = 100;
  return state;
}

function fakeEngine(executeDecision) {
  return {
    logger: { reset() {}, getLogs: () => [], getGraphData: () => ({}) },
    getInitialState: () => stateWith(1),
    startStage: (state) => state,
    executeDecision,
  };
}

test("an exception the strategy rethrows ends the stage with it", async () => {
  const failure = new Error("unhandled");
  const engine = fakeEngine(() => {
    throw failure;
  });
  let handled = 0;
  const strategy = {
    evaluate: () => ({ card: 1 }),
    handleException(exception) {
      handled++;
      throw exception;
    },
  };

  await assert.rejects(new StagePlayer(engine, strategy).play(), failure);
  assert.equal(handled, 1);
});

test("a new exception thrown while handling one is handled in turn", async () => {
  const initial = stateWith(1);
  let calls = 0;
  const engine = fakeEngine(() => {
    calls++;
    if (calls === 1) throw new HoldSelectionRequest(initial, [1, 2], 1);
    if (calls === 2) throw new MoveToHandSelectionRequest(initial, [3, 4], 1);
    return stateWith(0);
  });
  const requests = [];
  const strategy = new ManualStrategy(engine, async (request) => {
    requests.push(request.type);
    return [0];
  });
  strategy.evaluate = () => ({ card: 1 });

  const result = await new StagePlayer(engine, strategy).play();

  assert.equal(result.score, 100);
  assert.deepEqual(requests, ["HOLD_SELECTION", "MOVE_TO_HAND_SELECTION"]);
});

test("a failed manual selection ends the stage instead of asking again", async () => {
  const failure = new Error("input failed");
  const engine = fakeEngine(() => {
    throw new HoldSelectionRequest(stateWith(1), [1, 2], 1);
  });
  let prompts = 0;
  const strategy = new ManualStrategy(engine, async () => {
    prompts++;
    throw failure;
  });
  strategy.evaluate = () => ({ card: 1 });

  await assert.rejects(new StagePlayer(engine, strategy).play(), failure);
  assert.equal(prompts, 1);
});
