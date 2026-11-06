// Math.floor for products of integers and decimal multipliers. Floats land
// just below whole results (5400 * 2.3 = 12419.999999999998), which a plain
// floor turns into one point too few, so round off the float error first.
export function exactFloor(value) {
  return Math.floor(Math.round(value * 1e6) / 1e6);
}
