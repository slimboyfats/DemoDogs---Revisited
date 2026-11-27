import type { Relief } from '@demodogs/sim';

/**
 * Raised ground, worked out once per race for the ground's shader.
 *
 * The camera looks down from the south at a fixed pitch, so ground that stands `h` high is drawn
 * `h * rise` art px further up the screen than flat ground would be. The ground canvas stays a
 * flat map; this is the map from the picture back to it: for every px of the picture, how many
 * rows further south the ground it shows lies (red), how the light falls on it (green, 128 is
 * flat ground) and whether it is the steep face of a drop seen from the front (blue), and for
 * the face of a jump piece its look and turn (alpha, see leaps.ts), or on a slope the part of a
 * row the shift is out by. The shader
 * reads one texel of it and looks the colour up that far down the canvas, so hills, banks and
 * cliffs cost nothing a frame beyond that one read.
 *
 * It is painted the way old height-map landscapes were: every column from the far end to the
 * near, nearer ground over further, and where the picture jumps down a drop the rows between are
 * the drop's face.
 */
/**
 * How far past what the top of a drop hides its shade reaches on the ground behind it (px), and
 * how dark it is at its foot. The stacks' shader shades what stands there by the same two.
 */
export const FAR_SHADE = 26;
export const FAR_DARK = 0.62;

/** How far from a px the bake looks: to the sides and north of it, and to its south. */
const REACH = 20;
const SOUTH = 56;

/** How much paler built road is for each px it stands high, and the most it is. */
const HIGH_PER = 0.011;
const HIGH_MOST = 0.2;

/** The look of a face that is the side of raised road (alpha on a face: see leaps.ts for the rest). */
export const WALL = 224;

/** A part of the map, in px: from (x0, y0) up to but not including (x1, y1). */
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * The picture-to-ground map of a venue, kept so that it can be baked again in part: when the
 * ground changes height in one place (a stretch of road raised in the track creator), only the
 * columns and rows that could look at that place are worked out again.
 */
export class ReliefBake {
  readonly out: Uint8Array;
  private readonly hh: Float32Array;
  private readonly foot: Uint8Array;
  private readonly lo: Float32Array;
  private readonly hi: Float32Array;
  private readonly level: Uint8Array;
  private readonly above: Float32Array;
  private readonly last: Int32Array;
  private readonly wrote: Int32Array;
  /** The highest the ground has stood in any bake so far. */
  private top = 0;

  constructor(
    readonly w: number,
    readonly h: number,
    private readonly rise: number,
    private readonly faces: ((x: number, y: number) => number) | null = null,
    private readonly blocks: ((x: number, y: number) => number) | null = null,
  ) {
    this.hh = new Float32Array(w * h);
    this.foot = new Uint8Array(w * h);
    this.out = new Uint8Array(w * h * 4);
    const n = Math.ceil(w / 8) * Math.ceil(h / 8);
    this.lo = new Float32Array(n);
    this.hi = new Float32Array(n);
    this.level = new Uint8Array(n);
    this.above = new Float32Array(n);
    this.last = new Int32Array(w);
    this.wrote = new Int32Array(w);
  }

