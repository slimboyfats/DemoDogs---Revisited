/**
 * What the ground is made of, a pixel at a time. `paintTerrain` fills a map with a venue's own
 * country (grass with bare earth and long grass, churned dirt, rippled sand, drifted snow, loose
 * gravel or paving slabs); `paintRoad` lays the road over it in the road's own coordinates
 * (across and along), so kerbs, lines, wheel ruts and verges follow every bend. Nothing here
 * touches the DOM: both write into a plain RGBA buffer, once, before the race.
 */

export type Terrain = 'grass' | 'dirt' | 'sand' | 'snow' | 'gravel' | 'paved';
export type RoadStyle = 'tarmac' | 'dirt';
/** `toy`: everything clean and bright, like a model on a table. */
export type GroundStyle = 'toy';

export interface GroundColors {
  ground: string;
  ground2: string;
  dirt: string;
  outside: string;
  terrain?: Terrain | undefined;
  road?: RoadStyle | undefined;
  style?: GroundStyle | undefined;
}

export type Rgb = [number, number, number];

export const rgbOf = (hex: string): Rgb => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

/** The country a venue is in: what its manifest says, or else what its ground colour looks like. */
export function terrainOf(c: GroundColors): Terrain {
  if (c.terrain) return c.terrain;
  const [r, g, b] = rgbOf(c.ground);
  if (g > r * 1.12 && g > b * 1.12) return 'grass';
  const sat = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
  if (r + g + b > 520) return r > b * 1.25 ? 'sand' : 'snow';
  if (sat < 0.075) return 'gravel';
  return 'dirt';
}

/** A number from 0 to 1 for a whole-number point, the same every time. */
export function hash2(x: number, y: number, seed: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed, 974711)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const smooth = (t: number): number => t * t * (3 - 2 * t);

function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = smooth(x - xi);
  const fy = smooth(y - yi);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/**
 * Soft noise over a map, in blobs about `wave` pixels across, spread to fill 0..1. Worked out on a
 * coarse grid (one value to 4x4 pixels) and read between its points, so a whole map is cheap.
 */
export class Field {
  private readonly gw: number;
  private readonly gh: number;
  private readonly v: Float32Array;
  static readonly Q = 4;

  constructor(w: number, h: number, wave: number, seed: number, octaves = 3) {
    const Q = Field.Q;
    this.gw = Math.ceil(w / Q) + 2;
    this.gh = Math.ceil(h / Q) + 2;
    this.v = new Float32Array(this.gw * this.gh);
    let norm = 0;
    for (let o = 0; o < octaves; o++) norm += 0.5 ** o;
    for (let gy = 0; gy < this.gh; gy++)
      for (let gx = 0; gx < this.gw; gx++) {
        let s = 0;
        for (let o = 0; o < octaves; o++) {
          const f = 2 ** o / wave;
          s += valueNoise(gx * Q * f, gy * Q * f, seed + o * 31) * 0.5 ** o;
        }
        const n = (s / norm - 0.5) * 2.1 + 0.5;
        this.v[gy * this.gw + gx] = n < 0 ? 0 : n > 1 ? 1 : n;
      }
  }

  at(x: number, y: number): number {
    const Q = Field.Q;
    // (a point off the map reads the nearest edge)
    const fx = Math.min(this.gw - 1, Math.max(0, x / Q));
    const fy = Math.min(this.gh - 1, Math.max(0, y / Q));
    const xi = Math.min(this.gw - 2, Math.floor(fx));
    const yi = Math.min(this.gh - 2, Math.floor(fy));
    const tx = fx - xi;
    const ty = fy - yi;
    const k = yi * this.gw + xi;
    const v = this.v;
    const a = v[k]!;
    const b = v[k + 1]!;
    const c = v[k + this.gw]!;
    const d = v[k + this.gw + 1]!;
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  }
}

/** The noise a venue's ground is drawn from: big country, middling patches, small clumps. */
export interface Fields {
  big: Field;
  mid: Field;
  bare: Field;
  small: Field;
  seed: number;
}

export function makeFields(w: number, h: number, seed: number): Fields {
  return {
    big: new Field(w, h, 210, seed + 1, 3),
    mid: new Field(w, h, 70, seed + 2, 2),
    bare: new Field(w, h, 120, seed + 3, 3),
    small: new Field(w, h, 22, seed + 4, 1),
    seed,
  };
}

const clamp255 = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : v);

// the pixel being mixed (kept out here so painting a map allocates nothing per pixel)
let pr = 0;
let pg = 0;
let pb = 0;
const set = (C: Rgb, m = 1): void => {
  pr = C[0] * m;
  pg = C[1] * m;
  pb = C[2] * m;
};
/** The heights (of the big noise) at which the country steps up a level. */
export const LEDGES = [0.3, 0.68];
const BRIGHT: Rgb = [246, 249, 253];
const ICE: Rgb = [150, 182, 208];
const THIN_ICE: Rgb = [172, 198, 220];

