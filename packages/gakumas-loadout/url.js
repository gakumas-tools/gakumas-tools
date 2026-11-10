import { PItems, SkillCards, Stages } from "gakumas-data";
import {
  deserializeCustomizations,
  fixCustomizationGroups,
  serializeCustomizations,
} from "./customizations";
import { deserializeIds, serializeIds } from "./ids";
import { getDefaultParams, getStage, knownStageId } from "./stages";

const SIMULATOR_BASE_URL = "https://gktools.ris.moe/simulator";

const DEFAULTS = {
  stageId: Stages.findLast((s) => s.type == "contest" && !s.preview).id,
  supportBonus: "0.1",
  pItemIds: "0-0-0-0",
  skillCardIdGroups: "0-0-0-0-0-0_0-0-0-0-0-0",
  customizationGroups: "-----_-----",
};

function knownPItemId(id) {
  return PItems.getById(id) ? id : 0;
}

function knownSkillCardId(id) {
  return SkillCards.getById(id) ? id : 0;
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

export function loadoutFromSearchParams(searchParams) {
  let stageId = searchParams.get("stage");
  let supportBonus = searchParams.get("support_bonus");
  let params = searchParams.get("params");
  let pItemIds = searchParams.get("items");
  let skillCardIdGroups = searchParams.get("cards");
  let customizationGroups = searchParams.get("customizations");
  const enterPercents = searchParams.get("enter_percents") == "1";
  const hasDataFromParams =
    stageId ||
    params ||
    pItemIds ||
    skillCardIdGroups ||
    customizationGroups ||
    enterPercents;

  stageId = stageId || DEFAULTS.stageId;
  if (!searchParams.has("support_bonus")) supportBonus = DEFAULTS.supportBonus;
  pItemIds = pItemIds || DEFAULTS.pItemIds;
  skillCardIdGroups = skillCardIdGroups || DEFAULTS.skillCardIdGroups;
  customizationGroups = customizationGroups || DEFAULTS.customizationGroups;

  stageId = knownStageId(parseInt(stageId, 10));
  supportBonus = parseFloat(supportBonus);
  if (isNaN(supportBonus)) supportBonus = null;
  params = params ? deserializeIds(params) : getDefaultParams(getStage(stageId));
  pItemIds = deserializeIds(pItemIds).map(knownPItemId);
  skillCardIdGroups = skillCardIdGroups
    .split("_")
    .map((group) => deserializeIds(group).map(knownSkillCardId));
  customizationGroups = customizationGroups
    .split("_")
    .map(deserializeCustomizations);

  // Ensure customizations are same shape as skill cards
  if (skillCardIdGroups.length != customizationGroups.length) {
    customizationGroups = skillCardIdGroups.map((g) => g.map(() => ({})));
  }
  customizationGroups = fixCustomizationGroups(
    skillCardIdGroups,
    customizationGroups
  );

  return {
    stageId,
    enterPercents,
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
    skillCardIdGroups
      .map((_, i) => serializeCustomizations(customizationGroups?.[i]))
      .join("_")
  );
  return searchParams;
}

export function loadoutsFromSearchParams(searchParams) {
  let loadouts = [];
  const loadoutParams = searchParams.getAll("loadout");
  for (let param of loadoutParams) {
    let paramString;
    try {
      paramString = decodeURIComponent(param);
    } catch {
      continue;
    }
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