  /**
   * Bake the map from `R`: all of it, or, given the part of the ground whose height has changed
   * since the last bake, what that part can be seen from. Returns the part of `out` written.
   */
  bake(R: Relief, changed?: Box): Box {
    const { w, h, rise, faces, blocks, hh, foot, out, lo, hi, level, above, last } = this;
    const B = 8;
    const bw = Math.ceil(w / B);
    const bh = Math.ceil(h / B);
    const sides = Math.ceil((REACH + B - 1) / B);
    const south = Math.ceil((SOUTH + B - 1) / B);
    const top = Math.max(this.top, R.max);
    this.top = top;
    const tall = Math.ceil(top * rise) + 2;
    const clampX = (v: number): number => Math.max(0, Math.min(w, v));
    const clampY = (v: number): number => Math.max(0, Math.min(h, v));
    // the ground that changed (whole blocks of it), and the px that can look at it: those to its
    // sides and north of it, and south of it as far as its height hides, lights or shades
    const D = changed
      ? {
          x0: clampX(Math.floor(changed.x0 / B) * B),
          y0: clampY(Math.floor(changed.y0 / B) * B),
          x1: clampX(Math.ceil(changed.x1 / B) * B),
          y1: clampY(Math.ceil(changed.y1 / B) * B),
        }
      : { x0: 0, y0: 0, x1: w, y1: h };
    const reach = (sides + 2) * B;
    const X0 = clampX(D.x0 - reach);
    const X1 = clampX(D.x1 + reach);
    // (from the top of a block: a level block's tone is that of the first px of it met)
    const Y0 = clampY(Math.floor((D.y0 - (south + 3) * B - tall) / B) * B);
    const Y1 = clampY(D.y1 + reach);
    if (D.x1 <= D.x0 || D.y1 <= D.y0) return { x0: 0, y0: 0, x1: 0, y1: 0 };
    // the height of every px, read between the grid's points a row at a time
    for (let y = D.y0; y < D.y1; y++)
      for (let x = D.x0; x < D.x1; x++) {
        // (a jump piece from its own shape, not the grid's: its edges are straight lines)
        const b = blocks ? blocks(x + 0.5, y + 0.5) : -1;
        const g = R.at(x + 0.5, y + 0.5);
        hh[y * w + x] = b < 0 ? g : g - R.platAt(x + 0.5, y + 0.5) + b;
        foot[y * w + x] = b === 0 ? 1 : 0;
      }
    const at = (x: number, y: number): number =>
      hh[(y < 0 ? 0 : y >= h ? h - 1 : y) * w + (x < 0 ? 0 : x >= w ? w - 1 : x)]!;
    // Most of a map is level ground with nothing near it, and a look at every px's surroundings is
    // what costs here (seconds, on a phone, for a big venue). So first, in blocks of `B` px: the
    // lowest and highest each holds, then whether everything a px in the block could look at
    // (`REACH` px to the sides and north, `SOUTH` px south) is at one height, and the highest
    // ground south of it. A px whose surroundings are level is plain ground in flat light, and one
    // with nothing higher to its south has no far shade to look for: the same map, much sooner.
    for (let by = D.y0 >> 3; by < Math.ceil(D.y1 / B); by++)
      for (let bx = D.x0 >> 3; bx < Math.ceil(D.x1 / B); bx++) {
        let a = Infinity;
        let b = -Infinity;
        const yEnd = Math.min(h, (by + 1) * B);
        const xEnd = Math.min(w, (bx + 1) * B);
        for (let y = by * B; y < yEnd; y++)
          for (let x = bx * B; x < xEnd; x++) {
            const v = hh[y * w + x]!;
            if (v < a) a = v;
            if (v > b) b = v;
          }
        lo[by * bw + bx] = a;
        hi[by * bw + bx] = b;
      }
    const by0 = Math.max(0, (D.y0 >> 3) - south);
    const by1 = Math.min(bh, Math.ceil(D.y1 / B) + sides);
    const bx0 = Math.max(0, (D.x0 >> 3) - sides);
    const bx1 = Math.min(bw, Math.ceil(D.x1 / B) + sides);
    for (let by = by0; by < by1; by++)
      for (let bx = bx0; bx < bx1; bx++) {
        let a = Infinity;
        let b = -Infinity;
        let up = -Infinity;
        // (past the map's edge a look finds the edge's own height: the blocks at the edge again)
        for (let j = by - sides; j <= by + south; j++) {
          const row = (j < 0 ? 0 : j >= bh ? bh - 1 : j) * bw;
          if (j >= by && hi[row + bx]! > up) up = hi[row + bx]!;
          for (let i = bx - sides; i <= bx + sides; i++) {
            const k = row + (i < 0 ? 0 : i >= bw ? bw - 1 : i);
            if (lo[k]! < a) a = lo[k]!;
            if (hi[k]! > b) b = hi[k]!;
          }
        }
        // (1 level, 2 gentle: under 1 px of height between the lowest and the highest)
        level[by * bw + bx] = a === b ? 1 : b - a < 1 ? 2 : 0;
        above[by * bw + bx] = up;
      }
    // Built road (a platform, its ramps, an on-ramp's lane) is one even surface, and how high it
    // stands is told two ways that are both smooth: it is a little paler the higher it is, so a
    // ramp fades up from the ground's own tone to the deck's, and its slope takes the light evenly.
    const platAt = (x: number, y: number): number => (R.plat ? R.platAt(x + 0.5, y + 0.5) : 0);
    const high = (p: number): number => 1 + Math.min(HIGH_MOST, p * HIGH_PER);
    // (its slope is read over a wider span than open ground's, so where a ramp begins and ends
    // the light turns over a car's length, not at a crease)
    const ramp = (x: number, y: number, p: number): number => {
      const lit = (at(x + 8, y) - at(x - 8, y) + at(x, y + 8) - at(x, y - 8)) / 16;
      return (1 + Math.max(-0.27, Math.min(0.27, lit * 0.95))) * high(p);
    };
    // (a level block's tone, worked out once)
    const tone = new Uint8Array(bw * bh);
    // (the row before the first is where each column of the picture had got to)
    for (let x = X0; x < X1; x++)
      last[x] = Y0 > 0 ? Math.round(Y0 - 1 - hh[(Y0 - 1) * w + x]! * rise) : -1;
    // Rows south of all that changed are as they were, but a row can be drawn over a row north of
    // it (nearer ground over further), and those of them that were drawn over what has just been
    // drawn again must be drawn over it again: `tall` rows more, each only as far down the
    // picture as its column was written.
    const yEnd = Math.min(h, Y1 + tall + 1);
    const wrote = this.wrote.fill(-1, X0, X1);
    for (let y = Y0; y < yEnd; y++)
      for (let x = X0; x < X1; x++) {
        const v = hh[y * w + x]!;
        const s = Math.round(y - v * rise);
        const prev = last[x]!;
        last[x] = s;
        const end = y < Y1 ? s : Math.min(s, wrote[x]!);
        if (y < Y1 && s > wrote[x]!) wrote[x] = s;
        if (s < 0) continue;
        const blk = (y >> 3) * bw + (x >> 3);
        const calm = level[blk]!;
        if (calm) {
          // level ground all round: where it is, in flat light. Gently rolling ground: lit by its
          // slope and nothing else (no face, drop, lip or shade can be within reach of it)
          let g = tone[blk]!;
          if (calm === 2) {
            const lit = (at(x + 3, y) - at(x - 3, y) + at(x, y + 3) - at(x, y - 3)) / 6;
            const p = platAt(x, y);
            g = Math.round(
              128 * (p > 0.1 ? ramp(x, y, p) : 1 + Math.max(-0.46, Math.min(0.4, lit * 1.7))),
            );
          } else if (g === 0) g = tone[blk] = Math.round(128 * high(platAt(x, y)));
          for (let j = Math.max(0, Math.min(prev + 1, s)); j <= end; j++) {
            const k = (j * w + x) * 4;
            out[k] = Math.min(255, y - j);
            out[k + 1] = g;
            out[k + 2] = 0;
            out[k + 3] = 0;
          }
          continue;
        }
        // the light is at the top left: ground that rises to the south-east faces it
        const lit = (at(x + 3, y) - at(x - 3, y) + at(x, y + 3) - at(x, y - 3)) / 6;
        // a face: ground too steep to stand on, whichever way it looks; it takes the light harder
        const sx = (at(x + 1, y) - at(x - 1, y)) / 2;
        const sy = (at(x, y + 1) - at(x, y - 1)) / 2;
        const slope = Math.hypot(sx, sy);
        // (a jump piece's side is wall from where it leaves the ground, however low it is there)
        // (and so is the side of raised road, which is a wall of its own look: `WALL`)
        const plat = platAt(x, y);
        const code = (faces ? faces(x + 0.5, y + 0.5) : 0) || (plat > 0 ? WALL : 0);
        let steep = slope > (code === WALL ? 0.7 : code ? 0.45 : 1);
        // the side of a platform eases out at its foot, and the foot is still wall: a gentle
        // slope there with the steep of the side just above it is face too, or grass shows in it
        if (!steep && slope > 0.04 && R.plat && R.platAt(x + 0.5, y + 0.5) > 0.1)
          for (let d = 2; d <= 16 && !steep; d += 2) {
            const ux = Math.round(x + (sx / slope) * d);
            const uy = Math.round(y + (sy / slope) * d);
            steep =
              Math.hypot(at(ux + 1, uy) - at(ux - 1, uy), at(ux, uy + 1) - at(ux, uy - 1)) > 2;
          }
        // (the ground at the foot of a jump piece is not lit by the piece's own rise)
        let shade = foot[y * w + x]
          ? 1
          : steep
            ? 1 + Math.max(-0.5, Math.min(0.22, lit * 0.5))
            : plat > 0.1
              ? ramp(x, y, plat)
              : 1 + Math.max(-0.46, Math.min(0.4, lit * 1.7));
        // and higher ground up and to the left throws its shadow here
        let dark =
          at(x - 5, y - 5) - v > 4 || at(x - 12, y - 12) - v > 10 || at(x - 20, y - 20) - v > 17;
        // (a jump piece's shadow is traced a px at a time, so its edge is a straight line)
        if (foot[y * w + x]) {
          dark = false;
          for (let d = 1; d <= 30 && !dark; d++) dark = at(x - d, y - d) - v > d * 0.85 + 1;
        }
        if (dark) shade *= 0.64;
        // the lip of a drop catches the light
        else if (v - Math.min(at(x + 2, y), at(x, y + 2), at(x - 2, y), at(x, y - 2)) > 4)
          shade *= plat > 0.1 ? 1.3 : 1.16;
        // and the foot of a face is in its shade, whichever way it looks
        else if (Math.max(at(x + 2, y), at(x, y + 2), at(x - 2, y), at(x, y - 2)) - v > 4)
          shade *= 0.8;
        // a drop seen from behind shows no face, so it is told by its shade: the ground beyond
        // the far edge of higher ground lies dark, deepest at the foot and fading out past where
        // the top stops hiding it, the darker the higher the drop
        let sunk = 0;
        if (above[blk]! - v >= 5)
          for (let d = 2; d <= SOUTH; d += 2) {
            const dh = at(x, y + d) - v;
            if (dh < 5) continue;
            const k = Math.min(1, (dh * rise + FAR_SHADE - d) / FAR_SHADE) * Math.min(1, dh / 14);
            if (k > sunk) sunk = k;
          }
        if (sunk > 0) shade *= 1 - FAR_DARK * sunk;
        // and its far lip, with nothing but air behind it, is a bright line
        else if (v - at(x, y - 3) > 5) shade *= 1.3;
        // (and where the picture jumps down a drop, the rows between are its face too)
        const face = steep || (s - prev >= 2 && at(x, y - 1) - v > 1);
        const g = Math.max(0, Math.min(255, Math.round(128 * shade)));
        for (let j = Math.max(0, Math.min(prev + 1, s)); j <= end; j++) {
          const k = (j * w + x) * 4;
          out[k] = Math.min(255, y - j);
          out[k + 1] = g;
          out[k + 2] = face ? 255 : 0;
          // (and the face of a jump piece is in the piece's own look: alpha says which)
          // (and on a slope that is no face, how far between two rows of the map this row of the
          // picture falls, so a line painted up a ramp is straight and not a stair: 1 to 255)
          out[k + 3] = face
            ? code
            : slope > 0.02
              ? 128 +
                Math.round(
                  127 *
                    Math.max(-1, Math.min(1, (j - (y - v * rise)) / Math.max(0.3, 1 - sy * rise))),
                )
              : 0;
        }
      }
    // the near edge of raised ground: its cut face down to the bottom of the map
    if (Y1 === h)
      for (let x = X0; x < X1; x++)
        for (let j = Math.max(0, last[x]! + 1); j < h; j++) {
          const k = (j * w + x) * 4;
          out[k] = Math.min(255, h - 1 - j);
          out[k + 1] = 70;
          out[k + 2] = 255;
          out[k + 3] = 0;
        }
    return { x0: X0, y0: clampY(Y0 - tall), x1: X1, y1: Y1 };
  }
}

