import { PIdols, PItems, SkillCards, Stages } from "gakumas-data";
import { GRAPHED_FIELDS, S } from "gakumas-engine";
import { FALLBACK_STAGE, MIN_BUCKET_SIZE } from "@/simulator/constants";
import {
  deserializeCustomizations,
  serializeCustomizations,
} from "./customizations";
import { deserializeIds, serializeIds } from "./ids";

const DEFAULTS = {
  stageId: Stages.findLast((s) => s.type == "contest" && !s.preview).id,
  supportBonus: "0.1",
  pItemIds: "0-0-0-0",
  skillCardIdGroups: "0-0-0-0-0-0_0-0-0-0-0-0",
  customizationGroups: "-----_-----",
};

const DEFAULT_PARAMS_BY_TREND_RANK = [2700, 2000, 800];
const DEFAULT_STAMINA = 50;

export function getDefaultParams(stage) {
  const criteria = [
    stage.criteria.vocal,
    stage.criteria.dance,
    stage.criteria.visual,
  ];
  const trendOrder = [0, 1, 2].sort((a, b) => criteria[b] - criteria[a]);
  const params = [];
  trendOrder.forEach((paramIndex, rank) => {
    params[paramIndex] = DEFAULT_PARAMS_BY_TREND_RANK[rank];
  });
  return [...params, DEFAULT_STAMINA];
}

export function getStage(stageId, customStage) {
  if (stageId == "custom") return customStage;
  return (stageId && Stages.getById(stageId)) || FALLBACK_STAGE;
}

export function knownStageId(stageId) {
  if (stageId == "custom" || (stageId && Stages.getById(stageId))) {
    return stageId;
  }
  return null;
}

const SIMULATOR_BASE_URL = "https://gktools.ris.moe/simulator";

export function getSimulatorUrl(loadout, loadouts) {
  const stage = Stages.getById(loadout.stageId);
  if (!stage) return null;
  if (stage.type === "linkContest") {
    const searchParams = loadoutsToSearchParams(loadouts);
    return `${SIMULATOR_BASE_URL}/?${searchParams.toString()}`;
  } else {
    const searchParams = loadoutToSearchParams(loadout);
    return `${SIMULATOR_BASE_URL}/?${searchParams.toString()}`;
  }
}

export function loadoutFromSearchParams(searchParams) {
  let stageId = searchParams.get("stage");
  let supportBonus = searchParams.get("support_bonus");
  let params = searchParams.get("params");
  let pItemIds = searchParams.get("items");
  let skillCardIdGroups = searchParams.get("cards");
  let customizationGroups = searchParams.get("customizations");
  const hasDataFromParams =
    stageId || params || pItemIds || skillCardIdGroups || customizationGroups;

  stageId = stageId || DEFAULTS.stageId;
  if (!searchParams.has("support_bonus")) supportBonus = DEFAULTS.supportBonus;
  pItemIds = pItemIds || DEFAULTS.pItemIds;
  skillCardIdGroups = skillCardIdGroups || DEFAULTS.skillCardIdGroups;
  customizationGroups = customizationGroups || DEFAULTS.customizationGroups;

  stageId = knownStageId(parseInt(stageId, 10));
  supportBonus = parseFloat(supportBonus);
  if (isNaN(supportBonus)) supportBonus = null;
  params = params ? deserializeIds(params) : getDefaultParams(getStage(stageId));
  pItemIds = deserializeIds(pItemIds);
  skillCardIdGroups = skillCardIdGroups.split("_").map(deserializeIds);
  customizationGroups = customizationGroups
    .split("_")
    .map(deserializeCustomizations);

  // Ensure customizations are same shape as skill cards
  if (skillCardIdGroups.length != customizationGroups.length) {
    customizationGroups = skillCardIdGroups.map((g) => g.map(() => ({})));
  }

  return {
    stageId,
    supportBonus,
    params,
    pItemIds,
    skillCardIdGroups,
    customizationGroups,
    hasDataFromParams,
  };
}

export function loadoutToSearchParams(loadout) {
  const {
    stageId,
    supportBonus,
    params,
    pItemIds,
    skillCardIdGroups,
    customizationGroups,
  } = loadout;
  const searchParams = new URLSearchParams();
  searchParams.set("stage", stageId);
  if (supportBonus != null) {
    searchParams.set("support_bonus", supportBonus);
  }
  searchParams.set("params", serializeIds(params));
  searchParams.set("items", serializeIds(pItemIds));
  searchParams.set("cards", skillCardIdGroups.map(serializeIds).join("_"));
  searchParams.set(
    "customizations",
    customizationGroups.map(serializeCustomizations).join("_")
  );
  return searchParams;
}

