import { Idols, PIdols, SkillCards, Stages } from "gakumas-data";

export const MAX_HISTORY = 20;

const LOADOUT_FIELDS = [
  "stageId",
  "customStage",
  "supportBonus",
  "params",
  "pItemIds",
  "skillCardIdGroups",
  "customizationGroups",
];

export function extractLoadoutFields(loadout) {
  const out = {};
  for (const f of LOADOUT_FIELDS) out[f] = loadout?.[f];
  return out;
}

const NUM_BUCKETS = 40;

export function summarizeScores(scores) {
  if (!scores || !scores.length) return null;
  const sorted = [...scores].sort((a, b) => a - b);
  const n = sorted.length;
  const min = sorted[0];
  const max = sorted[n - 1];
  const q = (p) => {
    const idx = (n - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  };
  const q1 = q(0.25);
  const median = q(0.5);
  const q3 = q(0.75);
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  const variance =
    sorted.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const stddev = Math.sqrt(variance);

  const range = max - min;
  let bucketSize = range > 0 ? Math.ceil(range / NUM_BUCKETS) : 1;
  const buckets = new Array(NUM_BUCKETS).fill(0);
  for (const s of sorted) {
    const idx = Math.min(NUM_BUCKETS - 1, Math.floor((s - min) / bucketSize));
    buckets[idx]++;
  }

  return {
    count: n,
    min,
    q1,
    median,
    mean,
    q3,
    max,
    stddev,
    bucketMin: min,
    bucketSize,
    buckets,
  };
}

export function deriveRunMeta(loadout) {
  const { stageId, customStage, skillCardIdGroups } = loadout;

  let stageName = null;
  let season = null;
  if (stageId === "custom") {
    stageName = customStage?.name || null;
  } else if (stageId) {
    const stage = Stages.getById(stageId);
    if (stage) {
      stageName = stage.name;
      season = stage.season || null;
    }
  }

  let signatureCardId = null;
  let pIdolId = null;
  const firstGroup = skillCardIdGroups?.[0] || [];
  for (const id of firstGroup) {
    if (!id) continue;
    const card = SkillCards.getById(id);
    if (card?.sourceType === "pIdol") {
      signatureCardId = id;
      pIdolId = card.pIdolId;
      break;
    }
  }
  if (!signatureCardId) {
    for (const id of firstGroup) {
      if (!id) continue;
      signatureCardId = id;
      const card = SkillCards.getById(id);
      if (card?.pIdolId) pIdolId = card.pIdolId;
      break;
    }
  }

  let idolId = null;
  if (pIdolId) {
    const pIdol = PIdols.getById(pIdolId);
    if (pIdol) idolId = pIdol.idolId;
  }

  return {
    stageName,
    season,
    idolId,
    pIdolId,
    signatureCardId,
  };
}

export function getIdolName(idolId) {
  if (!idolId) return null;
  return Idols.getById(idolId)?.name || null;
}

const RANGE_PAD_RATIO = 0.05;
const TARGET_TICKS = 5;

export function computeRange(runs) {
  let min = Infinity;
  let max = -Infinity;
  for (const run of runs) {
    if (!run?.stats) continue;
    if (run.stats.min < min) min = run.stats.min;
    if (run.stats.max > max) max = run.stats.max;
  }
  if (!isFinite(min) || !isFinite(max)) return { min: 0, max: 1 };
  if (min === max) return { min: min - 1, max: max + 1 };
  const pad = (max - min) * RANGE_PAD_RATIO;
  return { min: min - pad, max: max + pad };
}

export function computeTicks(min, max) {
  const range = max - min;
  if (range <= 0) return [];
  const rawStep = range / TARGET_TICKS;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const normalized = rawStep / magnitude;
  let niceStep;
  if (normalized < 1.5) niceStep = magnitude;
  else if (normalized < 3) niceStep = 2 * magnitude;
  else if (normalized < 7) niceStep = 5 * magnitude;
  else niceStep = 10 * magnitude;
  const start = Math.ceil(min / niceStep) * niceStep;
  const ticks = [];
  for (let v = start; v <= max; v += niceStep) ticks.push(v);
  return ticks;
}

export function stageKeyOf(run) {
  const id = run?.loadout?.stageId;
  if (id == null || id === "") return null;
  return String(id);
}

export function stageLabelOf(run, customLabel) {
  const id = run?.loadout?.stageId;
  if (id == null) return null;
  if (id === "custom") return customLabel;
  const s = Stages.getById(id);
  if (s?.season != null && s?.stage != null) {
    return `S${s.season}-${s.stage}`;
  }
  return run.derived?.stageName || String(id);
}

const HISTORY_KEY = "gakumas-tools.simulation-runs.history";
const LEGACY_LOADOUT_HISTORY_KEY = "gakumas-tools.loadout-history";
const LEGACY_LOADOUTS_HISTORY_KEY = "gakumas-tools.loadouts-history";

export function newRunId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function legacyEntryToRun(entry) {
  if (!entry || !entry.skillCardIdGroups) return null;
  const loadout = extractLoadoutFields(entry);
  const linkLoadouts = Array.isArray(entry.loadouts)
    ? entry.loadouts.map(extractLoadoutFields)
    : null;
  return {
    id: newRunId(),
    createdAt: null,
    loadout,
    linkLoadouts,
    stats: null,
    derived: deriveRunMeta(loadout),
  };
}

function readLegacyHistory() {
  const runs = [];
  try {
    const s1 = localStorage.getItem(LEGACY_LOADOUT_HISTORY_KEY);
    if (s1) {
      const arr = JSON.parse(s1);
      if (Array.isArray(arr)) {
        for (const entry of arr) {
          const run = legacyEntryToRun(entry);
          if (run) runs.push(run);
        }
      }
    }
  } catch {}
  try {
    const s2 = localStorage.getItem(LEGACY_LOADOUTS_HISTORY_KEY);
    if (s2) {
      const arr = JSON.parse(s2);
      if (Array.isArray(arr)) {
        for (const loadouts of arr) {
          if (!Array.isArray(loadouts) || !loadouts.length) continue;
          const run = legacyEntryToRun({ ...loadouts[0], loadouts });
          if (run) runs.push(run);
        }
      }
    }
  } catch {}
  return runs.slice(0, MAX_HISTORY);
}

export function loadHistoryFromStorage() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
  } catch {}

  const migrated = readLegacyHistory();
  if (migrated.length) {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(migrated));
      localStorage.removeItem(LEGACY_LOADOUT_HISTORY_KEY);
      localStorage.removeItem(LEGACY_LOADOUTS_HISTORY_KEY);
    } catch {}
  }
  return migrated;
}

