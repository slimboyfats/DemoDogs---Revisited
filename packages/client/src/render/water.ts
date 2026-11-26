import type { MaterialManifest } from '@demodogs/shared';
import type { World } from '@demodogs/sim';

/** Art px to a texel of the water map. */
export const WATER_Q = 4;
/** How far outside the water (art px) the map still knows the way to the shore. */
export const WATER_OUT = 16;
/** The furthest in from the shore (art px) the map tells apart. */
export const WATER_IN = 111;

/** A box of the map's texels that changed: x0, y0, x1, y1 (the last two past the end). */
export type Box = [number, number, number, number];

/** Deep water is the same water, darker and bluer: there is more of it to look down into. */
export function deepOf(rgb: readonly [number, number, number]): [number, number, number] {
  return [rgb[0] * 0.45 + 8, rgb[1] * 0.5 + 24, rgb[2] * 0.56 + 40];
}

/**
 * Where the water is, for the ground's painter (pixel/ground-paint-glsl.ts `waterOver`): every
 * pool of a material with `water` the world holds, as one map of how far each spot is in from the
 * shore (pools that touch are one water) and what colour the water is there, darker where it is
 * too deep to wade. The shader reads it between its texels, so a shore is a smooth line however
 * coarse the map, and animates the rest itself: nothing here moves. What stands in the water
 * (scenery, ground raised out of it) is cut out of it, so foam gathers round its foot.
 *
 * Kept as the sim's own shapes (circles of the pools' radii), so the water drawn is the water a
 * car wades: `waterAt` in the sim asks the same question of the same pools.
 */