export function loadoutsFromSearchParams(searchParams) {
  let loadouts = [];
  const loadoutParams = searchParams.getAll("loadout");
  for (let param of loadoutParams) {
    const paramString = decodeURIComponent(param);
    const paramSearchParams = new URLSearchParams(paramString);
    const loadout = loadoutFromSearchParams(paramSearchParams);
    loadouts.push(loadout);
  }
  return loadouts;
}

export function loadoutsToSearchParams(loadouts) {
  const searchParams = new URLSearchParams();
  for (let loadout of loadouts) {
    const loadoutSearchParams = loadoutToSearchParams({
      ...loadout,
      supportBonus: null,
    });
    searchParams.append(
      "loadout",
      encodeURIComponent(loadoutSearchParams.toString())
    );
  }
  return searchParams;
}

export function bucketScores(scores) {
  let data = {};

  const maxScore = Math.max(...scores);
  const minScore = Math.min(...scores);
  const bucketSize =
    MIN_BUCKET_SIZE *
    Math.max(Math.floor((maxScore - minScore) / MIN_BUCKET_SIZE / 100), 1);

  for (let score of scores) {
    const bucket = Math.floor(score / bucketSize);
    data[bucket] = (data[bucket] || 0) + 1;
  }

  const keys = Object.keys(data);
  const minKey = Math.min(...keys);
  const maxKey = Math.max(...keys);
  for (let i = minKey - 1; i <= maxKey + 1; i++) {
    if (!data[i]) data[i] = 0;
  }

  return {
    bucketedScores: data,
    bucketSize,
  };
}

export function getMedianScore(scores) {
  const sorted = [...scores].sort((a, b) => b - a);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : Math.floor((sorted[mid - 1] + sorted[mid]) / 2);
}

export function formatRun(run) {
  return {
    score: run.score,
    logs: [].concat(...run.logs),
  };
}

export function addScoreByType(dst, src, multiplier = 1) {
  dst.vocal += src.vocal * multiplier;
  dst.dance += src.dance * multiplier;
  dst.visual += src.visual * multiplier;
}

export function mergeResults(results) {
  let scores = [];
  for (let result of results) {
    scores = scores.concat(result.scores);
  }
  const averageScore = Math.round(
    scores.reduce((acc, cur) => acc + cur, 0) / scores.length
  );

  let minRun, averageRun, maxRun;
  for (let result of results) {
    if (!minRun || result.minRun.score < minRun.score) {
      minRun = result.minRun;
    }
    if (!maxRun || result.maxRun.score > maxRun.score) {
      maxRun = result.maxRun;
    }
    if (
      !averageRun ||
      Math.abs(result.averageRun.score - averageScore) <
        Math.abs(averageRun.score - averageScore)
    ) {
      averageRun = result.averageRun;
    }
  }

  const { graphData, graphRunCounts } = mergeGraphDatas(
    results.map((result) => result.graphData),
    results.map((result) => result.graphRunCounts)
  );

  // Merge cardUsage across workers: element-wise per turn, key-wise per card.
  const cardUsage = { numRuns: 0, turns: [] };
  for (let result of results) {
    const s = result.cardUsage;
    if (!s) continue;
    cardUsage.numRuns += s.numRuns || 0;
    for (let t = 0; t < s.turns.length; t++) {
      if (!cardUsage.turns[t]) cardUsage.turns[t] = {};
      const into = cardUsage.turns[t];
      const from = s.turns[t] || {};
      for (const key in from) {
        if (!into[key]) {
          into[key] = { ...from[key] };
        } else {
          into[key].use += from[key].use;
          into[key].draw += from[key].draw;
        }
      }
    }
  }

  // Merge scoreStats across workers.
  const scoreStats = { numRuns: 0, turns: [] };
  for (let result of results) {
    const s = result.scoreStats;
    if (!s) continue;
    scoreStats.numRuns += s.numRuns || 0;
    for (let t = 0; t < s.turns.length; t++) {
      const from = s.turns[t];
      if (!from) continue;
      if (!scoreStats.turns[t]) {
        scoreStats.turns[t] = {
          turnTypeCounts: { vocal: 0, dance: 0, visual: 0 },
          totalScore: 0,
          totalScoreByType: { vocal: 0, dance: 0, visual: 0 },
          byEntity: {},
        };
      }
      const into = scoreStats.turns[t];
      into.turnTypeCounts.vocal += from.turnTypeCounts.vocal;
      into.turnTypeCounts.dance += from.turnTypeCounts.dance;
      into.turnTypeCounts.visual += from.turnTypeCounts.visual;
      into.totalScore += from.totalScore;
      into.totalScoreByType.vocal += from.totalScoreByType.vocal;
      into.totalScoreByType.dance += from.totalScoreByType.dance;
      into.totalScoreByType.visual += from.totalScoreByType.visual;
      for (const key in from.byEntity) {
        const src = from.byEntity[key];
        if (!into.byEntity[key]) {
          into.byEntity[key] = {
            ...src,
            scoreByType: { ...src.scoreByType },
          };
        } else {
          into.byEntity[key].uses =
            (into.byEntity[key].uses || 0) + (src.uses || 0);
          into.byEntity[key].score += src.score;
          addScoreByType(into.byEntity[key].scoreByType, src.scoreByType);
        }
      }
    }
  }

  return {
    graphData,
    graphRunCounts,
    minRun,
    averageRun,
    maxRun,
    averageScore,
    scores,
    cardUsage,
    scoreStats,
  };
}

