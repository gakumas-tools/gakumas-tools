import {
  ENTITY_DATA_BY_TYPE,
  EntityTypes,
  isEntityHidden,
} from "@/utils/entities";

const TYPE_BY_SLUG = {
  "skill-cards": EntityTypes.SKILL_CARD,
  "p-items": EntityTypes.P_ITEM,
  "p-drinks": EntityTypes.P_DRINK,
};

export const REFERENCE_SLUGS = Object.keys(TYPE_BY_SLUG);

export function referenceType(slug) {
  return Object.hasOwn(TYPE_BY_SLUG, slug) ? TYPE_BY_SLUG[slug] : null;
}

export function referencePath(type, id) {
  const slug = REFERENCE_SLUGS.find((slug) => TYPE_BY_SLUG[slug] == type);
  return slug ? `/dex/reference/${slug}/${id}` : null;
}

// Only a plain id is looked up, so each entity has one URL.
export function getReferenceEntity(slug, id) {
  const type = referenceType(slug);
  if (!type || !/^[1-9]\d*$/.test(id)) return null;
  const entity = ENTITY_DATA_BY_TYPE[type].getById(Number(id));
  if (!entity || isEntityHidden(type, entity.id)) return null;
  return entity;
}

export function referencePaths() {
  return REFERENCE_SLUGS.flatMap((slug) => {
    const type = TYPE_BY_SLUG[slug];
    return ENTITY_DATA_BY_TYPE[type]
      .getAll()
      .filter((entity) => !isEntityHidden(type, entity.id))
      .map((entity) => referencePath(type, entity.id));
  });
}
