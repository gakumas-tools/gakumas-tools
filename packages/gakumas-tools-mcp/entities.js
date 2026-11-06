import {
  Customizations,
  HIDDEN_CARD_IDS,
  HIDDEN_ITEM_IDS,
  Idols,
  PDrinks,
  PIdols,
  PItems,
  SkillCards,
} from "gakumas-data";

const DATA_BY_KIND = {
  skillCard: SkillCards,
  pItem: PItems,
  pDrink: PDrinks,
  pIdol: PIdols,
  idol: Idols,
  customization: Customizations,
};

const HIDDEN_IDS_BY_KIND = {
  skillCard: HIDDEN_CARD_IDS,
  pItem: HIDDEN_ITEM_IDS,
};

const SUMMARY_FIELDS = [
  "title",
  "plan",
  "rarity",
  "type",
  "sourceType",
  "upgraded",
  "pIdolId",
  "idolId",
  "availableCustomizations",
  "max",
];

export const ENTITY_KINDS = Object.keys(DATA_BY_KIND);

function isHidden(kind, id) {
  return Boolean(HIDDEN_IDS_BY_KIND[kind]?.has(id));
}

function normalize(text) {
  return text.normalize("NFKC").toLowerCase();
}

function summary(entity) {
  const result = { id: entity.id, name: entity.name ?? entity.title };
  for (const field of SUMMARY_FIELDS) {
    if (field in entity) result[field] = entity[field];
  }
  return result;
}

export function getEntity(kind, id) {
  const entity = DATA_BY_KIND[kind].getById(id);
  if (!entity || isHidden(kind, id)) throw new Error(`Unknown ${kind} ${id}.`);
  return entity;
}

export function searchEntities({ kind, query, plan, offset, limit }) {
  const needle = normalize(query.trim());
  const entities = DATA_BY_KIND[kind]
    .getAll()
    .filter((entity) => !isHidden(kind, entity.id))
    .filter((entity) => !plan || entity.plan == plan)
    .filter((entity) =>
      normalize(`${entity.id} ${entity.name ?? entity.title}`).includes(needle),
    )
    .sort((a, b) => a.id - b.id);
  const nextOffset = offset + limit;
  return {
    total: entities.length,
    nextOffset: nextOffset < entities.length ? nextOffset : null,
    entities: entities.slice(offset, nextOffset).map(summary),
  };
}
