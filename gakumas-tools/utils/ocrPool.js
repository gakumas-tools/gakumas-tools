import { createWorkerPool } from "./workerPool";

// A Tesseract worker's wasm heap grows to ~350 MB on an upscaled phone
// screenshot and never shrinks, so the pool is sized by memory, not cores.
export function getOcrPoolSize() {
  const cap = matchMedia("(pointer: coarse)").matches ? 2 : 4;
  const byMemory = navigator.deviceMemory
    ? Math.floor(navigator.deviceMemory / 2)
    : cap;
  return Math.max(
    1,
    Math.min(cap, byMemory, navigator.hardwareConcurrency || 1),
  );
}

export function createOcrPool(create) {
  return createWorkerPool({
    size: getOcrPoolSize(),
    create,
    destroy: (worker) => worker.terminate(),
  });
}