/** One pixel of open country at (x, y), written to `out` (r, g, b). */
export function terrainPixel(
  out: Rgb,
  x: number,
  y: number,
  terrain: Terrain,
  G: Rgb,
  G2: Rgb,
  D: Rgb,
  F: Fields,
): void {
  const h = hash2(x, y, F.seed);
  const a = F.big.at(x, y) + (h - 0.5) * 0.09;
  const b = F.mid.at(x, y);
  const e = F.bare.at(x, y) + (hash2(x, y, F.seed + 9) - 0.5) * 0.1;
  const c = F.small.at(x, y);
  pr = G[0];
  pg = G[1];
  pb = G[2];
  let k = 1;
  switch (terrain) {
    case 'grass': {
      // lush hollows, the plain grass, lighter rises, and dry straw on the tops
      if (a < 0.3) k = 0.82;
      else if (a < 0.48) k = 0.92;
      else if (a < 0.68) k = 1;
      else if (a < 0.84) set(G2);
      else {
        pr = G2[0] * 1.2;
        pg = G2[1] * 1.07;
        pb = G2[2] * 0.92;
      }
      // bare earth where the grass has worn through, ringed with dry grass
      if (e > 0.88) set(D, 0.9 + c * 0.2);
      else if (e > 0.83) {
        pr = (pr + D[0]) / 2;
        pg = (pg + D[1]) / 2;
        pb = (pb + D[2]) / 2;
      } else if (c > 0.7 && b > 0.45) {
        // clumps of long grass: dark blades two pixels tall, a light tip here and there
        const blade = hash2(x, y >> 1, F.seed + 5);
        if (blade < 0.5) k *= 0.76;
        else if (blade > 0.93) k *= 1.22;
      }
      break;
    }
    case 'dirt': {
      // damp dark ground, the plain dirt, dusty pale rises
      if (a < 0.28) k = 0.8;
      else if (a < 0.48) k = 0.91;
      else if (a < 0.7) k = 1;
      else if (a < 0.86) set(G2);
      else set(G2, 1.1);
      // beds of loose stones
      if (b > 0.68) {
        if (h < 0.2) k *= 1.32;
        else if (h > 0.84) k *= 0.68;
      }
      // puddled hollows gone to dark crust
      if (e > 0.82) set(D, 0.82 + c * 0.15);
      break;
    }
    case 'sand': {
      if (a < 0.3) k = 0.88;
      else if (a < 0.5) k = 0.95;
      else if (a < 0.72) k = 1;
      else set(G2, a < 0.88 ? 1 : 1.06);
      // wind ripples across the open sand: a dark line with a light one behind it
      if (a > 0.42 && e < 0.78) {
        const wave = (((y + Math.round((b - 0.5) * 70 + x * 0.12)) % 6) + 6) % 6;
        if (wave === 0) k *= 0.9;
        else if (wave === 1) k *= 1.05;
      }
      // hard baked crust showing through
      if (e > 0.87) set(D, 0.95 + c * 0.2);
      else if (e > 0.82) {
        pr = (pr + D[0]) / 2;
        pg = (pg + D[1]) / 2;
        pb = (pb + D[2]) / 2;
      }
      if (c > 0.82 && h < 0.1) k *= 0.7;
      break;
    }
    case 'snow': {
      // drifts: blue in the hollows, bright on the crests
      if (a < 0.3) {
        pr *= 0.89;
        pg *= 0.93;
        pb *= 0.99;
      } else if (a < 0.52) k = 0.96;
      else if (a < 0.78) set(G2);
      else set(BRIGHT);
      // wind streaks across the drifts
      if (c > 0.55 && (y + Math.round(b * 40)) % 5 === 0) k *= 1.05;
      // sheets of bare ice, with glints
      if (e > 0.87) {
        set(ICE, 0.94 + c * 0.12);
        k = hash2(x >> 2, y, F.seed + 6) < 0.07 ? 1.25 : 1;
      } else if (e > 0.83 && h < 0.5) set(THIN_ICE);
      // rock showing through
      else if (c > 0.9 && h < 0.1) set(D);
      break;
    }
    case 'gravel': {
      if (a < 0.3) k = 0.86;
      else if (a < 0.5) k = 0.94;
      else if (a < 0.72) k = 1;
      else set(G2, a < 0.88 ? 1 : 1.07);
      // every pixel a stone of its own shade
      if (h < 0.1) k *= 0.7;
      else if (h < 0.28) k *= 0.87;
      else if (h > 0.92) k *= 1.3;
      else if (h > 0.76) k *= 1.12;
      // damp patches
      if (e > 0.8) k *= 0.76;
      break;
    }
    case 'paved': {
      // slabs laid like bricks, each a shade of its own, with a dark joint and a lit edge
      const S = 20 + (F.seed % 3) * 4;
      const sy = Math.floor(y / S);
      const ox = x + (sy & 1 ? S >> 1 : 0);
      const sx = Math.floor(ox / S);
      const lx = ox - sx * S;
      const ly = y - sy * S;
      const hs = hash2(sx, sy, F.seed + 7);
      k = hs > 0.93 ? 0.8 : hs < 0.05 ? 1.14 : 0.94 + hs * 0.12;
      if (e > 0.9) {
        // a patch of poured tar where the slabs have gone
        set(D, 0.95 + h * 0.1);
        k = 1;
      } else if (lx === 0 || ly === 0) k *= 0.66;
      else if (lx === 1 || ly === 1) k *= 1.1;
      // old stains
      if (a < 0.2) k *= 0.93;
      else if (a > 0.86) k *= 1.05;
      break;
    }
  }
  if (terrain !== 'paved') {
    // Depth. The light comes from the top left: ground that rises away from it is lit, ground
    // that falls away is in shade; and where the country steps up a level there is a ledge, with
    // a lit rim on the side that faces the light and a shadow thrown on the low ground behind it.
    const a0 = F.big.at(x, y);
    const hi = F.big.at(x - 3, y - 3);
    const lo = F.big.at(x + 3, y + 3);
    let sh = (lo - hi) * 4.5 + (F.mid.at(x + 1, y + 1) - F.mid.at(x - 1, y - 1)) * 1.8;
    sh = sh < -0.2 ? -0.2 : sh > 0.2 ? 0.2 : sh;
    k *= 1 + sh;
    for (let n = 0; n < LEDGES.length; n++) {
      const t = LEDGES[n]!;
      if (a0 < t && hi >= t) {
        if (terrain === 'snow') {
          pr *= 0.74;
          pg *= 0.82;
          pb *= 0.96;
        } else k *= 0.6;
      } else if (a0 >= t && hi < t && F.big.at(x - 1, y - 1) < t) k *= 1.16;
    }
  }
  out[0] = clamp255(pr * k);
  out[1] = clamp255(pg * k);
  out[2] = clamp255(pb * k);
}

