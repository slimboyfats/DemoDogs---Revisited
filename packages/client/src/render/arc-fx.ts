import { GRAVITY } from '@demodogs/shared';
import type { World } from '@demodogs/sim';

/** One dot of a thrown thing's path: where, how big, what colour. */
export interface ArcDot {
  x: number;
  y: number;
  z: number;
  s: number;
  rgb: number;
}

/** How fast a loose prop falls (sim/things.ts), as a share of gravity. */
const FALL = 0.95;
// (not pure white: the shader reads the colour as a float and rounds it up out of range)
const WHITE = 0xfcfcf4;

/**
 * The path of everything thrown and still in the air, as dots: a dotted line from where it is to
 * where it will come down, a shorter one back the way it came, and a ring of dashes round the
 * spot it will land on. Pure: the same world gives the same dots.
 */
export function arcDots(w: World, out: ArcDot[] = []): ArcDot[] {
  out.length = 0;
  const g = GRAVITY * w.gravity * FALL;
  for (const p of w.props) {
    if (!p.alive || p.z <= 6 || Math.hypot(p.vx, p.vy) <= 30) continue;
    const left = (p.vz + Math.sqrt(p.vz * p.vz + 2 * g * p.z)) / g;
    // the dots stand still in the air while the ball flies along them
    const step = 0.07;
    const from = -Math.min(0.42, w.time % step) - step * 5;
    for (let t = from; t < left - 0.04; t += step) {
      if (Math.abs(t) < 0.06) continue;
      const z = p.z + p.vz * t - (g * t * t) / 2;
      if (z < 1) continue;
      out.push({ x: p.x + p.vx * t, y: p.y + p.vy * t, z, s: 3, rgb: WHITE });
    }
    const lx = p.x + p.vx * left;
    const ly = p.y + p.vy * left;
    const r = p.def.radius * 1.7;
    for (let k = 0; k < 24; k++) {
      // dashes: two dots on, two off
      if (k % 4 > 1) continue;
      const a = (k / 24) * Math.PI * 2;
      out.push({ x: lx + Math.cos(a) * r, y: ly + Math.sin(a) * r, z: 0.4, s: 3, rgb: WHITE });
    }
  }
  return out;
}
