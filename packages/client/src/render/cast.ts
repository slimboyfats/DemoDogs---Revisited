import type { StaticProp, World } from '@demodogs/sim';
import { sliceX, sliceY, tall, type Strip } from './stack';

/** Where the sun throws a shadow: art px across the ground per art px of height. */
export const SUN: readonly [number, number] = [0.32, 0.22];

/** Scenery this tall (art px), or standing up off the ground, throws a shadow of its own shape. */
const TALL = 14;
/** cot of the camera pitch, and how wide the shade beyond a deck's far edge is (art px). */
const OVER = 0.67;
const FAR_BAND = 36;

/** Does this piece of scenery throw a shadow of its own shape (rather than a soft oval)? */
export function casts(s: StaticProp, strip: Strip): boolean {
  return (s.lift ?? 0) > 0 || tall(strip) >= TALL;
}

/**
 * The shadows tall scenery throws on the ground, cast from its own shape: every layer of the stack
 * is laid on the ground where the sun would throw it from its height, and the shadow is where any
 * of them land. A crown throws a dappled shadow through its gaps, a deck a hard band, a trunk a
 * long stripe. One byte per art pixel of ground; `dirty` is the box changed since it was last read.
 */
export class ShadowMap {
  readonly mask: Uint8Array;
  /** How much deeper than a cast shadow the shade is, a byte per art px: the far side of a deck. */
  readonly deep: Uint8Array;
  dirty: [number, number, number, number] | null = null;
  private readonly casters: StaticProp[] = [];
  private readonly seen = new Map<StaticProp, number>();

  constructor(
    readonly w: number,
    readonly h: number,
    private readonly stripOf: (s: StaticProp) => Strip,
    private readonly rgba: (s: Strip) => Uint8ClampedArray,
  ) {
    this.mask = new Uint8Array(w * h);
    this.deep = new Uint8Array(w * h);
  }

  /** Cast every tall piece of scenery that is standing. */
  build(statics: readonly StaticProp[]): void {
    for (const s of statics)
      if (!s.down && casts(s, this.stripOf(s))) {
        this.casters.push(s);
        this.seen.set(s, state(s));
        this.cast(s);
      }
    this.dirty = [0, 0, this.w, this.h];
  }

  /** Cast again round anything that has come down or lost leaves since the last call. */
  update(w: World): void {
    for (const s of this.casters) {
      const now = state(s);
      if (now === this.seen.get(s)) continue;
      this.seen.set(s, now);
      const [x0, y0, x1, y1] = this.reach(s);
      for (let y = Math.max(0, y0); y < Math.min(this.h, y1); y++) {
        this.mask.fill(0, y * this.w + Math.max(0, x0), y * this.w + Math.min(this.w, x1));
        this.deep.fill(0, y * this.w + Math.max(0, x0), y * this.w + Math.min(this.w, x1));
      }
      // what else throws a shadow into that box: its neighbours, and tall things a little way off
      const r = Math.max(x1 - x0, y1 - y0);
      for (const o of w.near((x0 + x1) / 2, (y0 + y1) / 2, r))
        if (!o.down && this.seen.has(o)) this.cast(o, x0, y0, x1, y1);
      this.mark(x0, y0, x1, y1);
    }
  }

  /** The box a piece's shadow can fall in, whole art px. */
  private reach(s: StaticProp): [number, number, number, number] {
    const st = this.stripOf(s);
    const top = (s.lift ?? 0) + tall(st);
    const r = Math.hypot(st.cw, st.ch) / st.res / 2 + 1;
    return [
      Math.floor(s.x - r),
      Math.floor(s.y - r - ((s.lift ?? 0) > 0 ? top * OVER + FAR_BAND : 0)),
      Math.ceil(s.x + r + top * SUN[0]),
      Math.ceil(s.y + r + top * SUN[1]),
    ];
  }

  private mark(x0: number, y0: number, x1: number, y1: number): void {
    const d = this.dirty;
    if (!d) this.dirty = [x0, y0, x1, y1];
    else {
      d[0] = Math.min(d[0], x0);
      d[1] = Math.min(d[1], y0);
      d[2] = Math.max(d[2], x1);
      d[3] = Math.max(d[3], y1);
    }
  }

  /** Lay one piece's shadow down, within the box given (default: anywhere). */
  private cast(s: StaticProp, bx0 = 0, by0 = 0, bx1 = this.w, by1 = this.h): void {
    const st = this.stripOf(s);
    const px = this.rgba(st);
    const R = st.res;
    const W = st.img.width;
    const cs = Math.cos(s.rot);
    const sn = Math.sin(s.rot);
    const lift = s.lift ?? 0;
    const hw = st.cw / R / 2;
    const hh = st.ch / R / 2;
    const M = this.mask;
    // one sample per art px: a layer at a time, its texels at the middle of each art px
    for (let i = Math.floor(R / 2); i < st.n; i += R) {
      const z = lift + i / R;
      if (z < 0) continue;
      const ox = s.x + z * SUN[0];
      const oy = s.y + z * SUN[1];
      const sx0 = sliceX(st, i);
      const sy0 = sliceY(st, i);
      for (let ty = Math.floor(R / 2); ty < st.ch; ty += R)
        for (let tx = Math.floor(R / 2); tx < st.cw; tx += R) {
          if (px[((sy0 + ty) * W + sx0 + tx) * 4 + 3]! < 128) continue;
          const lx = (tx + 0.5) / R - hw;
          const ly = (ty + 0.5) / R - hh;
          const gx = Math.floor(ox + lx * cs - ly * sn);
          const gy = Math.floor(oy + lx * sn + ly * cs);
          if (gx < bx0 || gy < by0 || gx >= bx1 || gy >= by1) continue;
          M[gy * this.w + gx] = 255;
        }
    }
    if (lift <= 0 || s.def.crown) return;
    // a deck is only ever seen from this side: the ground beyond its far edge lies in shade
    // just past what the deck hides, or nothing would tell the drop there
    // (deepest at the foot of the drop, thinning out over the band)
    const hid = (lift + st.n / R) * OVER;
    for (let ly = -hh; ly < hh; ly++)
      for (let lx = -hw; lx < hw; lx++) {
        const gx = Math.floor(s.x + (lx + 0.5) * cs - (ly + 0.5) * sn);
        const y0 = s.y - hid + (lx + 0.5) * sn + (ly + 0.5) * cs;
        if (gx < bx0 || gx >= bx1) continue;
        for (let k = 0; k < FAR_BAND; k++) {
          const gy = Math.floor(y0 - k);
          if (gy < by0 || gy >= by1) continue;
          const t = 1 - k / FAR_BAND;
          const v = Math.round(255 * Math.min(1, t * 2));
          if (v > M[gy * this.w + gx]!) M[gy * this.w + gx] = v;
          const d = Math.round(255 * t);
          if (d > this.deep[gy * this.w + gx]!) this.deep[gy * this.w + gx] = d;
        }
      }
  }
}

/** What about a piece changes its shadow: whether it stands, and how much crown it has left. */
function state(s: StaticProp): number {
  return s.down ? -1 : Math.round((s.leaves ?? 1) * 8);
}