/** How wide a mown stripe of a toy lawn is. */
export const MOWN = 30;

/**
 * One pixel of a toy venue's ground: one flat colour mown in broad stripes, with a tuft or a
 * daisy here and there and nothing else. No ledges, no bare earth, no shade.
 */
export function toyPixel(out: Rgb, x: number, y: number, G: Rgb, G2: Rgb, F: Fields): void {
  // broad soft patches of a lighter green, the mower's stripes only just there, and tufts: a
  // deeper or a brighter square of grass here and there, two art px across
  const a = F.big.at(x, y) * 0.6 + F.mid.at(x, y) * 0.4;
  const C = a > 0.56 ? G2 : G;
  let k = 1;
  if (Math.floor((x + y * 0.35) / MOWN) & 1) k *= 1.025;
  const tuft = hash2(x >> 1, y >> 1, F.seed + 7);
  if (tuft > 0.975) k *= 0.9;
  else if (tuft < 0.03) k *= 1.07;
  const h = hash2(x, y, F.seed);
  if (h > 0.9988) {
    // a daisy
    out[0] = 250;
    out[1] = 248;
    out[2] = 236;
    return;
  }
  out[0] = clamp255(C[0] * k);
  out[1] = clamp255(C[1] * k);
  out[2] = clamp255(C[2] * k);
}

/** Fill a whole RGBA map with a venue's country. */
export function paintTerrain(
  px: Uint8ClampedArray,
  w: number,
  h: number,
  colors: GroundColors,
  F: Fields,
): void {
  const terrain = terrainOf(colors);
  const G = rgbOf(colors.ground);
  const G2 = rgbOf(colors.ground2);
  const D = rgbOf(colors.dirt);
  const out: Rgb = [0, 0, 0];
  let k = 0;
  const toy = colors.style === 'toy';
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (toy) toyPixel(out, x, y, G, G2, F);
      else terrainPixel(out, x, y, terrain, G, G2, D, F);
      px[k] = out[0];
      px[k + 1] = out[1];
      px[k + 2] = out[2];
      px[k + 3] = 255;
      k += 4;
    }
}

/** The part of a track the road painter needs (sim's `Track` fits). */
export interface Line {
  x: ArrayLike<number>;
  y: ArrayLike<number>;
  a: ArrayLike<number>;
  n: number;
  step: number;
}

const NONE = 0xffff;
// the kerb colour being mixed
let kr = 0;
let kg = 0;
let kb = 0;

/** For every pixel near the line: how far it is from it, and which sample is nearest. */
export interface Near {
  dist: Float32Array;
  near: Uint16Array;
}

