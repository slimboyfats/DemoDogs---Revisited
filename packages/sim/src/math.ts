export const TAU = Math.PI * 2;

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** The signed difference a - b between two angles, in (-PI, PI]. */
export function angDiff(a: number, b: number): number {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** FNV-1a over 32-bit words; for state hashes. */
export class Hasher {
  private h = 0x811c9dc5;
  private readonly f = new Float64Array(1);
  private readonly u = new Uint32Array(this.f.buffer);

  num(v: number): this {
    this.f[0] = Math.round(v * 1000) / 1000;
    this.word(this.u[0]!);
    this.word(this.u[1]!);
    return this;
  }

  word(v: number): this {
    for (let k = 0; k < 4; k++) {
      this.h ^= (v >>> (k * 8)) & 255;
      this.h = Math.imul(this.h, 0x01000193);
    }
    return this;
  }

  str(s: string): this {
    for (let i = 0; i < s.length; i++) this.word(s.charCodeAt(i));
    return this;
  }

  hex(): string {
    return (this.h >>> 0).toString(16).padStart(8, '0');
  }
}
