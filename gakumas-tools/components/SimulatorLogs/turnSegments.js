// Effects that add a turn raise `remaining` without adding a turn type, so
// the elapsed count can't be derived from types.length. Extra turns take the
// last type, as in TurnManager.getTurnType.
export function turnSegments({ types, elapsed, remaining }) {
  const turnsElapsed = elapsed ?? types.length - remaining;
  const typeAt = (index) => types[Math.min(index, types.length - 1)];
  return {
    turnsElapsed,
    totalTurns: turnsElapsed + remaining,
    remainingTurns: Array.from({ length: remaining }, (_, i) =>
      typeAt(turnsElapsed + i),
    ),
    currentTurnType: typeAt(turnsElapsed),
  };
}
