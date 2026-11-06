// An upgraded skill card or P-item directly follows its base (id + 1), but
// many have no upgraded version, so id ± 1 can be an unrelated entity.
// Returns the id of the entity's other version, or null if it has none.
export function getOtherVersionId(Entities, entity) {
  if (!entity) return null;
  if (entity.upgraded) {
    const base = Entities.getById(entity.id - 1);
    return base && !base.upgraded ? base.id : null;
  }
  const upgraded = Entities.getById(entity.id + 1);
  return upgraded?.upgraded ? upgraded.id : null;
}
