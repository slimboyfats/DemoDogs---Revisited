import { type Controls } from '@demodogs/shared';
import {
  belowRoad,
  cornerSpeed,
  defineAi,
  looksNow,
  pickPath,
  rampAhead,
  recover,
  steerTo,
  thingsAhead,
  topSpeed,
  wantsBoost,
  wantsFire,
  wayBackUp,
} from '@demodogs/sim';

/**
 * ai.racer: drive the racing line, each driver a little off it in a lane of its own. Go round
 * what is in the way (slower cars, wrecks, scenery, mines, pools), go out of the way for crates
 * and boost tiles, brake only as late as the bend ahead needs, shut the door on a car coming up
 * behind, ram the car ahead when spoiling for it. Fire what it carries when it would hit, drop
 * what it carries on a car on its tail, and boost down a clear straight when there is a place to
 * gain. Back out of what it gets stuck on, and find the way back up beside raised road. A rubber
 * band keeps the pack close to the humans. What kind of driver it is comes from the manifest's
 * `styles`.
 */
export default defineAi({
  id: 'ai.racer',
  drive(w, c) {
    const T = w.track;
    const ai = c.ai!;
    const idle: Controls = { steer: 0, throttle: 1, brake: false, boost: false, fire: false };
    if (!T) return recover(c, idle, 0);
    const R = ai.traits;
    const sp = c.vf;
    const look = 30 + Math.abs(sp) * 0.45;
    // its own lane, and a weave that is wider the less tidy the driver (and the easier the race)
    const weave = Math.sin(w.time * 0.35 + ai.phase) * (0.04 + (0.16 * R.wobble) / w.level.wits);
    const bias = (ai.lane * 0.22 + weave) * w.road;
    const things = looksNow(w, c) ? thingsAhead(w, c, look + 50) : null;
    const way = pickPath(w, c, look, bias, things);
    let tx = way.x;
    let ty = way.y;
    // down beside raised road: along the wall to the next way up
    const below = belowRoad(w, c);
    if (below) [tx, ty] = wayBackUp(w, c, below, look);
    // a ramp: straight up the middle of it, whatever else is going on
    const ramp = below ? null : rampAhead(w, c, 30 + Math.abs(sp) * 0.3);
    if (ramp) [tx, ty] = ramp;
    const [steer, d] = steerTo(c, tx, ty);
    const out: Controls = { steer, throttle: 1, brake: false, boost: false, fire: false };
    // no faster than the bends ahead allow, and off the power while it is pointing the wrong way
    const cap = cornerSpeed(w, c);
    if (ramp) out.throttle = 1;
    else if (sp > cap + 14) out.brake = true;
    else if (sp > cap) out.throttle = 0.2;
    if (Math.abs(d) > 1.1 && sp > 70) out.throttle = Math.min(out.throttle, 0.25);
    // something square in the way that it cannot get round in time
    if (way.blocked < 16 + sp * 0.12 && sp > 60) out.throttle = Math.min(out.throttle, 0.3);
    out.boost = !below && wantsBoost(w, c, d, cap > topSpeed(c) * 1.3);
    out.fire = wantsFire(w, c);
    // rubber band: rivals far ahead of the humans ease off, far behind push harder
    if (!c.isPlayer) {
      const gap = c.progress - w.humanProgress();
      c.aiSpeed = ai.skill * (gap > 300 ? w.level.ease : gap < -300 ? w.level.press : 1);
    }
    return recover(c, out, d);
  },
});
