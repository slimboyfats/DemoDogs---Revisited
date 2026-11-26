import { DT, type Controls } from '@demodogs/shared';
import {
  defineAi,
  looksNow,
  pickHeading,
  recover,
  steerTo,
  thingsAhead,
  wantsFire,
} from '@demodogs/sim';

/**
 * ai.brawler: pick a car (a human a little more often, a hurt one sooner than a sound one), aim
 * where it is going and ram it, in the side if it can. Goes round what is in the way, keeps off
 * the wall, goes for a crate when it has nothing to fire, and when it is nearly done for
 * makes for one that might mend it. Boosts into a lined-up hit and
 * fires what it carries when it would hit.
 */
export default defineAi({
  id: 'ai.brawler',
  drive(w, c) {
    const ai = c.ai!;
    const R = ai.traits;
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
          Math.hypot(o.x - c.x, o.y - c.y) *
          (o.isPlayer ? 0.75 : 1) *
          // the mean ones finish off whoever is limping
          (1 - 0.4 * ai.aggro * (1 - o.hp / 100)) *
          w.rng.range(0.8, 1.2);
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
    // nearly done for: a crate that might mend it comes first, if there is one about
    const flee = c.hp < 12 + 14 * (1 - ai.aggro);
    let chasing = false;
    if (t) {
      // where it will be, and at its door if there is a way round to it
      const far = Math.hypot(t.x - c.x, t.y - c.y);
      const lead = Math.min(0.6, far / 260);
      tx = t.x + t.vx * lead;
      ty = t.y + t.vy * lead;
      chasing = true;
    }
    // a crate: when hurt, when empty-handed and one is near, or just because it is greedy
    const need = flee ? 200 : c.weapon ? 0 : 40 + 50 * R.greed;
    let pd = need;
    for (const p of w.pickups) {
      if (!p.on) continue;
      const d = Math.hypot(p.x - c.x, p.y - c.y);
      if (d < pd) {
        pd = d;
        tx = p.x;
        ty = p.y;
        chasing = false;
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
    // round what is in the way (wrecks, scenery, mines: not the cars it is there to hit)
    const look = 40 + Math.abs(c.vf) * 0.5;
    const things = looksNow(w, c) ? thingsAhead(w, c, look + 30, false) : null;
    const way = pickHeading(c, tx, ty, look, things);
    const [steer, d] = steerTo(c, way.x, way.y);
    const out: Controls = {
      steer,
      throttle: 1,
      brake: Math.abs(d) > 1.9 && c.vf > 40,
      boost: false,
      fire: false,
    };
    const lined = chasing && Math.abs(d) < 0.25 && Math.hypot(tx - c.x, ty - c.y) < 130;
    if (lined && c.nitro > 0.3 && ai.boostT <= 0 && w.rng.next() < 0.04 + 0.08 * ai.aggro)
      ai.boostT = 0.8;
    if (ai.boostT > 0) {
      ai.boostT -= DT;
      out.boost = true;
    }
    out.fire = wantsFire(w, c);
    if (!c.isPlayer) c.aiSpeed = ai.skill * 0.95;
    return recover(c, out, d);
  },
});
