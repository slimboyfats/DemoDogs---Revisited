import { DT, type Controls } from '@demodogs/shared';
import {
  armsWants,
  arsenalWants,
  howlWants,
  defineAi,
  dropsBehind,
  nearestCar,
  steerTo,
  unstick,
} from '@demodogs/sim';

/**
 * ai.brawler: pick a car (the player a little more often), aim where it is going and ram it.
 * Keeps off the wall, sometimes detours for a pickup, boosts into a lined-up hit.
 */
export default defineAi({
  id: 'ai.brawler',
  drive(w, c) {
    const ai = c.ai!;
    const O = w.oval;
    const cx = O ? O.cx : w.w / 2;
    const cy = O ? O.cy : w.h / 2;
    ai.targetT -= DT;
    const cur = ai.target >= 0 ? w.cars[ai.target] : undefined;
    if (ai.targetT <= 0 || !cur || cur.wrecked) {
      ai.targetT = w.rng.range(1.5, 3.5);
      let best = -1;
      let bd = 1e9;
      for (const o of w.cars) {
        if (o === c || o.wrecked) continue;
        const d =
          Math.hypot(o.x - c.x, o.y - c.y) * (o.isPlayer ? 0.75 : 1) * w.rng.range(0.8, 1.2);
        if (d < bd) {
          bd = d;
          best = o.index;
        }
      }
      ai.target = best;
    }
    let tx = cx;
    let ty = cy;
    const t = ai.target >= 0 ? w.cars[ai.target]! : null;
    if (t) {
      tx = t.x + t.vx * 0.3;
      ty = t.y + t.vy * 0.3;
    }
    if (!c.weapon && w.rng.next() < 0.004) {
      const p = w.pickups.find((p) => p.on);
      if (p) {
        ai.target = -1;
        ai.targetT = 2;
        tx = p.x;
        ty = p.y;
      }
    }
    if (O) {
      const q = Math.hypot((c.x - O.cx) / O.rx, (c.y - O.cy) / O.ry);
      if (q > 0.78) {
        const k = Math.max(0, Math.min(0.9, (q - 0.78) * 3.5));
        tx = tx * (1 - k) + cx * k;
        ty = ty * (1 - k) + cy * k;
      }
    }
    const [steer, d] = steerTo(c, tx, ty);
    const out: Controls = {
      steer,
      throttle: 1,
      brake: Math.abs(d) > 1.9 && c.vf > 40,
      boost: false,
      fire: false,
    };
    if (
      t &&
      Math.abs(d) < 0.25 &&
      Math.hypot(tx - c.x, ty - c.y) < 120 &&
      c.nitro > 0.3 &&
      w.rng.next() < 0.03
    )
      ai.boostT = 0.8;
    if (ai.boostT > 0) {
      ai.boostT -= DT;
      out.boost = true;
    }
    if (armsWants(w, c) || arsenalWants(w, c)) out.fire = true;
    if (c.weapon?.kind === 'rocket' && t && Math.abs(d) < 0.2) out.fire = true;
    if (dropsBehind(c.weapon?.kind) && w.rng.next() < 0.01) out.fire = true;
    // a shock pulse goes off when a rival is well inside its ring
    if (
      c.weapon?.kind === 'pulse' &&
      nearestCar(w, c, (c.weapon.radius ?? 70) * 0.7, () => true)[0]
    )
      out.fire = true;
    if (howlWants(w, c)) out.fire = true;
    if (!c.isPlayer) c.aiSpeed = ai.skill * 0.95;
    return unstick(c, out);
  },
});