/** Measure the map against the line's samples (those `use` allows), out to `reach` pixels. */
export function measure(
  T: Line,
  w: number,
  h: number,
  reach: number,
  use: (i: number) => boolean,
): Near {
  const dist = new Float32Array(w * h).fill(1e4);
  const near = new Uint16Array(w * h).fill(NONE);
  const R = Math.ceil(reach);
  for (let i = 0; i < T.n; i++) {
    if (!use(i)) continue;
    const sx = T.x[i]!;
    const sy = T.y[i]!;
    const x0 = Math.max(0, Math.floor(sx - R));
    const x1 = Math.min(w - 1, Math.ceil(sx + R));
    const y0 = Math.max(0, Math.floor(sy - R));
    const y1 = Math.min(h - 1, Math.ceil(sy + R));
    for (let y = y0; y <= y1; y++) {
      const dy = y + 0.5 - sy;
      let k = y * w + x0;
      for (let x = x0; x <= x1; x++, k++) {
        const dx = x + 0.5 - sx;
        const d = dx * dx + dy * dy;
        if (d < dist[k]!) {
          dist[k] = d;
          near[k] = i;
        }
      }
    }
  }
  for (let k = 0; k < dist.length; k++) dist[k] = Math.sqrt(dist[k]!);
  return { dist, near };
}

/**
 * How hard the line bends at each sample, signed (positive turns towards the +across side), eased
 * so a bend's kerbs begin a little before it and run a little past: 0 where there is no kerb
 * (a straight, a gentle curve), about 1 through a hairpin.
 */
export function bends(T: Line, from = KERB_FROM): Float32Array {
  const TAU = Math.PI * 2;
  const span = Math.max(2, Math.round(28 / T.step));
  const raw = new Float32Array(T.n);
  for (let i = 0; i < T.n; i++) {
    let d = T.a[(i + span) % T.n]! - T.a[(i - span + T.n) % T.n]!;
    while (d > Math.PI) d -= TAU;
    while (d < -Math.PI) d += TAU;
    raw[i] = d;
  }
  // carry each bend's strength out over the samples round it
  const out = new Float32Array(T.n);
  const carry = Math.max(1, Math.round(24 / T.step));
  for (let i = 0; i < T.n; i++) {
    let best = 0;
    for (let d = -carry; d <= carry; d++) {
      const v = raw[(i + d + T.n) % T.n]!;
      if (Math.abs(v) > Math.abs(best)) best = v;
    }
    out[i] = Math.abs(best) >= from ? best : 0;
  }
  // kerbs come in whole runs: a gap too short to notice is closed, a run too short to be a bend
  // is taken up
  const few = Math.max(2, Math.round(56 / T.step));
  const runs = (on: boolean, fix: (from: number, len: number) => void): void => {
    let start = -1;
    for (let i = 0; i < T.n; i++) if ((out[i] !== 0) !== on) start = i;
    if (start < 0) return;
    let len = 0;
    for (let q = 1; q <= T.n; q++) {
      const i = (start + q) % T.n;
      if ((out[i] !== 0) === on) len++;
      else {
        if (len > 0 && len < few) fix((i - len + T.n) % T.n, len);
        len = 0;
      }
    }
  };
  runs(false, (from, len) => {
    const v = out[(from - 1 + T.n) % T.n]!;
    for (let q = 0; q < len; q++) out[(from + q) % T.n] = v;
  });
  runs(true, (from, len) => {
    for (let q = 0; q < len; q++) out[(from + q) % T.n] = 0;
  });
  return out;
}

/** The bend from which kerbs are laid. */
export const KERB_FROM = 0.25;

export interface RoadPaint {
  T: Line;
  /** The road's full width. */
  road: number;
  colors: GroundColors;
  F: Fields;
  /** Samples where the road is on the ground (not up on a flyover). */
  use: (i: number) => boolean;
}

/** A toy road's tarmac, and how wide its kerbs are. */
const TOY_TAR: Rgb = [0x62, 0x66, 0x72];
const TOY_KERB = 8;
const TOY_KERB_FROM = 0.08;

/** How far past the road's edge the verge can reach. */
export const VERGE = 36;

/**
 * Lay the road over the country already in `px`: tarmac with its lines, worn lanes and mended
 * stretches, red and white kerbs through the bends, and a ragged verge that widens into a run-off
 * on the outside of each bend; or a dirt road with wheel ruts and a berm.
 */
