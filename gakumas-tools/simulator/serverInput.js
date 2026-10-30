import { Customizations, PItems, SkillCards, Stages } from "gakumas-data";

const MAX_NUM_RUNS = 10000;
const MAX_PARAM = 100000;
const MAX_P_ITEMS = 10;
const MAX_CARD_GROUPS = 10;
const MAX_CARDS_PER_GROUP = 12;

class InvalidInput extends Error {}

function check(condition, message) {
  if (!condition) throw new InvalidInput(message);
}

function isIdOf(collection, id) {
  return !id || (Number.isInteger(id) && !!collection.getById(id));
}

function cleanCustomizations(cardId, customizations) {
  if (!cardId || customizations == null) return {};
  if (Array.isArray(customizations) && !customizations.length) return {};
  check(
    typeof customizations == "object" && !Array.isArray(customizations),
    "Invalid customizations",
  );
  const available = SkillCards.getById(cardId).availableCustomizations;
  for (const [id, level] of Object.entries(customizations)) {
    check(
      available.includes(id),
      `Customization ${id} isn't available on card ${cardId}`,
    );
    const { max } = Customizations.getById(id);
    check(
      level == null || (Number.isInteger(level) && level >= 0 && level <= max),
      `Invalid level for customization ${id}`,
    );
  }
  return { ...customizations };
}

function cleanLoadout(loadout, stageId) {
  check(loadout && typeof loadout == "object", "Invalid loadout");
  const { params, supportBonus, pItemIds, skillCardIdGroups } = loadout;
  const customizationGroups = loadout.customizationGroups ?? [];

  check(loadout.stageId === stageId, "Loadouts must share one stage");
  check(
    Array.isArray(params) &&
      params.length == 4 &&
      params.every(
        (p) => p == null || (Number.isFinite(p) && p >= 0 && p <= MAX_PARAM),
      ),
    "Invalid params",
  );
  check(
    supportBonus == null ||
      (Number.isFinite(supportBonus) && supportBonus >= 0 && supportBonus <= 1),
    "Invalid support bonus",
  );
  check(
    Array.isArray(pItemIds) &&
      pItemIds.length <= MAX_P_ITEMS &&
      pItemIds.every((id) => isIdOf(PItems, id)),
    "Invalid p-items",
  );
  check(
    Array.isArray(skillCardIdGroups) &&
      skillCardIdGroups.length <= MAX_CARD_GROUPS &&
      skillCardIdGroups.every(
        (group) =>
          Array.isArray(group) &&
          group.length <= MAX_CARDS_PER_GROUP &&
          group.every((id) => isIdOf(SkillCards, id)),
      ),
    "Invalid skill cards",
  );
  check(Array.isArray(customizationGroups), "Invalid customizations");

  return {
    params: [...params],
    supportBonus,
    pItemIds: [...pItemIds],
    skillCardIdGroups: skillCardIdGroups.map((group) => [...group]),
    customizationGroups: skillCardIdGroups.map((group, i) =>
      group.map((cardId, j) =>
        cleanCustomizations(cardId, customizationGroups[i]?.[j]),
      ),
    ),
  };
}

// Only preset stages and real game data, so a server run takes the same
// input a browser run can.
export function parseSimulationInput(body) {
  try {
    const { loadout, loadouts, enterPercents, numRuns } = body;
    check(
      Number.isInteger(numRuns) && numRuns >= 1 && numRuns <= MAX_NUM_RUNS,
      "Invalid numRuns",
    );
    check(
      enterPercents == null || typeof enterPercents == "boolean",
      "Invalid enterPercents",
    );

    const stageId = loadout?.stageId;
    const stage = Number.isInteger(stageId) && Stages.getById(stageId);
    check(stage, "Only preset stages can run on the server");

    const isLink = stage.type == "linkContest";
    check(
      isLink
        ? Array.isArray(loadouts) &&
            loadouts.length == stage.linkTurnCounts.length
        : loadouts == null,
      "Invalid loadouts",
    );

    return {
      input: {
        stage,
        loadout: cleanLoadout(loadout, stageId),
        loadouts: isLink
          ? loadouts.map((ld) => cleanLoadout(ld, stageId))
          : null,
        enterPercents: !!enterPercents,
        numRuns,
      },
    };
  } catch (err) {
    if (err instanceof InvalidInput) return { error: err.message };
    throw err;
  }
}