export function saveHistoryToStorage(runs) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(runs));
  } catch {}
}

const MIN_MS = 60 * 1000;
const HOUR_MS = 60 * MIN_MS;
const DAY_MS = 24 * HOUR_MS;

export function formatRelative(iso, locale, now = Date.now()) {
  if (!iso) return null;
  const ts = new Date(iso).getTime();
  if (!isFinite(ts)) return null;
  const diff = now - ts;
  const rtf = new Intl.RelativeTimeFormat(locale, {
    numeric: "auto",
    style: "narrow",
  });
  if (diff < MIN_MS) return rtf.format(0, "second");
  if (diff < HOUR_MS) return rtf.format(-Math.floor(diff / MIN_MS), "minute");
  if (diff < DAY_MS) return rtf.format(-Math.floor(diff / HOUR_MS), "hour");
  return rtf.format(-Math.floor(diff / DAY_MS), "day");
}

export function normalizeSavedRun(doc) {
  if (!doc) return null;
  const loadout = extractLoadoutFields(doc);
  return {
    id: doc._id?.toString?.() || doc._id || doc.id,
    _id: doc._id,
    name: doc.name || null,
    createdAt: doc.createdAt || null,
    loadout,
    linkLoadouts: doc.linkLoadouts || null,
    stats: doc.stats || null,
    derived: doc.derived || deriveRunMeta(loadout),
  };
}
