import { SHOULDER, laneWide, lanesOf, liftsOf, type World } from '@demodogs/sim';
import {
  Field,
  VERGE,
  bends,
  rgbOf,
  terrainOf,
  terrainPixel,
  type Fields,
  type Line,
  type Rgb,
  type RoadStyle,
  type Terrain,
} from './terrain';

/**
 * What the ground shader needs to paint a venue's country and road itself, at whatever fineness
 * the screen has, instead of reading them from a map painted one texel to the art pixel
 * (pixel/ground-paint-glsl.ts is the painter; terrain.ts is the same painter for a canvas).
 * Nothing here is a picture: it is the noise the country is drawn from, where the road's line
 * runs, and which stretch of it every part of the map is nearest to.
 */
export interface GroundPaint {
  /** The bright look: sunny colours, plain clean roads, a mown lawn. */
  bright: boolean;
  w: number;
  h: number;
  seed: number;
  terrain: Terrain;
  style: RoadStyle;
  ground: Rgb;
  ground2: Rgb;
  dirt: Rgb;
  outside: Rgb;
  road: number;
  /** The four noise fields, a grid point to `Field.Q` px: big, mid, bare, small. */
  fields: { gw: number; gh: number; data: Float32Array };
  /** The road, if the venue has one. */
  line: {
    n: number;
    step: number;
    /** Three rows of four a sample: x, y, angle, bend (`OFF` where no road is on the ground);
     * lane width and outer edge on the - side, then the + side; how far up its ramp. */
    samples: Float32Array;
    /** Nearest sample to each block of `NEAR_Q` px (road on the ground, road on a deck), or NONE. */
    near: { gw: number; gh: number; data: Uint16Array };
    /** How far each block of `WILD_Q` px is from the road. */
    wild: { gw: number; gh: number; data: Float32Array };
    wildFrom: number;
    wildTo: number;
    apron: [number, number];
    lanes: boolean;
    gully: boolean;
  } | null;
  oval: { cx: number; cy: number; rx: number; ry: number } | null;
}

export const NEAR_Q = 2;
export const WILD_Q = 8;
export const NONE = 0xffff;
/** A sample's bend when no road lies on the ground there (the road is up on a deck). */
export const OFF = 99;

/** For every block of `q` px: the nearest of the line's samples that `use` allows, within `reach`. */
export function nearest(
  T: Line,
  w: number,
  h: number,
  q: number,
  reach: (i: number) => number,
  use: (i: number) => boolean,
  out: Uint16Array,
  gw: number,
  gh: number,
  channel: number,
): void {
  const dist = new Float32Array(gw * gh).fill(1e9);
  for (let i = 0; i < T.n; i++) {
    if (!use(i)) continue;
    const R = reach(i);
    const sx = T.x[i]!;
    const sy = T.y[i]!;
    const x0 = Math.max(0, Math.floor((sx - R) / q));
    const x1 = Math.min(gw - 1, Math.ceil((sx + R) / q));
    const y0 = Math.max(0, Math.floor((sy - R) / q));
    const y1 = Math.min(gh - 1, Math.ceil((sy + R) / q));
    const RR = (R + q) * (R + q);
    for (let y = y0; y <= y1; y++) {
      const dy = (y + 0.5) * q - sy;
      let k = y * gw + x0;
      for (let x = x0; x <= x1; x++, k++) {
        const dx = (x + 0.5) * q - sx;
        const d = dx * dx + dy * dy;
        if (d < dist[k]! && d <= RR) {
          dist[k] = d;
          out[k * 2 + channel] = i;
        }
      }
    }
  }
}

