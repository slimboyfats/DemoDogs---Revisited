import { GRAVITY } from '@demodogs/shared';
import type { World } from '@demodogs/sim';

/**
 * One mark of a thrown thing's path: a white dot in the air or on the ground (`a` 1), or the soft
 * round shadow on the spot it will land on (`shade`: `s` is then how far across it is).
 */
export interface ArcDot {
  x: number;
  y: number;
  z: number;
  s: number;
  rgb: number;
  a: number;
  shade?: true;
}

/** How fast a loose prop falls (sim/things.ts), as a share of gravity. */
const FALL = 0.95;
const WHITE = 0xfcfcf4;

/**
 * The path of everything thrown and still in the air: a dotted curve from the mouth it left to
 * where it will come down, and a soft shadow in a ring of dashes on the spot it will land on.
 * Pure: the same world gives the same marks.
 */
export function arcDots(w: World, out: ArcDot[] = []): ArcDot[] {
  out.length = 0;
  const g = GRAVITY * w.gravity * FALL;
  for (const p of w.props) {
    if (!p.alive || p.z <= 6 || Math.hypot(p.vx, p.vy) <= 30) continue;
    const left = (p.vz + Math.sqrt(p.vz * p.vz + 2 * g * p.z)) / g;
    // how long ago it left its thrower's mouth, if a thrower threw it
    let since = 0.3;
    for (const T of w.throwers) {
      if (!T.balls.includes(p.index)) continue;
      const m = T.s.def.thrower!.mouth[0];
      const dx = p.x - (T.s.x + Math.cos(T.s.rot) * m);
      const dy = p.y - (T.s.y + Math.sin(T.s.rot) * m);
      since = Math.hypot(dx, dy) / Math.hypot(p.vx, p.vy);
    }
    // the dots stand still in the air while the ball flies along them
    const step = 0.04;
    for (let t = -since + ((((since - w.time) % step) + step) % step); t < left - 0.02; t += step) {
      if (Math.abs(t) < 0.06) continue;
      const z = p.z + p.vz * t - (g * t * t) / 2;
      if (z < 1) continue;
      out.push({ x: p.x + p.vx * t, y: p.y + p.vy * t, z, s: 2, rgb: WHITE, a: 1 });
    }
    const lx = p.x + p.vx * left;
    const ly = p.y + p.vy * left;
    const r = p.def.radius * 1.5;
    out.push({ x: lx, y: ly, z: 0, s: r * 2, rgb: 0x000000, a: 0.3, shade: true });
    // a ring of white dashes round it: three dots on, three off
    for (let k = 0; k < 48; k++) {
      if (k % 6 > 2) continue;
      const a = (k / 48) * Math.PI * 2;
      out.push({
        x: lx + Math.cos(a) * r * 1.25,
        y: ly + Math.sin(a) * r * 1.25,
        z: 0.3,
        s: 1.6,
        rgb: WHITE,
        a: 1,
      });
    }
  }
  return out;
}
