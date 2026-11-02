export const MAX_MEMORIES_PER_USER = 3000;
export const MAX_LOADOUTS_PER_USER = 1000;
export const MAX_NAME_LENGTH = 1000;
const MAX_IDS = MAX_MEMORIES_PER_USER;
const MAX_ITEMS = 100;

const OBJECT_ID = /^[0-9a-f]{24}$/i;

export async function readJsonBody(request, maxBytes) {
  const tooLarge = { error: "Body too large", status: 413 };
  if (Number(request.headers.get("content-length")) > maxBytes) return tooLarge;
  if (!request.body) return { error: "Invalid JSON", status: 400 };
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        // Not awaited: a stalled sender may never let the cancel finish.
        reader.cancel().catch(() => {});
        return tooLarge;
      }
      text += decoder.decode(value, { stream: true });
    }
  } catch {
    return { error: "Invalid body", status: 400 };
  }
  text += decoder.decode();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return { error: "Invalid JSON", status: 400 };
  }
  if (!isPlainObject(body)) return { error: "Invalid body", status: 400 };
  return { body };
}

function isPlainObject(value) {
  return typeof value == "object" && value !== null && !Array.isArray(value);
}

export function isObjectId(value) {
  return typeof value == "string" && OBJECT_ID.test(value);
}

export function isObjectIdList(value) {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= MAX_IDS &&
    value.every(isObjectId)
  );
}

export function isName(value) {
  return typeof value == "string" && value.length <= MAX_NAME_LENGTH;
}

function isList(value) {
  return Array.isArray(value) && value.length <= MAX_ITEMS;
}

function isOptionalList(value) {
  return value == null || isList(value);
}

export function cleanMemory(memory) {
  if (!isPlainObject(memory)) return null;
  const { name, pIdolId, params, pItemIds, skillCardIds, customizations } =
    memory;
  if (name != null && !isName(name)) return null;
  if (pIdolId != null && !["number", "string"].includes(typeof pIdolId)) {
    return null;
  }
  if (![params, pItemIds, skillCardIds].every(isOptionalList)) return null;
  if (customizations != null && !isList(customizations)) return null;
  return { name, pIdolId, params, pItemIds, skillCardIds, customizations };
}

export function cleanMemories(memories) {
  if (!Array.isArray(memories) || !memories.length) return null;
  if (memories.length > MAX_MEMORIES_PER_USER) return null;
  const cleaned = memories.map(cleanMemory);
  return cleaned.every(Boolean) ? cleaned : null;
}

export function validateLoadout(loadout) {
  if (loadout.name != null && !isName(loadout.name)) return "Invalid name";
  if (
    loadout.enterPercents != null &&
    typeof loadout.enterPercents != "boolean"
  ) {
    return "Invalid enterPercents";
  }
  for (const field of [
    "params",
    "pItemIds",
    "skillCardIdGroups",
    "customizationGroups",
    "linkLoadouts",
  ]) {
    if (!isOptionalList(loadout[field])) return `Invalid ${field}`;
  }
  for (const field of ["customStage", "stats", "derived"]) {
    if (loadout[field] != null && !isPlainObject(loadout[field])) {
      return `Invalid ${field}`;
    }
  }
  return null;
}