export class WaterMap {
  readonly gw: number;
  readonly gh: number;
  /** A texel: the water's colour, then (px in from the shore + WATER_OUT) * 2. */
  readonly data: Uint8Array;
  /** What changed since a renderer last took the map, or null. */
  dirty: Box | null = null;
  /** Whether there is any water at all (the painter is not asked for it until there is). */
  any = false;
  /** Px in from the shore of the water alone, how deep (0 to 1), and how near something dry. */
  private readonly far: Float32Array;
  private readonly deep: Float32Array;
  /** The colour of the water's own material at each texel. */
  private readonly tint: Uint8Array;
  private land: Float32Array | null = null;

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.gw = Math.ceil(w / WATER_Q) + 1;
    this.gh = Math.ceil(h / WATER_Q) + 1;
    this.data = new Uint8Array(this.gw * this.gh * 4);
    this.far = new Float32Array(this.gw * this.gh).fill(-WATER_OUT);
    this.deep = new Float32Array(this.gw * this.gh);
    this.tint = new Uint8Array(this.gw * this.gh * 3);
  }

  /** The water a world starts with, and what stands in it. */
  static of(w: World): WaterMap {
    const M = new WaterMap(w.w, w.h);
    for (const s of w.spills) if (s.def.water) M.pour(s.def, s.x, s.y, s.r, false);
    if (M.any) {
      M.stand(w);
      M.write(0, 0, M.gw, M.gh);
    }
    return M;
  }

  /** A pool of water of radius r at (x, y): new, or one that has grown. */
  pour(m: MaterialManifest, x: number, y: number, r: number, write = true): void {
    const rgb = parseInt(m.colour.slice(1), 16);
    const col = [(rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255] as const;
    const deepFrom = m.water?.deep;
    const R = r + WATER_OUT;
    const x0 = Math.max(0, Math.floor((x - R) / WATER_Q));
    const y0 = Math.max(0, Math.floor((y - R) / WATER_Q));
    const x1 = Math.min(this.gw, Math.ceil((x + R) / WATER_Q) + 1);
    const y1 = Math.min(this.gh, Math.ceil((y + R) / WATER_Q) + 1);
    const T = this.tint;
    for (let gy = y0; gy < y1; gy++)
      for (let gx = x0; gx < x1; gx++) {
        const d = r - Math.hypot(gx * WATER_Q - x, gy * WATER_Q - y);
        if (d <= -WATER_OUT) continue;
        const k = gy * this.gw + gx;
        if (deepFrom !== undefined) {
          const t = Math.min(1, Math.max(0, (d - deepFrom + 10) / 14));
          if (t > this.deep[k]!) this.deep[k] = t;
        }
        if (d <= this.far[k]!) continue;
        this.far[k] = d;
        T[k * 3] = col[0];
        T[k * 3 + 1] = col[1];
        T[k * 3 + 2] = col[2];
      }
    this.any = true;
    if (write) this.write(x0, y0, x1, y1);
  }

  /**
   * What stands in the water is not water: scenery with a foot on the bed, and ground raised out
   * of it (a causeway, a jump piece). How far every texel is from the nearest of them.
   */
  private stand(w: World): void {
    const { gw, gh } = this;
    const L = new Float32Array(gw * gh).fill(1e4);
    let any = false;
    const R = w.relief;
    if (R?.plat)
      for (let gy = 0; gy < gh; gy++)
        for (let gx = 0; gx < gw; gx++) {
          const k = gy * gw + gx;
          if (this.far[k]! > -WATER_OUT && R.platAt(gx * WATER_Q, gy * WATER_Q) > 1) {
            L[k] = 0;
            any = true;
          }
        }
    for (const s of w.statics) {
      const d = s.def;
      if (s.down || !d.solid || d.pad || s.lift || d.radius < 3) continue;
      const gx = Math.round(s.x / WATER_Q);
      const gy = Math.round(s.y / WATER_Q);
      if (gx < 0 || gy < 0 || gx >= gw || gy >= gh || this.far[gy * gw + gx]! <= 0) continue;
      // (its foot is narrower than its reach: the foam should lap against what is seen)
      const r = d.radius * 0.6;
      const n = Math.ceil(r / WATER_Q);
      for (let oy = -n; oy <= n; oy++)
        for (let ox = -n; ox <= n; ox++) {
          const x = gx + ox;
          const y = gy + oy;
          if (x < 0 || y < 0 || x >= gw || y >= gh) continue;
          const e = Math.hypot(x * WATER_Q - s.x, y * WATER_Q - s.y) - r;
          const k = y * gw + x;
          if (e < L[k]!) L[k] = Math.max(0, e);
          any = true;
        }
    }
    if (!any) return;
    // how far from the nearest: two sweeps, each texel a step on from its neighbours
    const A = WATER_Q;
    const B = WATER_Q * Math.SQRT2;
    for (let y = 0; y < gh; y++)
      for (let x = 0; x < gw; x++) {
        const k = y * gw + x;
        let v = L[k]!;
        if (x > 0) v = Math.min(v, L[k - 1]! + A);
        if (y > 0) {
          v = Math.min(v, L[k - gw]! + A);
          if (x > 0) v = Math.min(v, L[k - gw - 1]! + B);
          if (x < gw - 1) v = Math.min(v, L[k - gw + 1]! + B);
        }
        L[k] = v;
      }
    for (let y = gh - 1; y >= 0; y--)
      for (let x = gw - 1; x >= 0; x--) {
        const k = y * gw + x;
        let v = L[k]!;
        if (x < gw - 1) v = Math.min(v, L[k + 1]! + A);
        if (y < gh - 1) {
          v = Math.min(v, L[k + gw]! + A);
          if (x < gw - 1) v = Math.min(v, L[k + gw + 1]! + B);
          if (x > 0) v = Math.min(v, L[k + gw - 1]! + B);
        }
        L[k] = v;
      }
    this.land = L;
  }

  /** Px in from the shore at a texel, what stands in the water counted as shore. */
  private at(k: number): number {
    const d = this.far[k]!;
    const L = this.land;
    // (a little short of it: the thing's own foot is the shore)
    return L ? Math.min(d, L[k]! - 3) : d;
  }

  /** How far in from the shore the map says (x, y) is: under 0 on dry ground. */
  depth(x: number, y: number): number {
    const gx = Math.min(this.gw - 1, Math.max(0, Math.round(x / WATER_Q)));
    const gy = Math.min(this.gh - 1, Math.max(0, Math.round(y / WATER_Q)));
    return this.at(gy * this.gw + gx);
  }

  /** Lay texels out for the shader from what is known of them, and note them changed. */
  private write(x0: number, y0: number, x1: number, y1: number): void {
    const D = this.data;
    for (let gy = y0; gy < y1; gy++)
      for (let gx = x0; gx < x1; gx++) {
        const k = gy * this.gw + gx;
        const d = this.at(k);
        D[k * 4 + 3] = Math.round(
          Math.min(255, Math.max(0, (Math.min(d, WATER_IN) + WATER_OUT) * 2)),
        );
        // the colour of the water that reaches furthest here, darker as it gets too deep
        const t = this.deep[k]!;
        const T = this.tint;
        const c: [number, number, number] = [T[k * 3]!, T[k * 3 + 1]!, T[k * 3 + 2]!];
        const dk = t > 0 ? deepOf(c) : c;
        for (let n = 0; n < 3; n++) D[k * 4 + n] = Math.round(c[n]! + (dk[n]! - c[n]!) * t);
      }
    const B = this.dirty;
    if (!B) this.dirty = [x0, y0, x1, y1];
    else {
      B[0] = Math.min(B[0], x0);
      B[1] = Math.min(B[1], y0);
      B[2] = Math.max(B[2], x1);
      B[3] = Math.max(B[3], y1);
    }
  }
}
