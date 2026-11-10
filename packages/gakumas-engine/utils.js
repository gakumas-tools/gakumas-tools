import { ALL_FIELDS, COPY_ON_WRITE_FIELDS, DEBUG } from "./constants";

const seed = 610397104;

// Public domain
function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let _getRand = DEBUG ? mulberry32(seed) : Math.random;
let _getRandCount = 0;
let _randTape = null;
let _randTapePos = 0;

export function getRand() {
  _getRandCount++;
  if (_randTape) {
    if (_randTapePos < _randTape.length) return _randTape[_randTapePos++];
    const value = _getRand();
    _randTape.push(value);
    _randTapePos++;
    return value;
  }
  return _getRand();
}

// Record the draws from here on, so a card use replayed from the start rolls
// what it rolled before.
export function recordRand() {
  _randTape = [];
  _randTapePos = 0;
}

export function rewindRand() {
  _randTapePos = 0;
}

export function stopRecordingRand() {
  _randTape = null;
}

export function getRandCallCount() {
  return _getRandCount;
}

// Seed the RNG for deterministic runs. DEBUG only controls the *default*
// RNG; calling resetRand always switches to the seeded stream — parity
// tests rely on this.
export function resetRand(customSeed) {
  _getRand = mulberry32(customSeed ?? seed);
  _getRandCount = 0;
  _randTape = null;
}

export function shuffle(arr) {
  let currentIndex = arr.length;

  while (currentIndex != 0) {
    let randomIndex = Math.floor(getRand() * currentIndex);
    currentIndex--;

    [arr[currentIndex], arr[randomIndex]] = [
      arr[randomIndex],
      arr[currentIndex],
    ];
  }

  return arr;
}

export function formatDiffField(value) {
  if (isNaN(value)) return value;
  // Most diffed fields are integer-valued. toFixed+parseFloat is a string
  // round-trip we want to skip for those; only non-integer numerics need
  // the 2-decimal truncation.
  if (Number.isInteger(value)) return value;
  return parseFloat(value.toFixed(2));
}

// Math.ceil with float-precision correction — snaps results that are within
// 1e-9 of an integer to that integer before ceiling, so artifacts like
// `Math.ceil(40 * 0.2 * 3)` rounding 24.000000000000004 up to 25 don't
// leak into integer-domain score results.
export function safeCeil(value) {
  const rounded = Math.round(value);
  if (Math.abs(value - rounded) < 1e-9) return rounded;
  return Math.ceil(value);
}

export function shallowCopy(state) {
  // `.slice()` is meaningfully faster than `[...state]` for a 90-slot
  // array in V8 (native memcpy vs. iterator-protocol spread).
  return state.slice();
}

// Recursive clone for state slots that aren't copy-on-write.
// Arrays are shallow-sliced: primitive arrays (card piles, logs) are
// mutated in place, while object arrays (effects, cardMap) only ever have
// entries replaced, never mutated, so sharing entries is safe.
function cloneValue(v) {
  if (Array.isArray(v)) return v.slice();
  // Effects and cardMap entries are replaced, never mutated.
  if (v.effectInstanceId !== undefined) return v;
  if (v.baseId !== undefined) return v;
  const out = {};
  for (const k in v) {
    const val = v[k];
    if (val === null || typeof val !== "object") {
      out[k] = val;
    } else {
      out[k] = cloneValue(val);
    }
  }
  return out;
}

const SHARED_SLOTS = new Uint8Array(ALL_FIELDS.length);
for (const field of COPY_ON_WRITE_FIELDS) SHARED_SLOTS[field] = 1;

export function deepCopy(state) {
  const out = state.slice();
  for (let i = 0; i < out.length; i++) {
    if (SHARED_SLOTS[i]) continue;
    const v = out[i];
    if (v !== null && typeof v === "object") {
      out[i] = cloneValue(v);
    }
  }
  return out;
}

export function isUniqueCard(card) {
  return card.unique && !["L", "T"].includes(card.rarity);
}

export function getBaseId(entity) {
  if (entity.upgraded) return entity.id - 1;
  return entity.id;
}