const plainCardKeys = new Map();
const customizedCardKeys = new WeakMap();

// Same string as JSON.stringify({ id, c: c || null }), memoized per card.
function cardUsageKey(id, c) {
  let keys = plainCardKeys;
  if (c) {
    keys = customizedCardKeys.get(c);
    if (!keys) {
      keys = new Map();
      customizedCardKeys.set(c, keys);
    }
  }
  let key = keys.get(id);
  if (key === undefined) {
    key = JSON.stringify({ id, c: c || null });
    keys.set(id, key);
  }
  return key;
}

/**
 * Walk a single run's flat log stream and accumulate per-turn
 * {id, c, use, draw} counts into `cardUsage.turns`. Also ticks
 * `cardUsage.numRuns`.
 *
 * Shape: cardUsage.turns[turnIndex] is an object keyed by stringified
 * `{id, c}`; values are `{ id, c, use, draw }`. A synthetic `{id: 0}` row
 * counts skipped turns (selectedIndex === null).
 */
export function accumulateCardUsage(logs, cardUsage) {
  cardUsage.numRuns = (cardUsage.numRuns || 0) + 1;
  if (!cardUsage.turns) cardUsage.turns = [];

  let turnIndex = -1;
  let drawCountThisTurn = null;

  for (const log of logs) {
    if (log.logType === "startTurn") {
      turnIndex++;
      if (!cardUsage.turns[turnIndex]) cardUsage.turns[turnIndex] = {};
      drawCountThisTurn = new Map();
      continue;
    }
    if (log.logType !== "hand") continue;
    if (turnIndex < 0 || !drawCountThisTurn) continue;

    const turnData = cardUsage.turns[turnIndex];
    const { handCards, selectedIndex } = log.data;

    // Count occurrences of each (id, c) in the current hand. If this hand
    // shows more copies of a key than any prior hand this turn, the extras
    // are fresh draws. This way, a deck with two copies of the same card
    // counts both as drawn — but a moveToHand re-presenting the same card
    // doesn't double-count.
    const handCounts = new Map();
    for (let i = 0; i < handCards.length; i++) {
      const { id, c } = handCards[i];
      const key = cardUsageKey(id, c);
      handCounts.set(key, (handCounts.get(key) || 0) + 1);
    }
    for (const [key, count] of handCounts) {
      const prev = drawCountThisTurn.get(key) || 0;
      if (count > prev) {
        const sample = handCards.find((h) => cardUsageKey(h.id, h.c) === key);
        if (!turnData[key]) {
          turnData[key] = {
            id: sample.id,
            c: sample.c || null,
            use: 0,
            draw: count,
          };
        } else {
          turnData[key].draw += count - prev;
        }
        drawCountThisTurn.set(key, count);
      }
    }

    if (selectedIndex != null && handCards[selectedIndex]) {
      const { id, c } = handCards[selectedIndex];
      const key = cardUsageKey(id, c);
      if (!turnData[key]) {
        turnData[key] = { id, c: c || null, use: 0, draw: 0 };
      }
      turnData[key].use++;
    }

    if (selectedIndex == null) {
      const key = "SKIP";
      if (!turnData[key]) {
        turnData[key] = { id: 0, c: null, use: 1, draw: 0 };
      } else {
        turnData[key].use++;
      }
    }
  }
}