export function paintRoad(px: Uint8ClampedArray, w: number, h: number, o: RoadPaint): void {
  const { T, colors, F } = o;
  const half = o.road / 2;
  const terrain = terrainOf(colors);
  const style: RoadStyle = colors.road ?? 'tarmac';
  const toy = colors.style === 'toy' && style === 'tarmac';
  const G = rgbOf(colors.ground);
  const D = rgbOf(colors.dirt);
  const N = measure(T, w, h, half + VERGE, o.use);
  // (a toy road is kerbed round every corner, however gentle)
  const B = bends(T, toy ? TOY_KERB_FROM : KERB_FROM);
  const seed = F.seed;
  // tarmac takes a little of the country's colour, so every venue's road is its own grey
  const TAR: Rgb = [
    0x3e * 0.88 + G[0] * 0.12 * 0.6,
    0x3e * 0.88 + G[1] * 0.12 * 0.6,
    0x45 * 0.88 + G[2] * 0.12 * 0.6,
  ];
  // what lies beside the road: a snow bank, a pavement, or the venue's dirt
  const SHOULDER: Rgb =
    terrain === 'snow'
      ? [236, 241, 248]
      : terrain === 'paved'
        ? [G[0] * 1.3, G[1] * 1.3, G[2] * 1.3]
        : D;
  // a dirt road is the venue's dirt, packed dark
  const EARTH: Rgb = [
    (D[0] * 0.75 + G[0] * 0.25) * 0.84,
    (D[1] * 0.75 + G[1] * 0.25) * 0.84,
    (D[2] * 0.75 + G[2] * 0.25) * 0.84,
  ];
  // industrial venues stripe their bends in yellow and black; circuits in red and white
  const hazard = terrain === 'paved' || terrain === 'gravel' || terrain === 'dirt';
  const kerb = (al: number, q: number): void => {
    if (hazard) {
      const dark = (Math.floor((al + q) / 5) & 1) === 0;
      kr = dark ? 0x1c : 0xe8;
      kg = dark ? 0x1c : 0xb6;
      kb = dark ? 0x20 : 0x1e;
    } else {
      const red = (Math.floor(al / 7) & 1) === 0;
      kr = red ? 0xc8 : 0xef;
      kg = red ? 0x32 : 0xea;
      kb = red ? 0x2e : 0xe0;
    }
  };
  // the pit apron: a strip of concrete beside the grid, on the +across side
  const apronBack = Math.round(150 / T.step);
  const apronFore = Math.round(30 / T.step);
  const onApron = (i: number): boolean => i >= T.n - apronBack || i < apronFore;
  const creepMost = terrain === 'snow' ? 0.24 : terrain === 'paved' ? 0.08 : 0.34;
  const SEC = 150;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const k = y * w + x;
      const i = N.near[k]!;
      if (i === NONE) continue;
      const a = T.a[i]!;
      const dx = x + 0.5 - T.x[i]!;
      const dy = y + 0.5 - T.y[i]!;
      // how far across the road from its middle line (not from the nearest sample, which is up
      // to half a step away even on the line itself)
      const ac = -Math.sin(a) * dx + Math.cos(a) * dy;
      const side = ac >= 0 ? 1 : -1;
      const d = Math.abs(ac);
      const al = i * T.step + Math.cos(a) * dx + Math.sin(a) * dy;
      const ali = Math.floor(al);
      const hsh = hash2(x, y, seed + 11);
      const bend = B[i]!;
      const kerbed = bend !== 0;
      // the outside of a bend is the side the road turns away from
      const outer = kerbed && (bend > 0 ? side < 0 : side > 0);
      const mid = F.mid.at(x, y);
      // how squarely this side of the road faces the light (top left): 1 towards it, -1 away
      const lit = side * 0.7071 * (Math.sin(a) - Math.cos(a));
      let r: number;
      let g: number;
      let b: number;
      let m = 1;
      if (toy) {
        // a toy road: one clean grey, crisp white lines, fat red and white kerbs round every
        // bend, and a neat dark trim where it meets the lawn
        if (d > half + TOY_KERB + 1.5) continue;
        if (d <= half) {
          r = TOY_TAR[0];
          g = TOY_TAR[1];
          b = TOY_TAR[2];
          // two lanes a touch darker than the middle and the edges
          if (Math.abs(d - half * 0.46) < half * 0.2) m = 0.965;
          if (d > half - 5 && d < half - 2.5) {
            r = 244;
            g = 244;
            b = 236;
            m = 1;
          } else if (d < 1.4 && ((ali % 34) + 34) % 34 < 17) {
            r = 240;
            g = 240;
            b = 230;
            m = 1;
          }
        } else if (kerbed && d <= half + TOY_KERB) {
          const red = (Math.floor(al / 10) & 1) === 0;
          r = red ? 0xe2 : 0xf6;
          g = red ? 0x36 : 0xf3;
          b = red ? 0x32 : 0xea;
          // it stands proud: a lit lip towards the light, a dark foot away from it
          if (d > half + TOY_KERB - 1.4) m = lit < 0 ? 0.62 : 0.88;
          else if (d < half + 1.2 && lit < 0) m = 1.06;
        } else if (d <= (kerbed ? half + TOY_KERB : half) + 1.5) {
          const p = k * 4;
          const f = lit < -0.15 ? 0.72 : 0.86;
          px[p] = clamp255(px[p]! * f);
          px[p + 1] = clamp255(px[p + 1]! * f);
          px[p + 2] = clamp255(px[p + 2]! * f);
          continue;
        } else continue;
      } else if (style === 'dirt') {
        const ext = half + (mid - 0.5) * 9;
        if (d > ext + 4) continue;
        if (d > ext) {
          // the bank beside a sunken road: lit where it faces the light, and throwing a shadow
          // on the country behind it where it faces away
          const f = lit < -0.15 ? 0.62 : lit > 0.15 ? 1.16 : 0.85;
          if (hsh > 0.85) continue;
          const p = k * 4;
          px[p] = clamp255(px[p]! * f);
          px[p + 1] = clamp255(px[p + 1]! * f);
          px[p + 2] = clamp255(px[p + 2]! * f);
          continue;
        }
        r = EARTH[0];
        g = EARTH[1];
        b = EARTH[2];
        // long stretches a shade wetter or drier
        m = 0.95 + hash2(Math.floor(al / SEC), 0, seed + 12) * 0.1;
        const lane = Math.abs(d - half * 0.44);
        if (lane < 5.5) {
          // the two wheel ruts: polished pale, streaked along the road
          m *= 1.17;
          if (hash2(Math.round(d), Math.floor(al / 11), seed + 13) < 0.3) m *= 0.88;
        } else if (d < 4) {
          // the hump between them: loose stones, and grass where there is any
          if (hsh < 0.12) m *= 1.35;
          else if (hsh > 0.82 && terrain === 'grass') {
            r = G[0];
            g = G[1];
            b = G[2];
          }
        } else if (hsh < 0.07) m *= 0.7;
        else if (hsh > 0.95) m *= 1.28;
        // washboard through the bends
        if (kerbed && ali % 5 === 0) m *= 0.9;
        // the road is worn down into the ground: the bank towards the light shades its edge,
        // the far bank's foot catches the light
        if (d > ext - 6) m *= lit > 0.15 ? 0.64 : lit < -0.15 ? 1.2 : hsh < 0.22 ? 0.72 : 1.1;
      } else if (d <= half) {
        r = TAR[0];
        g = TAR[1];
        b = TAR[2];
        // laid in stretches, each a shade of its own, some only one lane wide, with a seam between
        const sec = Math.floor(al / SEC);
        m = 0.93 + hash2(sec, 1, seed + 12) * 0.14;
        if (hash2(sec, 2, seed + 12) < 0.3 && side > 0) m *= 0.92;
        if (ali % SEC === 0) m *= 0.8;
        // the middle, where nothing drives, is paler; the two lanes are dark with rubber
        if (d < half * 0.2) m *= 1.07;
        const lane = Math.abs(d - half * 0.46);
        if (lane < 6 && hash2(Math.round(d * side), Math.floor(al / 9), seed + 13) < 0.72)
          m *= kerbed ? 0.86 : 0.93;
        // a dark streak of oil down the middle of each lane, and grime along the edges
        if (lane < 1.3 && hash2(Math.floor(al / 46), side, seed + 17) < 0.55) m *= 0.84;
        if (d > half - 9) m *= 0.92;
        // a pavement stands above the road and shades its edge on the side towards the light
        if (terrain === 'paved' && lit > 0.15 && d > half - 3) m *= 0.68;
        // the painted lines: one down each edge, dashes down the middle, worn through in places
        const worn = hash2(Math.floor(al / 4), d < 3 ? 0 : side, seed + 14) < 0.07;
        if (d > half - 4.4 && d < half - 2.4 && !worn) {
          if (terrain === 'paved') {
            r = r * 0.3 + 214 * 0.7;
            g = g * 0.3 + 178 * 0.7;
            b = b * 0.3 + 40 * 0.7;
          } else {
            r = r * 0.35 + 236 * 0.65;
            g = g * 0.35 + 232 * 0.65;
            b = b * 0.35 + 214 * 0.65;
          }
          m = 1;
        } else if (d < 1.1 && ((ali % 30) + 30) % 30 < 14 && !worn) {
          r = r * 0.3 + 230 * 0.7;
          g = g * 0.3 + 224 * 0.7;
          b = b * 0.3 + 200 * 0.7;
          m = 1;
        }
        // the country creeps onto the edge of the road: dust, sand, snow
        const creep = d - (half - 10 - mid * 6);
        if (creep > 0 && !kerbed) {
          const p = (creep / (10 + mid * 6)) ** 2 * creepMost;
          if (hsh < p) {
            r = SHOULDER[0];
            g = SHOULDER[1];
            b = SHOULDER[2];
            m = terrain === 'snow' ? 1 : 0.9 + hsh * 0.4;
          }
        }
      } else if (side > 0 && onApron(i) && d <= half + 26) {
        // the pit apron: poured concrete in bays, a white line against the road, hazard
        // stripes along its far edge, and its own shadow where it faces away from the light
        const q = d - half;
        if (q > 22) {
          const dark = (Math.floor((al + q) / 4) & 1) === 0;
          r = dark ? 0x1c : 0xe8;
          g = dark ? 0x1c : 0xb6;
          b = dark ? 0x20 : 0x1e;
          if (q > 25 && lit < 0) m = 0.6;
        } else if (q < 1.6) {
          r = 228;
          g = 226;
          b = 214;
        } else {
          r = 138;
          g = 136;
          b = 132;
          m = 0.94 + hash2(Math.floor(al / 22), 3, seed + 18) * 0.12;
          if (((ali % 22) + 22) % 22 === 0) m *= 0.7;
          else if (hsh < 0.05) m *= 0.8;
        }
      } else if (terrain === 'paved') {
        // a kerbstone, then a pavement of small slabs, all the way round
        const q = d - half;
        if (q > 15) continue;
        if (kerbed && q <= 5) {
          kerb(al, q);
          r = kr;
          g = kg;
          b = kb;
          if (q > 4) m = 0.7;
        } else if (q <= 3) {
          r = 178;
          g = 176;
          b = 170;
          m = ((ali % 8) + 8) % 8 === 0 ? 0.72 : q < 1 ? 1.08 : 1;
        } else {
          r = SHOULDER[0];
          g = SHOULDER[1];
          b = SHOULDER[2];
          m = 0.95 + hash2(Math.floor(al / 12), Math.floor((q - 3) / 6) * side, seed + 15) * 0.1;
          if (((ali % 12) + 12) % 12 === 0 || Math.floor(q - 3) % 6 === 0) m *= 0.78;
          if (q > 14) m *= 0.7;
        }
      } else if (kerbed && d <= half + 5.5) {
        // red and white kerb blocks, a lit lip against the road and a shadow on the far side
        kerb(al, d - half);
        r = kr;
        g = kg;
        b = kb;
        m = 0.96 + hash2(Math.floor(al / 7), side, seed + 16) * 0.08;
        // a kerb stands proud: lit on the side that faces the light, dark on the other
        if (d > half + 4.2) m *= lit < 0 ? 0.55 : 0.85;
        else if (d < half + 1.2) m *= lit < 0 ? 1.12 : 0.8;
      } else {
        // the verge: bare ground beside the road, ragged, widening into a run-off outside a bend
        const from = kerbed ? half + 5.5 : half;
        const wide = 5 + mid * 13 + (outer ? Math.min(1, Math.abs(bend)) * 16 : 0);
        const q = (d - from) / wide;
        if (q >= 1) continue;
        // solid by the road, thinning out into the country
        if (q > 0.5 && hsh < (q - 0.5) * 2) continue;
        r = SHOULDER[0];
        g = SHOULDER[1];
        b = SHOULDER[2];
        const sm = F.small.at(x, y);
        m = 0.9 + sm * 0.2;
        if (terrain === 'snow') {
          // a ploughed bank: bright on top, blue on its far side
          m = 1;
          if (q > 0.6) {
            r = 190;
            g = 206;
            b = 228;
          }
        } else if (outer) {
          // the run-off is raked gravel: lighter, stony
          m *= 1.12;
          if (hsh < 0.18) m *= 0.72;
          else if (hsh > 0.85) m *= 1.25;
        } else if (hsh < 0.09) m *= 0.68;
        else if (hsh > 0.93) m *= 1.3;
        // the road stands a little above the ground: it throws a shadow on the verge on the
        // side away from the light, and shows a lit lip on the side towards it
        const e = d - from;
        if (lit < -0.15 && e < 4.5) m *= 0.56;
        else if (lit > 0.15 && e < 1.6) m *= 1.2;
        else if (e < 1.2) m *= 0.74;
      }
      const p = k * 4;
      px[p] = clamp255(r * m);
      px[p + 1] = clamp255(g * m);
      px[p + 2] = clamp255(b * m);
    }
}

