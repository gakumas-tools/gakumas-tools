import {
  loadoutFromSearchParams,
  loadoutsFromSearchParams,
} from "@/utils/simulator";

// Link contest share URLs carry each idol's loadout in a repeated `loadout`
// param instead of top-level stage/items/cards; preview the first idol's.
export function previewLoadoutFromSearchParams(searchParams) {
  const [first] = loadoutsFromSearchParams(searchParams);
  return first || loadoutFromSearchParams(searchParams);
}

// Next passes repeated query keys as arrays; URLSearchParams(record) would
// join them with commas into a single value.
export function searchParamsFromRecord(record) {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(record)) {
    for (const v of [].concat(value)) {
      if (v != null) searchParams.append(key, v);
    }
  }
  return searchParams;
}
