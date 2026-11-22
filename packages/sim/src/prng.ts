/**
 * sfc32: a small, fast, seedable PRNG. Every random choice in the sim comes from one of these, so a
 * seed and the same inputs always replay the same race.
 */
export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: number) {
    this.a = 0x9e3779b9;
    this.b = 0x243f6a88;
    this.c = 0xb7e15162;
    this.d = seed | 0;
    for (let i = 0; i < 12; i++) this.next();
  }

  /** A float in [0, 1). */
  next(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return (t >>> 0) / 4294967296;
  }

  /** A float in [lo, hi). */
  range(lo: number, hi: number): number {
    return lo + this.next() * (hi - lo);
  }

  /** An integer in [0, n). */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('pick from an empty list');
    return items[this.int(items.length)]!;
  }

  /** A copy of items in a random order. */
  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const tmp = out[i]!;
      out[i] = out[j]!;
      out[j] = tmp;
    }
    return out;
  }

  /** The state, for hashing. */
  state(): [number, number, number, number] {
    return [this.a, this.b, this.c, this.d];
  }
}
