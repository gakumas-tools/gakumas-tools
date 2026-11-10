import { Customizations, SkillCards } from "gakumas-data";

export function deserializeCustomizations(str) {
  try {
    return str.split("-").map((c) =>
      c
        .split("e")
        .filter((e) => e)
        .reduce((acc, cur) => {
          const [k, v] = cur.split("x");
          acc[k] = parseInt(v, 10);
          return acc;
        }, {})
    );
  } catch (e) {
    console.error(e);
    return [];
  }
}

export function serializeCustomizations(customizations) {
  if (!customizations) return "";
  return customizations
    .map((c) =>
      Object.keys(c || {})
        .filter((k) => c[k])
        .map((k) => `${k}x${c[k]}`)
        .join("e")
    )
    .join("-");
}

export function countCustomizations(customizations) {
  if (!customizations) return 0;
  return Object.values(customizations).reduce((acc, cur) => acc + cur, 0);
}

export function fixCustomizations(customizations) {
  return Object.keys(customizations || {})
    .filter(Customizations.getById)
    .reduce((acc, cur) => {
      acc[cur] = customizations[cur];
      return acc;
    }, {});
}

export function fixCardCustomizations(cardId, customizations) {
  const card = SkillCards.getById(cardId);
  const fixed = {};
  if (!card || !customizations) return fixed;
  for (const id of card.availableCustomizations) {
    const level = customizations[id];
    const max = Customizations.getById(id).max;
    if (Number.isInteger(level) && level > 0 && level <= max) {
      fixed[id] = level;
    }
  }
  return fixed;
}

export function fixCustomizationGroups(skillCardIdGroups, customizationGroups) {
  return skillCardIdGroups.map((ids, i) =>
    ids.map((id, j) =>
      fixCardCustomizations(id, customizationGroups?.[i]?.[j])
    )
  );
}
