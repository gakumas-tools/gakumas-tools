import { PDrinks, PItems, SkillCards, Stages } from "gakumas-data";
import {
  deserializeCustomizations,
  fixCustomizationGroups,
  serializeCustomizations,
} from "./customizations";
import { deserializeIds, serializeIds } from "./ids";
import {
  getDefaultParams,
  getStage,
  knownStageId,
  produceExamIdOf,
  TURN_TYPES,
} from "./stages";

const SIMULATOR_BASE_URL = "https://gktools.ris.moe/simulator";

// Turn order of a produce exam in the URL: "vo-da-vi-...".
const TURN_TYPE_CODES = { vocal: "vo", dance: "da", visual: "vi" };

export function serializeTurnTypes(turnTypes) {
  return turnTypes.map((type) => TURN_TYPE_CODES[type]).join("-");
}

export function deserializeTurnTypes(value) {
  if (!value) return null;
  const types = value
    .split("-")
    .map((code) => TURN_TYPES.find((type) => TURN_TYPE_CODES[type] == code));
  return types.every(Boolean) ? types : null;
}

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

function knownPDrinkId(id) {
  return PDrinks.getById(id) ? id : 0;
}

// P-drinks are held only in produce exams: 3 slots, "drinks=5-11-18".
export const P_DRINK_SLOTS = 3;

export function deserializePDrinkIds(value) {
  const ids = value ? deserializeIds(value).map(knownPDrinkId) : [];
  return Array.from({ length: P_DRINK_SLOTS }, (_, i) => ids[i] || 0);
}

// The turn each drink is drunk on: "drink_turns=0-11-1", 1-based, 0 (or
// missing) for auto, where the simulator plans the turn.
export function deserializePDrinkTurns(value) {
  const turns = value ? deserializeIds(value) : [];
  return Array.from({ length: P_DRINK_SLOTS }, (_, i) =>
    Math.max(0, turns[i] || 0),
  );
}

// The 体力 a produce exam starts at ("start_stamina=26"): a produce exam starts
// at the 体力 the run had, which can be below max. null = start at max.
export function deserializeStartStamina(value) {
  const stamina = parseInt(value, 10);
  return stamina >= 0 ? stamina : null;
}

function knownSkillCardId(id) {
  return SkillCards.getById(id) ? id : 0;
}

export function getSimulatorUrl(loadout, loadouts) {
  if (loadout.stageId == "custom" || !knownStageId(loadout.stageId)) {
    return null;
  }
  const stage = getStage(loadout.stageId, loadout.customStage);
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

  const isProduceExam = !!produceExamIdOf(stageId);
  stageId = knownStageId(isProduceExam ? stageId : parseInt(stageId, 10));
  const turnTypes = isProduceExam
    ? deserializeTurnTypes(searchParams.get("turns"))
    : null;
  const customStage = turnTypes ? { turnTypes } : {};
  const pDrinkIds = deserializePDrinkIds(
    isProduceExam ? searchParams.get("drinks") : null
  );
  const pDrinkTurns = deserializePDrinkTurns(
    isProduceExam ? searchParams.get("drink_turns") : null
  );
  const startStamina = deserializeStartStamina(
    isProduceExam ? searchParams.get("start_stamina") : null,
  );
  supportBonus = parseFloat(supportBonus);
  if (isNaN(supportBonus)) supportBonus = null;
  params = params
    ? deserializeIds(params)
    : getDefaultParams(getStage(stageId, customStage));
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
    customStage,
    enterPercents,
    supportBonus,
    params,
    pItemIds,
    pDrinkIds,
    pDrinkTurns,
    startStamina,
    skillCardIdGroups,
    customizationGroups,
    hasDataFromParams,
  };
}

export function loadoutToSearchParams(loadout) {
  const {
    stageId,
    customStage,
    enterPercents,
    supportBonus,
    params,
    pItemIds,
    pDrinkIds,
    pDrinkTurns,
    startStamina,
    skillCardIdGroups,
    customizationGroups,
  } = loadout;
  const searchParams = new URLSearchParams();
  searchParams.set("stage", stageId);
  if (produceExamIdOf(stageId)) {
    const { turnTypes } = getStage(stageId, customStage);
    searchParams.set("turns", serializeTurnTypes(turnTypes));
    if (pDrinkIds?.some((id) => id)) {
      searchParams.set("drinks", serializeIds(pDrinkIds));
      if (pDrinkTurns?.some((turn, i) => pDrinkIds[i] && turn > 0)) {
        searchParams.set(
          "drink_turns",
          serializeIds(pDrinkIds.map((id, i) => (id && pDrinkTurns[i]) || 0)),
        );
      }
    }
    if (startStamina != null) {
      searchParams.set("start_stamina", startStamina);
    }
  }
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
