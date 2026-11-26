/**
 * The effects' own dice: a number from 0 up to (not including) 1, like `Math.random`, for things
 * that are only for show. Fire, smoke and grit roll tens of thousands of times a second in a big
 * fight, and `Math.random` hands every number back as a new object for the collector to clear
 * away; this one is a few shifts on a whole number that the engine keeps in a register
 * (xorshift32). Never for the sim: its dice are `world.rng`.
 */
// (kept in an array of whole numbers: a 32-bit number in a plain variable is itself an object)
const S = new Uint32Array([(Math.random() * 0x100000000) | 0 || 0x2545f491]);

export function roll(): number {
  let s = S[0]!;
  s ^= s << 13;
  s ^= s >>> 17;
  s ^= s << 5;
  S[0] = s;
  return (s >>> 0) * 2.3283064365386963e-10;
}

/** Start the dice from `seed` (a whole number, not 0): the same seed, the same rolls. */
export function seedDice(seed: number): void {
  S[0] = seed | 0 || 0x2545f491;
}
