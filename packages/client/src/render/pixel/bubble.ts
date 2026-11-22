import { Shape } from './batch';
import type { Put } from './particles';

/**
 * A shield bubble drawn the mudders way: no sprite and no soft circle, just a lattice of single
 * glowing cells on a dome round the car that turns slowly and crackles. The rim, where the dome is
 * seen edge on, is brightest; a blow lights the cells round where it landed; and as the bubble is
 * worn down its cells drop out until it is a sparse, flickering cage.
 */

/** Points evenly spread over a dome (z >= -0.15 of a unit sphere): [x, y, z] in threes. */
export const DOME: Float32Array = (() => {
  const out: number[] = [];
  const N = 420;
  const ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const z = 1 - (i / (N - 1)) * 2;
    if (z < -0.15) break;
    const r = Math.sqrt(1 - z * z);
    out.push(Math.cos(i * ga) * r, Math.sin(i * ga) * r, z);
  }
  return Float32Array.from(out);
})();

export const SHIELD_RGB = 0x5ad8ff;
export const SHIELD_HOT = 0xe6fbff;

/** A blow on the bubble: the way it came from (radians) and seconds since. */
export interface BubbleHit {
  a: number;
  t: number;
}

/** Cheap repeatable noise for point i at frame f: 0..1. */
const hash = (i: number, f: number): number => {
  let h = (i * 374761393 + f * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** A bubble's shape: an egg round the car, `rx` art px along heading `h`, `ry` across, `rz` up. */
export interface BubbleShape {
  rx: number;
  ry: number;
  rz: number;
  h: number;
}

/**
 * Draw a bubble round (x, y, z) at `time` seconds, `left` 0..1 of its strength, `fading` 0..1
 * as its time runs out. Blows are given by the way they came from in the world.
 */
export function drawBubble(
  x: number,
  y: number,
  z: number,
  S: BubbleShape,
  time: number,
  left: number,
  fading: number,
  hits: readonly BubbleHit[],
  glow: Put,
): void {
  const spin = time * 0.6;
  const cs = Math.cos(spin);
  const sn = Math.sin(spin);
  const frame = Math.floor(time * 20);
  const hc = Math.cos(S.h);
  const hs = Math.sin(S.h);
  // worn down, more cells drop out; at the end of its time the whole cage blinks
  const keep = 0.35 + 0.65 * left;
  if (fading > 0 && Math.floor(time * (6 + 14 * fading)) % 2 === 0) return;
  for (let i = 0; i < DOME.length; i += 3) {
    const px = DOME[i]!;
    const py = DOME[i + 1]!;
    const pz = DOME[i + 2]!;
    const k = i / 3;
    const noise = hash(k, frame);
    if (noise > keep) continue;
    const ax = px * cs - py * sn;
    const ay = px * sn + py * cs;
    // into the car's frame, stretched round the car
    const fx = ax * S.rx;
    const fy = ay * S.ry;
    const wx = fx * hc - fy * hs;
    const wy = fx * hs + fy * hc;
    const wl = Math.hypot(wx, wy) || 1;
    // seen from above and in front: edge on where the dome's face points sideways
    const rim = 1 - Math.abs(pz * 0.8 + (wy / wl) * 0.2 * Math.sqrt(1 - pz * pz));
    let a = 0.18 + 0.55 * rim * rim + (noise < 0.04 ? 0.5 : 0);
    let rgb = SHIELD_RGB;
    for (const h of hits) {
      if (h.t > 0.35) continue;
      const d = Math.acos(
        Math.max(-1, Math.min(1, (wx * Math.cos(h.a) + wy * Math.sin(h.a)) / wl)),
      );
      // a ring of light running out from where it was struck
      const front = Math.abs(d - h.t * 7);
      if (front < 0.5) {
        a += (1 - front * 2) * (1 - h.t / 0.35);
        rgb = SHIELD_HOT;
      }
    }
    glow(x + wx, y + wy, z + Math.max(0, pz) * S.rz, 1, rgb, Math.min(1, a), Shape.Rect);
  }
}
