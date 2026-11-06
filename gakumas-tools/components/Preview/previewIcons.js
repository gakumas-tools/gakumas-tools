import { PItems, SkillCards } from "gakumas-data";

export const MAX_ITEMS = 4;
export const MAX_GROUPS = 4;
export const MAX_CARDS_PER_GROUP = 6;

const knownId = (Entities, id) => (Entities.getById(id) ? id : 0);

// IdolConfig throws on an unknown id, so those become empty slots.
export function boundPreviewLoadout(loadout) {
  const groups = loadout.skillCardIdGroups
    .slice(0, MAX_GROUPS)
    .map((group) => group.slice(0, MAX_CARDS_PER_GROUP));
  return {
    ...loadout,
    pItemIds: loadout.pItemIds
      .slice(0, MAX_ITEMS)
      .map((id) => knownId(PItems, id)),
    skillCardIdGroups: groups.map((group) =>
      group.map((id) => knownId(SkillCards, id)),
    ),
    customizationGroups: groups.map((group, i) =>
      group.map((_, j) => loadout.customizationGroups[i][j] || {}),
    ),
  };
}

// gkImg().icon is either a CDN URL string (when NEXT_PUBLIC_GK_IMG_BASE_URL
// is set) or a bundled image object { src: "/_next/static/media/..." } when
// unset. Normalize to a lookup key + absolute fetch URL the server can hit.
function iconKeyAndUrl(icon, origin) {
  if (!icon) return null;
  if (typeof icon === "string") return [icon, icon];
  return [icon.src, `${origin}${icon.src}`];
}

export function collectIcons(loadout, origin, { itemIcon, cardIcon }) {
  const map = new Map();
  const add = (icon) => {
    const pair = iconKeyAndUrl(icon, origin);
    if (pair && !map.has(pair[0])) map.set(pair[0], pair[1]);
  };
  for (const id of loadout.pItemIds.slice(0, MAX_ITEMS)) {
    const item = PItems.getById(id);
    if (item) add(itemIcon(item));
  }
  for (const group of loadout.skillCardIdGroups.slice(0, MAX_GROUPS)) {
    for (const id of group.slice(0, MAX_CARDS_PER_GROUP)) {
      const card = SkillCards.getById(id);
      if (card) add(cardIcon(card));
    }
  }
  return map;
}