/**
 * The part of the ground whose height differs between two reliefs of one map (null: none of it):
 * every px between two points of the grid of which one has changed.
 */
export function reliefChange(a: Relief, b: Relief): Box | null {
  const C = 8;
  if (
    a.gw !== b.gw ||
    a.gh !== b.gh ||
    a.step !== b.step ||
    a.steps !== b.steps ||
    a.face !== b.face
  )
    return { x0: 0, y0: 0, x1: a.w, y1: a.ht };
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const P = a.plat;
  const Q = b.plat;
  for (let gy = 0, k = 0; gy < a.gh; gy++)
    for (let gx = 0; gx < a.gw; gx++, k++) {
      let same = a.hills[k] === b.hills[k] && a.bank[k] === b.bank[k];
      if (same && P && Q) {
        const i = k * 4;
        same =
          P[i] === Q[i] && P[i + 1] === Q[i + 1] && P[i + 2] === Q[i + 2] && P[i + 3] === Q[i + 3];
      } else if (same && (P || Q))
        // (raised road where there was none at all, or none left: wherever any of it stands)
        same = !((P ?? Q)![k * 4 + 1]! > 0);
      if (same) continue;
      if (gx < x0) x0 = gx;
      if (gx > x1) x1 = gx;
      if (gy < y0) y0 = gy;
      if (gy > y1) y1 = gy;
    }
  if (x1 < x0) return null;
  return { x0: (x0 - 1) * C, y0: (y0 - 1) * C, x1: (x1 + 1) * C, y1: (y1 + 1) * C };
}

/** The picture-to-ground map of a venue, baked whole (see `ReliefBake`). */
export function bakeRelief(
  R: Relief,
  w: number,
  h: number,
  rise: number,
  faces: ((x: number, y: number) => number) | null = null,
  blocks: ((x: number, y: number) => number) | null = null,
): Uint8Array {
  const b = new ReliefBake(w, h, rise, faces, blocks);
  b.bake(R);
  return b.out;
}
