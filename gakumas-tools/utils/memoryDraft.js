export const MEMORY_DRAFT_STORAGE_KEY = "gakumas-tools.memoryDraft";

export function stashMemoryDraft(memory, storage) {
  try {
    const targetStorage = storage ?? globalThis.sessionStorage;
    targetStorage?.setItem(MEMORY_DRAFT_STORAGE_KEY, JSON.stringify(memory));
  } catch {}
}

export function takeMemoryDraft(storage) {
  try {
    const targetStorage = storage ?? globalThis.sessionStorage;
    const raw = targetStorage?.getItem(MEMORY_DRAFT_STORAGE_KEY);
    if (raw == null) return null;
    targetStorage.removeItem(MEMORY_DRAFT_STORAGE_KEY);
    const value = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : null;
  } catch {
    return null;
  }
}
