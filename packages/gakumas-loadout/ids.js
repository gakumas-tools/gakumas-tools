export function deserializeIds(str) {
  return str.split("-").map((n) => parseInt(n, 10) || 0);
}

export function serializeIds(ids) {
  return ids.map((p) => p || 0).join("-");
}