/**
 * Walk a single run's log stream and accumulate per-turn score attribution
 * into `scoreStats.turns`. Ticks `scoreStats.numRuns`.
 *
 * Attribution: entityStart/entityEnd logs bracket an entity's window. We
 * maintain a stack; each score `diff` log is credited only to the INNERMOST
 * entity on the stack. A few normalizations reshape the raw stack into the
 * attribution the UI wants:
 *
 *   - `skillCardEffect` (delayed effects registered by a card, e.g. "next
 *     turn do X") folds into the card that registered it — they share the
 *     skill-card id, so a card still "owns" the score it set up.
 *   - `stage` is transparent: its score bubbles up to the enclosing entity
 *     so a card that triggered a stage effect gets credit. When a stage
 *     effect fires with no parent (turn-boundary phases), its score is
 *     dropped from byEntity (it still contributes to the turn total).
 *   - `pItem` tracks a `uses` count in addition to score. Only "primary"
 *     activations (effects registered at init, flagged by the engine via
 *     source.primary) count toward uses — delayed/registered sub-effects
 *     contribute their score to the same p-item but don't tick the
 *     counter. Within primary activations we also require at least one
 *     observable log; if the only action was `effectCounter += N` (no log
 *     emitted), the activation is still skipped so counter-bookkeeping
 *     p-items don't inflate usage stats.
 *
 * scoreByType buckets each credit by the turn-type rolled that run, so the
 * UI can show "this card produced X on dance turns."
 */
export function accumulateScoreStats(logs, scoreStats) {
  scoreStats.numRuns = (scoreStats.numRuns || 0) + 1;
  if (!scoreStats.turns) scoreStats.turns = [];

  let turnIndex = -1;
  let turnType = null;
  const groupStack = [];

  for (const log of logs) {
    if (log.logType === "startTurn") {
      turnIndex++;
      turnType = log.data.type;
      const turn = ensureScoreTurn(scoreStats.turns, turnIndex);
      turn.turnTypeCounts[turnType] = (turn.turnTypeCounts[turnType] || 0) + 1;
      continue;
    }

    if (log.logType === "entityStart") {
      groupStack.push({
        entity: log.data,
        ownScore: 0,
        hasActivity: false,
        startTurn: turnIndex,
        startTurnType: turnType,
      });
      continue;
    }

    if (log.logType === "entityEnd") {
      const group = groupStack.pop();
      if (!group) continue;

      // Bubble activity to the parent so ancestors reflect any work done
      // in descendant frames — required for a primary p-item whose work
      // happens inside a nested stage/sub-effect frame.
      const parent = groupStack.length
        ? groupStack[groupStack.length - 1]
        : null;
      if (parent && group.hasActivity) parent.hasActivity = true;

      const entityType = group.entity.type;

      // Stage: transparent. Hand ownScore to the parent; never create a
      // stage row in byEntity. A stage effect fired outside any entity
      // (turn-boundary) just vanishes from byEntity.
      if (entityType === "stage") {
        if (parent) parent.ownScore += group.ownScore;
        continue;
      }

      if (group.startTurn < 0) continue;

      // Fold skillCardEffect → skillCard so a card's delayed effects
      // aggregate under the card.
      const keyType =
        entityType === "skillCardEffect" ? "skillCard" : entityType;

      // A primary p-item activation with any observable work counts as a
      // fresh "use." Derived (runtime-registered) p-item effects still
      // contribute their score to the same row but do not tick the
      // counter.
      const countsAsUse =
        keyType === "pItem" && !!group.entity.primary && group.hasActivity;

      // Record a row if there's either score to attribute or a new
      // activation to count.
      const shouldRecord = countsAsUse || group.ownScore !== 0;
      if (!shouldRecord) continue;

      const turn = ensureScoreTurn(scoreStats.turns, group.startTurn);
      const key = `${keyType}:${group.entity.id}`;
      if (!turn.byEntity[key]) {
        turn.byEntity[key] = {
          type: keyType,
          id: group.entity.id,
          uses: 0,
          score: 0,
          scoreByType: { vocal: 0, dance: 0, visual: 0 },
        };
      }
      if (countsAsUse) {
        turn.byEntity[key].uses += 1;
      }
      turn.byEntity[key].score += group.ownScore;
      if (group.startTurnType) {
        turn.byEntity[key].scoreByType[group.startTurnType] += group.ownScore;
      }
      continue;
    }

    // Any non-frame log marks the innermost frame as "active"; activity
    // bubbles to ancestors on each entityEnd. Critical for p-items: a
    // counter-only effect emits no log, so its frame ends with
    // hasActivity=false and the activation is skipped.
    if (groupStack.length) {
      groupStack[groupStack.length - 1].hasActivity = true;
    }

    if (log.logType === "diff" && log.data.field === S.score) {
      const delta = parseFloat(log.data.next) - parseFloat(log.data.prev);
      if (groupStack.length) {
        // Innermost only — ancestors aren't credited for a child's delta.
        groupStack[groupStack.length - 1].ownScore += delta;
      }
      if (turnIndex >= 0) {
        const turn = scoreStats.turns[turnIndex];
        turn.totalScore += delta;
        if (turnType) turn.totalScoreByType[turnType] += delta;
      }
    }
  }
}

