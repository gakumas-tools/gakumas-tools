export { serializeIds } from "gakumas-engine";

export function deserializeIds(str) {
  return str.split("-").map((n) => parseInt(n, 10) || 0);
}
