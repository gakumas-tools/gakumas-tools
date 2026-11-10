import { Stages } from "gakumas-data";

const DEFAULT_PARAMS_BY_TREND_RANK = [2700, 2000, 800];
const DEFAULT_STAMINA = 50;
const SIMULATOR_BASE_URL = "https://gktools.ris.moe/simulator";

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

export function serializeIds(ids) {
  return ids.map((p) => p || 0).join("-");
}

export function serializeCustomizations(customizations) {
  if (!customizations) return "";
  return customizations
    .map((c) =>
      Object.keys(c || {})
        .filter((k) => c[k])
        .map((k) => `${k}x${c[k]}`)
        .join("e"),
    )
    .join("-");
}

export function loadoutToSearchParams(loadout) {
  const {
    stageId,
    enterPercents,
    supportBonus,
    params,
    pItemIds,
    skillCardIdGroups,
    customizationGroups,
  } = loadout;
  const searchParams = new URLSearchParams();
  searchParams.set("stage", stageId);
  if (enterPercents) searchParams.set("enter_percents", "1");
  if (supportBonus != null) {
    searchParams.set("support_bonus", supportBonus);
  }
  searchParams.set("params", serializeIds(params));
  searchParams.set("items", serializeIds(pItemIds));
  searchParams.set("cards", skillCardIdGroups.map(serializeIds).join("_"));
  searchParams.set(
    "customizations",
    customizationGroups.map(serializeCustomizations).join("_"),
  );
  return searchParams;
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
      encodeURIComponent(loadoutSearchParams.toString()),
    );
  }
  return searchParams;
}

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
