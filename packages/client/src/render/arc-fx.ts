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
const DARK = 0x4a4c56;

/**
 * The path of everything thrown and still in the air, as dots: a dotted curve from where it was
 * thrown to where it will come down, and a dark shadow in a ring of dashes on the spot it will
 * land on. Pure: the same world gives the same dots.
 */
export function arcDots(w: World, out: ArcDot[] = []): ArcDot[] {
  out.length = 0;
  const g = GRAVITY * w.gravity * FALL;
  for (const p of w.props) {
    if (!p.alive || p.z <= 6 || Math.hypot(p.vx, p.vy) <= 30) continue;
    const left = (p.vz + Math.sqrt(p.vz * p.vz + 2 * g * p.z)) / g;
    // the dots stand still in the air while the ball flies along them: the whole curve, from
    // where it left the ground behind it to where it comes down
    const step = 0.045;
    const from = -(w.time % step) - step * 22;
    for (let t = from; t < left - 0.03; t += step) {
      if (Math.abs(t) < 0.07) continue;
      const z = p.z + p.vz * t - (g * t * t) / 2;
      if (z < (t < 0 ? 10 : 1)) continue;
      out.push({ x: p.x + p.vx * t, y: p.y + p.vy * t, z, s: 2.4, rgb: WHITE });
    }
    const lx = p.x + p.vx * left;
    const ly = p.y + p.vy * left;
    // where it will land: a dark round shadow on the ground
    const r = p.def.radius * 1.5;
    for (let dy = -r; dy <= r; dy += 3)
      for (let dx = -r; dx <= r; dx += 3)
        if (Math.hypot(dx, dy) < r) out.push({ x: lx + dx, y: ly + dy, z: 0.2, s: 3, rgb: DARK });
    // and a ring of white dashes round it
    for (let k = 0; k < 36; k++) {
      if (k % 6 > 2) continue;
      const a = (k / 36) * Math.PI * 2;
      out.push({
        x: lx + Math.cos(a) * r * 1.25,
        y: ly + Math.sin(a) * r * 1.25,
        z: 0.4,
        s: 2.4,
        rgb: WHITE,
      });
    }
  }
  return out;
}