/**
 * Under a flyover there is no road on the ground: a trampled gully of dirt in the deck's shade,
 * darker down the middle, strewn with stones.
 */
export function paintGully(
  px: Uint8ClampedArray,
  w: number,
  h: number,
  T: Line,
  road: number,
  colors: GroundColors,
  seed: number,
  up: (i: number) => boolean,
): void {
  const half = road / 2;
  const D = rgbOf(colors.dirt);
  const N = measure(T, w, h, half + 17, up);
  for (let k = 0; k < N.near.length; k++) {
    if (N.near[k] === NONE) continue;
    const d = N.dist[k]!;
    const x = k % w;
    const y = (k / w) | 0;
    const hsh = hash2(x, y, seed + 21);
    if (d > half + 17 || (d > half + 11 && hsh < (d - half - 11) / 6)) continue;
    let m = d < half + 6 ? 0.62 : 1;
    if (hsh < 0.06) m *= 0.6;
    else if (hsh > 0.94) m *= 1.25;
    const p = k * 4;
    px[p] = clamp255(D[0] * m);
    px[p + 1] = clamp255(D[1] * m);
    px[p + 2] = clamp255(D[2] * m);
  }
}

/**
 * A derby bowl over the country already in `px`: dark outside the wall, a trodden rim, and the
 * floor churned in rings where the cars circle.
 */