/** Gather what the shader paints a world's ground from. */
export function bakePaint(w: World, F: Fields, bright = false): GroundPaint {
  const V = w.venue;
  const C = V.colors;
  const T = w.track;
  const D = w.deckH;
  const up = (i: number) => D !== null && !!T && D[i % T.n]! > 3;
  const grids = [F.big, F.mid, F.bare, F.small].map((f) => f.grid());
  const { gw, gh } = grids[0]!;
  const data = new Float32Array(gw * gh * 4);
  for (let c = 0; c < 4; c++) {
    const v = grids[c]!.v;
    for (let k = 0; k < v.length; k++) data[k * 4 + c] = v[k]!;
  }
  let line: GroundPaint['line'] = null;
  if (T) {
    const half = w.road / 2;
    const B = bends(T);
    const raised = V.track?.raised;
    const L = raised?.length ? lanesOf(T, liftsOf(T, raised), w.road, w.tuning) : null;
    const samples = new Float32Array(T.n * 12);
    const outer = new Float32Array(T.n);
    let lanes = false;
    let gully = false;
    for (let i = 0; i < T.n; i++) {
      samples[i * 4] = T.x[i]!;
      samples[i * 4 + 1] = T.y[i]!;
      samples[i * 4 + 2] = T.a[i]!;
      samples[i * 4 + 3] = up(i) ? OFF : B[i]!;
      if (up(i)) gully = true;
      const o = T.n * 4 + i * 4;
      if (L)
        for (const side of [-1, 1]) {
          const wide = laneWide(L, i, side);
          if (wide <= 0) continue;
          // (a lane begins as a point against the platform and widens over its first few px)
          let q = 0;
          while (q < 12 && laneWide(L, (i - q - 1 + T.n) % T.n, side) > 0) q++;
          const out = half + SHOULDER + wide * Math.min(1, (q + 1) / 8) + 3;
          samples[o + (side < 0 ? 0 : 2)] = wide;
          samples[o + (side < 0 ? 1 : 3)] = out;
          outer[i] = Math.max(outer[i]!, out);
          lanes = true;
        }
      samples[T.n * 8 + i * 4] = L ? L.rise[i]! : 1;
    }
    let reachAll = half + VERGE;
    for (let i = 0; i < T.n; i++) reachAll = Math.max(reachAll, outer[i]! + 2);
    const ngw = Math.ceil(w.w / NEAR_Q);
    const ngh = Math.ceil(w.h / NEAR_Q);
    const near = new Uint16Array(ngw * ngh * 2).fill(NONE);
    nearest(
      T,
      w.w,
      w.h,
      NEAR_Q,
      // (every sample reaches as far as the widest lane does, or a lane's own samples would be
      // nearest to ground that lies beyond the plain road before and after it)
      () => reachAll,
      (i) => !up(i),
      near,
      ngw,
      ngh,
      0,
    );
    if (gully) nearest(T, w.w, w.h, NEAR_Q, () => half + 18, up, near, ngw, ngh, 1);
    // how far each block of the map is from the road (terrain.ts paintWilds)
    const wildFrom = half + 120;
    const wildTo = half + 380;
    const Q = WILD_Q;
    const wgw = Math.ceil(w.w / Q) + 1;
    const wgh = Math.ceil(w.h / Q) + 1;
    const dist = new Float32Array(wgw * wgh).fill(1e9);
    const R = Math.ceil(wildTo / Q) + 1;
    for (let i = 0; i < T.n; i += 2) {
      const cx = Math.round(T.x[i]! / Q);
      const cy = Math.round(T.y[i]! / Q);
      for (let gy = Math.max(0, cy - R); gy <= Math.min(wgh - 1, cy + R); gy++)
        for (let gx = Math.max(0, cx - R); gx <= Math.min(wgw - 1, cx + R); gx++) {
          const dx = gx * Q - T.x[i]!;
          const dy = gy * Q - T.y[i]!;
          const d = dx * dx + dy * dy;
          const k = gy * wgw + gx;
          if (d < dist[k]!) dist[k] = d;
        }
    }
    for (let k = 0; k < dist.length; k++) dist[k] = Math.min(wildTo, Math.sqrt(dist[k]!));
    line = {
      n: T.n,
      step: T.step,
      samples,
      near: { gw: ngw, gh: ngh, data: near },
      wild: { gw: wgw, gh: wgh, data: dist },
      wildFrom,
      wildTo,
      apron: [T.n - Math.round(150 / T.step), Math.round(30 / T.step)],
      lanes,
      gully,
    };
  }
  return {
    bright,
    w: w.w,
    h: w.h,
    seed: V.seed,
    terrain: terrainOf(C),
    style: C.road ?? 'tarmac',
    ground: rgbOf(C.ground),
    ground2: rgbOf(C.ground2),
    dirt: rgbOf(C.dirt),
    outside: rgbOf(C.outside),
    road: w.road,
    fields: { gw, gh, data },
    line,
    oval: w.oval ? { cx: w.oval.cx, cy: w.oval.cy, rx: w.oval.rx, ry: w.oval.ry } : null,
  };
}

/** About what colour the ground is at (x, y): the road's own, or the country's. */
export function toneAt(w: World, P: GroundPaint, F: Fields, x: number, y: number): Rgb {
  const out = plainTone(w, P, F, x, y);
  if (P.bright) {
    // as the painter's `sunny` does: more colour, more light
    const l = out[0] * 0.3 + out[1] * 0.55 + out[2] * 0.15;
    for (let c = 0; c < 3; c++)
      out[c] = Math.min(255, Math.max(0, l + (out[c]! - l) * 1.35) * 1.3 + 14);
    if (P.style !== 'dirt' && w.track && !w.offroad(x, y)) out.splice(0, 3, 122, 126, 140);
  }
  return out;
}

function plainTone(w: World, P: GroundPaint, F: Fields, x: number, y: number): Rgb {
  const out: Rgb = [0, 0, 0];
  if (w.track && !w.offroad(x, y)) {
    if (P.style === 'dirt')
      for (let c = 0; c < 3; c++) out[c] = (P.dirt[c]! * 0.75 + P.ground[c]! * 0.25) * 0.84;
    else for (let c = 0; c < 3; c++) out[c] = 0x4a * 0.88 + P.ground[c]! * 0.072;
    return out;
  }
  terrainPixel(out, Math.floor(x), Math.floor(y), P.terrain, P.ground, P.ground2, P.dirt, F);
  return out;
}

export { Field };
