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

export function bakeRelief(
  R: Relief,
  w: number,
  h: number,
  rise: number,
  faces: ((x: number, y: number) => number) | null = null,
  blocks: ((x: number, y: number) => number) | null = null,
): Uint8Array {
  // the height of every px, read between the grid's points a row at a time
  const hh = new Float32Array(w * h);
  // (the ground at a jump piece's foot: it lies as it would with no piece there)
  const foot = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      // (a jump piece from its own shape, not the grid's: its edges are straight lines)
      const b = blocks ? blocks(x + 0.5, y + 0.5) : -1;
      const g = R.at(x + 0.5, y + 0.5);
      hh[y * w + x] = b < 0 ? g : g - R.platAt(x + 0.5, y + 0.5) + b;
      if (b === 0) foot[y * w + x] = 1;
    }
  const out = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) out[i * 4 + 1] = 128;
  const last = new Int32Array(w).fill(-1);
  const at = (x: number, y: number): number =>
    hh[(y < 0 ? 0 : y >= h ? h - 1 : y) * w + (x < 0 ? 0 : x >= w ? w - 1 : x)]!;
  // Most of a map is level ground with nothing near it, and a look at every px's surroundings is
  // what costs here (seconds, on a phone, for a big venue). So first, in blocks of `B` px: the
  // lowest and highest each holds, then whether everything a px in the block could look at
  // (`REACH` px to the sides and north, `SOUTH` px south) is at one height, and the highest
  // ground south of it. A px whose surroundings are level is plain ground in flat light, and one
  // with nothing higher to its south has no far shade to look for: the same map, much sooner.
  const B = 8;
  const bw = Math.ceil(w / B);
  const bh = Math.ceil(h / B);
  const lo = new Float32Array(bw * bh).fill(Infinity);
  const hi = new Float32Array(bw * bh).fill(-Infinity);
  for (let y = 0; y < h; y++) {
    const row = (y >> 3) * bw;
    for (let x = 0; x < w; x++) {
      const v = hh[y * w + x]!;
      const b = row + (x >> 3);
      if (v < lo[b]!) lo[b] = v;
      if (v > hi[b]!) hi[b] = v;
    }
  }
  const sides = Math.ceil((REACH + B - 1) / B);
  const south = Math.ceil((SOUTH + B - 1) / B);
  const level = new Uint8Array(bw * bh);
  const above = new Float32Array(bw * bh);
  for (let by = 0; by < bh; by++)
    for (let bx = 0; bx < bw; bx++) {
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
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = hh[y * w + x]!;
      const s = Math.round(y - v * rise);
      const prev = last[x]!;
      last[x] = s;
      if (s < 0) continue;
      const blk = (y >> 3) * bw + (x >> 3);
      const calm = level[blk]!;
      if (calm) {
        // level ground all round: where it is, in flat light. Gently rolling ground: lit by its
        // slope and nothing else (no face, drop, lip or shade can be within reach of it)
        let g = 128;
        if (calm === 2) {
          const lit = (at(x + 3, y) - at(x - 3, y) + at(x, y + 3) - at(x, y - 3)) / 6;
          g = Math.round(128 * (1 + Math.max(-0.46, Math.min(0.4, lit * 1.7))));
        }
        for (let j = Math.max(0, Math.min(prev + 1, s)); j <= s; j++) {
          const k = (j * w + x) * 4;
          out[k] = Math.min(255, y - j);
          out[k + 1] = g;
          out[k + 2] = 0;
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
      const code = faces ? faces(x + 0.5, y + 0.5) : 0;
      let steep = slope > (code ? 0.45 : 1);
      // the side of a platform eases out at its foot, and the foot is still wall: a gentle
      // slope there with the steep of the side just above it is face too, or grass shows in it
      if (!steep && slope > 0.04 && R.plat && R.platAt(x + 0.5, y + 0.5) > 0.1)
        for (let d = 2; d <= 16 && !steep; d += 2) {
          const ux = Math.round(x + (sx / slope) * d);
          const uy = Math.round(y + (sy / slope) * d);
          steep = Math.hypot(at(ux + 1, uy) - at(ux - 1, uy), at(ux, uy + 1) - at(ux, uy - 1)) > 2;
        }
      // (the ground at the foot of a jump piece is not lit by the piece's own rise)
      let shade = foot[y * w + x]
        ? 1
        : steep
          ? 1 + Math.max(-0.5, Math.min(0.22, lit * 0.5))
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
        shade *= 1.16;
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
      for (let j = Math.max(0, Math.min(prev + 1, s)); j <= s; j++) {
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
  for (let x = 0; x < w; x++)
    for (let j = Math.max(0, last[x]! + 1); j < h; j++) {
      const k = (j * w + x) * 4;
      out[k] = Math.min(255, h - 1 - j);
      out[k + 1] = 70;
      out[k + 2] = 255;
    }
  return out;
}
