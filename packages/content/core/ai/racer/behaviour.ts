import { BASE_SPEED, DT, type Controls } from '@demodogs/shared';
import { angDiff, defineAi, dropsBehind, nearestCar, steerTo, unstick } from '@demodogs/sim';

/**
 * ai.racer: drive the racing line in a lane of its own, slow for bends, pick fights with a car just
 * ahead when it is spoiling for one, grab pickups in reach, fire rockets at cars in front and drop
 * mines on cars behind. A rubber band keeps the pack close to the player.
 */
export default defineAi({
  id: 'ai.racer',
  drive(w, c) {
    const T = w.track;
    const ai = c.ai!;
    if (!T) return unstick(c, { steer: 0, throttle: 1, brake: false, boost: false, fire: false });
    const N = T.n;
    const sp = c.vf;
    const k = Math.round((26 + Math.abs(sp) * 0.5) / T.step);
    const i2 = (c.idx + k) % N;
    const lane = Math.max(-0.6, Math.min(0.6, ai.lane + Math.sin(w.time * 0.35 + ai.phase) * 0.25));
    let tx = T.x[i2]! - Math.sin(T.a[i2]!) * lane * (w.road / 2);
    let ty = T.y[i2]! + Math.cos(T.a[i2]!) * lane * (w.road / 2);
    const [prey, pd] = nearestCar(
      w,
      c,
      75,
      (o) => Math.abs(angDiff(Math.atan2(o.y - c.y, o.x - c.x), c.h)) < 0.8,
    );
    if (prey && ai.aggro > 0.35 && Math.abs(angDiff(T.a[prey.idx]!, T.a[c.idx]!)) < 0.6) {
      tx = tx * 0.35 + (prey.x + prey.vx * 0.2) * 0.65;
      ty = ty * 0.35 + (prey.y + prey.vy * 0.2) * 0.65;
    } else if (!c.weapon) {
      const p = w.pickups.find(
        (p) =>
          p.on &&
          Math.hypot(p.x - c.x, p.y - c.y) < 70 &&
          Math.abs(angDiff(Math.atan2(p.y - c.y, p.x - c.x), c.h)) < 0.5,
      );
      if (p) {
        tx = p.x;
        ty = p.y;
      }
    }
    const [steer, d] = steerTo(c, tx, ty);
    const out: Controls = { steer, throttle: 1, brake: false, boost: false, fire: false };
    const curv = Math.abs(angDiff(T.a[(c.idx + Math.round(k * 2.2)) % N]!, T.a[c.idx]!));
    const target = BASE_SPEED * c.stats.speed * (1 - Math.min(0.5, curv * 0.5));
    if (sp > target + 25) out.brake = true;
    else if (sp > target) out.throttle = 0.3;
    if (Math.abs(d) > 1.1 && sp > 70) out.throttle = 0.25;
    if (ai.boostT > 0) {
      ai.boostT -= DT;
      out.boost = true;
    } else if (curv < 0.15 && c.nitro > 0.5 && w.rng.next() < 0.006) ai.boostT = 1.3;
    if (c.weapon?.kind === 'rocket' && prey && pd < 200 && Math.abs(d) < 0.2) out.fire = true;
    if (dropsBehind(c.weapon?.kind)) {
      const [behind] = nearestCar(
        w,
        c,
        70,
        (o) => Math.abs(angDiff(Math.atan2(o.y - c.y, o.x - c.x), c.h)) > 2.5,
      );
      if (behind) out.fire = true;
    }
    // a shock pulse goes off when a rival is well inside its ring
    if (
      c.weapon?.kind === 'pulse' &&
      nearestCar(w, c, (c.weapon.radius ?? 70) * 0.7, () => true)[0]
    )
      out.fire = true;
    // rubber band: rivals far ahead of the player ease off, far behind push harder
    if (!c.isPlayer) {
      const gap = c.progress - w.player.progress;
      c.aiSpeed = ai.skill * (gap > 300 ? 0.9 : gap < -300 ? 1.07 : 1);
    }
    return unstick(c, out);
  },
});
