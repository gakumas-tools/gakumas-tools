// Which stages can have a listing of shared runs: a game stage's, never a
// custom one. Safe to use in the browser, unlike sharedRuns.js.
export function isListableStageId(value) {
  return Number.isSafeInteger(value) && value > 0;
}
