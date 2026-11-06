export const NUM_STAGES = 3;
export const NUM_PARAMS = 3;

export function buildBoxPlotData(data) {
  const init = Array.from({ length: NUM_PARAMS }, () => ({
    data: Array.from({ length: NUM_STAGES }, () => []),
  }));
  return data.reduce((acc, cur) => {
    for (let stage = 0; stage < NUM_STAGES; stage++) {
      // A flagged (unverified) stage is excluded from the distribution until the
      // user verifies it (by editing a cell or confirming the row); its values are
      // still shown and highlighted in the table, never dropped.
      if (cur.flags?.[stage] === "flagged") continue;
      for (let param = 0; param < NUM_PARAMS; param++) {
        const v = cur.scores[stage]?.[param];
        if (v) acc[param].data[stage].push(v);
      }
    }
    return acc;
  }, init);
}

// How many scores each stage's box plot draws: flagged stages and blank
// cells are left out, so this can be fewer than the number of rows.
export function stageSampleSizes(boxPlotData) {
  return Array.from({ length: NUM_STAGES }, (_, stage) =>
    Math.max(...boxPlotData.map(({ data }) => data[stage].length)),
  );
}

// `selected` encodes (stage, param) as stage * NUM_PARAMS + param.
export function scoresForSelected(boxPlotData, selected) {
  const param = selected % NUM_PARAMS;
  const stage = Math.floor(selected / NUM_PARAMS);
  return boxPlotData[param].data[stage];
}

export function computeStats(scores) {
  if (!scores.length) return null;
  const sorted = [...scores].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = Math.round(
    sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid],
  );
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    average: Math.round(sum / sorted.length),
    median,
  };
}
