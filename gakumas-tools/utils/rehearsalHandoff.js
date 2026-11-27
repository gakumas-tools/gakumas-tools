import { cellScores, NUM_SLOTS, NUM_STAGES } from "@/utils/rehearsalComparison";

// Carries the Rehearsal tool's parsed rows into the simulator's Rehearsal
// tab, for one navigation, through sessionStorage.
export const REHEARSAL_HANDOFF_STORAGE_KEY = "gakumas-tools.rehearsalHandoff";

const isInt = (v, max) => Number.isInteger(v) && v >= 0 && v < max;
const isScore = (v) => Number.isFinite(v) && v >= 0;
const isStage = (stage) =>
  Array.isArray(stage) && stage.length == NUM_SLOTS && stage.every(isScore);

function cleanRow(row) {
  const scores = row?.scores;
  if (
    !Array.isArray(scores) ||
    scores.length != NUM_STAGES ||
    !scores.every(isStage)
  ) {
    return null;
  }
  // The reader's flags ("ok", "repaired", "flagged") carry as they are; a
  // stage with an unknown flag stays out of the stats, as a flagged one does.
  // A row without flags is unflagged, as in the Rehearsal tool.
  const flags =
    Array.isArray(row.flags) && row.flags.length == NUM_STAGES
      ? row.flags.map((f) =>
          f === "ok" || f === "repaired" ? f : "flagged",
        )
      : Array(NUM_STAGES).fill("ok");
  // Object URLs (row.src) die with the page that made them, so they stay behind.
  return { scores: scores.map((s) => [...s]), flags: [...flags] };
}

const isIcon = (v) =>
  v == null || (typeof v == "string" && v.startsWith("data:image/"));

function cleanIcons(icons) {
  if (!Array.isArray(icons) || icons.length != NUM_STAGES) return null;
  if (
    !icons.every(
      (row) =>
        row == null ||
        (Array.isArray(row) && row.length == NUM_SLOTS && row.every(isIcon)),
    )
  ) {
    return null;
  }
  return icons;
}

// The Rehearsal tool's `selected` chart index is stage * 3 + slot, the same
// cell as the comparison's [stage, slot]. Only a cell with scores carries.
export function selectedToCell(rows, selected) {
  if (!isInt(selected, NUM_STAGES * NUM_SLOTS)) return null;
  const cell = [Math.floor(selected / NUM_SLOTS), selected % NUM_SLOTS];
  return cellScores(rows, ...cell).length ? cell : null;
}

export function decodeRehearsalHandoff(value) {
  if (!value || typeof value != "object" || !Array.isArray(value.rows)) {
    return null;
  }
  const rows = value.rows.map(cleanRow).filter(Boolean);
  if (!rows.length) return null;
  const cell =
    Array.isArray(value.cell) &&
    value.cell.length == 2 &&
    isInt(value.cell[0], NUM_STAGES) &&
    isInt(value.cell[1], NUM_SLOTS) &&
    cellScores(rows, ...value.cell).length
      ? [value.cell[0], value.cell[1]]
      : null;
  return { rows, icons: cleanIcons(value.icons), cell };
}

export function encodeRehearsalHandoff({ rows, icons, selected }) {
  const clean = (rows || []).map(cleanRow).filter(Boolean);
  if (!clean.length) return null;
  return {
    rows: clean,
    icons: cleanIcons(icons),
    cell: selectedToCell(clean, selected),
  };
}

// Returns whether it was stored. Storage may be full or blocked; then the
// rows just don't carry over.
export function stashRehearsalHandoff(handoff, storage) {
  try {
    const value = encodeRehearsalHandoff(handoff);
    if (!value) return false;
    const target = storage ?? globalThis.sessionStorage;
    if (!target) return false;
    try {
      target.setItem(REHEARSAL_HANDOFF_STORAGE_KEY, JSON.stringify(value));
    } catch {
      // Too big with the icons: carry the scores alone.
      target.setItem(
        REHEARSAL_HANDOFF_STORAGE_KEY,
        JSON.stringify({ ...value, icons: null }),
      );
    }
    return true;
  } catch {
    return false;
  }
}

export function takeRehearsalHandoff(storage) {
  try {
    const target = storage ?? globalThis.sessionStorage;
    const raw = target?.getItem(REHEARSAL_HANDOFF_STORAGE_KEY);
    if (raw == null) return null;
    target.removeItem(REHEARSAL_HANDOFF_STORAGE_KEY);
    return decodeRehearsalHandoff(JSON.parse(raw));
  } catch {
    return null;
  }
}