export function paintBowl(
  px: Uint8ClampedArray,
  w: number,
  h: number,
  O: { cx: number; cy: number; rx: number; ry: number },
  colors: GroundColors,
  F: Fields,
): void {
  const OUT = rgbOf(colors.outside);
  const D = rgbOf(colors.dirt);
  const lean = Math.min(O.rx, O.ry);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const ex = (x + 0.5 - O.cx) / O.rx;
      const ey = (y + 0.5 - O.cy) / O.ry;
      const q = Math.sqrt(ex * ex + ey * ey);
      // about how many pixels inside (negative) or outside the wall
      const off = (q - 1) * lean;
      const p = (y * w + x) * 4;
      const hsh = hash2(x, y, F.seed + 31);
      if (off > 6) {
        const m = 0.86 + F.mid.at(x, y) * 0.28 + (hsh < 0.08 ? 0.12 : 0);
        px[p] = clamp255(OUT[0] * m);
        px[p + 1] = clamp255(OUT[1] * m);
        px[p + 2] = clamp255(OUT[2] * m);
      } else if (off > -3) {
        const m = (off > 3 ? 0.7 : 1) * (hsh < 0.1 ? 0.7 : hsh > 0.9 ? 1.2 : 1);
        px[p] = clamp255(D[0] * m);
        px[p + 1] = clamp255(D[1] * m);
        px[p + 2] = clamp255(D[2] * m);
      } else {
        // rings worn by circling cars: streaks that run round the bowl, strongest half way out
        const ang = Math.atan2(ey, ex);
        const ring = Math.floor(q * lean * 0.5);
        const streak = hash2(ring, Math.floor(ang * (6 + ring * 0.35)), F.seed + 32);
        const band = Math.max(0, 1 - Math.abs(q - 0.66) / 0.3);
        let m = 1;
        if (streak < 0.3) m -= 0.13 * band;
        else if (streak > 0.86) m += 0.08 * band;
        // the wall's shadow on the floor: long under the wall that stands towards the light
        const lit = (-ex - ey) / (q * 1.4142 || 1);
        if (off > -(5 + 16 * Math.max(0, lit))) m *= 0.64;
        px[p] = clamp255(px[p]! * m);
        px[p + 1] = clamp255(px[p + 1]! * m);
        px[p + 2] = clamp255(px[p + 2]! * m);
      }
    }
}