function ensureScoreTurn(turns, i) {
  if (!turns[i]) {
    turns[i] = {
      turnTypeCounts: { vocal: 0, dance: 0, visual: 0 },
      totalScore: 0,
      totalScoreByType: { vocal: 0, dance: 0, visual: 0 },
      byEntity: {},
    };
  }
  return turns[i];
}

export function mergeGraphDatas(graphDatas, runCounts) {
  const sums = GRAPHED_FIELDS.reduce((acc, cur) => {
    acc[cur] = [];
    return acc;
  }, {});
  const graphRunCounts = [];

  graphDatas.forEach((graphData, g) => {
    const length = graphData[GRAPHED_FIELDS[0]].length;
    for (let i = 0; i < length; i++) {
      const count = runCounts ? runCounts[g][i] : 1;
      graphRunCounts[i] = (graphRunCounts[i] || 0) + count;
      for (let field of GRAPHED_FIELDS) {
        sums[field][i] = (sums[field][i] || 0) + graphData[field][i] * count;
      }
    }
  });

  const graphData = {};
  for (let field of GRAPHED_FIELDS) {
    graphData[field] = sums[field].map((sum, i) => sum / graphRunCounts[i]);
  }

  return { graphData, graphRunCounts };
}

export function getIndications(config, loadout) {
  const pIdolId = config.idol.pIdolId;
  const idolId = config.idol.idolId;
  const plan =
    config.stage.plan != "free" ? config.stage.plan : config.idol.plan;
  const dupeIndices = config.idol.dupeIndices;

  let pItemIndications = [];
  for (let id of loadout.pItemIds) {
    const pItem = PItems.getById(id);

    if (!pItem) {
      pItemIndications.push(null);
      continue;
    }

    let indications = {};

    // Plan mismatch
    if (plan && pItem.plan != "free" && pItem.plan != plan) {
      indications.planMismatch = true;
    }

    // P-idol mismatch
    if (pIdolId && pItem.sourceType == "pIdol" && pItem.pIdolId != pIdolId) {
      indications.pIdolMismatch = true;
    }
    pItemIndications.push(indications);
  }

  let skillCardIndicationGroups = [];
  let curIndex = 0;
  for (let i = 0; i < loadout.skillCardIdGroups.length; i++) {
    let skillCardIndications = [];
    for (let id of loadout.skillCardIdGroups[i]) {
      const skillCard = SkillCards.getById(id);

      if (!skillCard) {
        skillCardIndications.push(null);
        curIndex++;
        continue;
      }

      let indications = {};

      // Plan mismatch
      if (plan && skillCard.plan != "free" && skillCard.plan != plan) {
        indications.planMismatch = true;
      }

      // Idol mismatch
      if (
        idolId &&
        skillCard.sourceType == "pIdol" &&
        PIdols.getById(skillCard.pIdolId).idolId != idolId
      ) {
        indications.idolMismatch = true;
      }

      // Duplicate
      if (dupeIndices.includes(curIndex)) {
        indications.duplicate = true;
      }

      skillCardIndications.push(indications);
      curIndex++;
    }
    skillCardIndicationGroups.push(skillCardIndications);
  }

  return {
    pItemIndications,
    skillCardIndicationGroups,
  };
}

export function structureLogs(logs) {
  if (!logs) return null;

  let i = 0;
  let inTurn = false;

  function getLogGroup() {
    let group = [];
    while (i < logs.length) {
      const log = logs[i];
      if (log.logType === "entityStart") {
        i++;
        const childLogs = getLogGroup();
        group.push({ logType: "group", entity: log.data, childLogs });
        i++;
      } else if (log.logType === "entityEnd") {
        return group;
      } else if (log.logType === "startTurn") {
        if (inTurn) {
          inTurn = false;
          return group;
        }
        inTurn = true;
        i++;
        const childLogs = getLogGroup();
        group.push({ logType: "turn", data: log.data, childLogs });
      } else {
        group.push(log);
        i++;
      }
    }
    return group;
  }

  return getLogGroup();
}