/**
 * The wilds: the further the country is from the road, the more it sinks into the venue's
 * outside colour, so the track stands out lit and the edges of the map fall away dark.
 */
export function paintWilds(
  px: Uint8ClampedArray,
  w: number,
  h: number,
  T: Line,
  from: number,
  to: number,
  colors: GroundColors,
  seed: number,
  most = 0.42,
): void {
  const OUT = rgbOf(colors.outside);
  // how far each 8x8 block of the map is from the road
  const Q = 8;
  const gw = Math.ceil(w / Q) + 1;
  const gh = Math.ceil(h / Q) + 1;
  const dist = new Float32Array(gw * gh).fill(1e9);
  const R = Math.ceil(to / Q) + 1;
  for (let i = 0; i < T.n; i += 2) {
    const cx = Math.round(T.x[i]! / Q);
    const cy = Math.round(T.y[i]! / Q);
    for (let gy = Math.max(0, cy - R); gy <= Math.min(gh - 1, cy + R); gy++)
      for (let gx = Math.max(0, cx - R); gx <= Math.min(gw - 1, cx + R); gx++) {
        const dx = gx * Q - T.x[i]!;
        const dy = gy * Q - T.y[i]!;
        const d = dx * dx + dy * dy;
        const k = gy * gw + gx;
        if (d < dist[k]!) dist[k] = d;
      }
  }
  for (let k = 0; k < dist.length; k++) dist[k] = Math.min(to, Math.sqrt(dist[k]!));
  for (let y = 0; y < h; y++) {
    const fy = y / Q;
    const yi = Math.floor(fy);
    const ty = fy - yi;
    for (let x = 0; x < w; x++) {
      const fx = x / Q;
      const xi = Math.floor(fx);
      const tx = fx - xi;
      const k = yi * gw + xi;
      const a = dist[k]!;
      const b = dist[k + 1]!;
      const c = dist[k + gw]!;
      const e = dist[k + gw + 1]!;
      const d = a + (b - a) * tx + (c - a) * ty + (a - b - c + e) * tx * ty;
      if (d <= from) continue;
      let f = (d - from) / (to - from);
      // in steps, with a dithered edge between them, like everything else on the ground
      f = Math.floor(f * 5 + hash2(x, y, seed + 41) * 0.9) / 5;
      f = (f > 1 ? 1 : f) * most;
      if (f <= 0) continue;
      const p = (y * w + x) * 4;
      px[p] = px[p]! * (1 - f) + OUT[0] * f;
      px[p + 1] = px[p + 1]! * (1 - f) + OUT[1] * f;
      px[p + 2] = px[p + 2]! * (1 - f) + OUT[2] * f;
    }
  }
}
