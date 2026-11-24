import { DT } from '@demodogs/shared';
import type { Car, StaticProp } from './entities';
import { clamp } from './math';
import type { World } from './world';

/**
 * Shapes in the road's own surface: speed bumps, dips and potholes. Each is a static prop with a
 * `mound` (see shared/pieces.ts); the world keeps the ones that stand in `mounds`. They add to
 * the height of the ground (the venue's relief, if it has any), and a car rides whatever the
 * ground does: it tips with the slope under its wheels, rocks on its springs after a knock,
 * leaves the ground where the road falls away from under it faster than it can fall, and is
 * jolted by a wheel dropping into a hole.
 */

/** How much of the ground's climb the springs pass on to the body in a tick. */
const SPRING = 0.5;
/** The ground's climb is read over this far ahead of and behind the car's middle, px. */
const REACH = 4;
/** A step in the ground taller than this within that reach is sheer. */
const SHEER = 3;
/** The wheels leave the road when it falls away this much faster than the body (px a second). */
const LET_GO = 14;
/** A body climbing slower than this stays down, and one that flies goes up this much faster. */
const HOP_LEAST = 22;
const HOP_GAIN = 1.35;
/** The fastest a crest throws a car up, px a second. */
const HOP = 120;
/** A hop gentler than this is not worth telling anyone about. */
const HOP_TOLD = 36;
/** The body on its springs: how hard they pull it to lie with the ground, and how they damp. */
const STIFF = 620;
const DAMP = 13;
/** The steepest a car is drawn lying, height per px. */
const STEEPEST = 0.6;
/** Ground that climbs or falls faster than this from under a car's middle is a face, not a slope. */
const FACE = 1.1;
/** A car slower than this rolls through a pothole without a jolt. */
const JOLT_SPEED = 55;

/** How high shape s stands at (x, y): 0 outside it. */
export function moundHeight(s: StaticProp, x: number, y: number): number {
  const M = s.def.mound!;
  const dx = x - s.x;
  const dy = y - s.y;
  const reach = (M.long + M.wide) / 2;
  if (dx > reach || dx < -reach || dy > reach || dy < -reach) return 0;
  const cs = Math.cos(s.rot);
  const sn = Math.sin(s.rot);
  const u = (dx * cs + dy * sn) / (M.long / 2);
  const v = (-dx * sn + dy * cs) / (M.wide / 2);
  if (M.shape === 'bowl') {
    const q = u * u + v * v;
    return q >= 1 ? 0 : M.high * (1 - q) * (1 - q);
  }
  if (u >= 1 || u <= -1 || v >= 1 || v <= -1) return 0;
  // rounded along its length, level across it but for the last few px at each end
  if (M.shape === 'wedge') return (M.high * (u + 1)) / 2;
  const end = Math.min(1, ((1 - Math.abs(v)) * M.wide) / 2 / 3);
  return M.high * 0.5 * (1 + Math.cos(Math.PI * u)) * end;
}

/** How high the shapes in the road stand at (x, y), over the lie of the land. */
export function moundAt(w: World, x: number, y: number): number {
  let h = 0;
  for (const s of w.mounds) if (!s.down) h += moundHeight(s, x, y);
  return h;
}

/** The height of the ground at (x, y): the venue's relief and the shapes in the road on it. */
export function groundAt(w: World, x: number, y: number): number {
  return (w.relief ? w.relief.at(x, y) : 0) + (w.mounds.length ? moundAt(w, x, y) : 0);
}

/**
 * A car on the ground, having moved. Its body climbs and falls with the ground under it, a
 * little behind it, as its springs let it; where the road falls away from under a body still
 * going up (over a crest, off the lip of a dip), it flies.
 */
export function crest(w: World, c: Car): void {
  const v = Math.hypot(c.vx, c.vy);
  if (v < 1) {
    c.climb = 0;
    return;
  }
  // how fast the ground is rising under it, taken over a few px so a short bump is not missed
  const ux = (c.vx / v) * REACH;
  const uy = (c.vy / v) * REACH;
  const here = groundAt(w, c.x, c.y);
  const fore = groundAt(w, c.x + ux, c.y + uy) - here;
  const aft = here - groundAt(w, c.x - ux, c.y - uy);
  // a sheer step (the lip of a ramp, come at from behind) is no slope to be thrown by
  if (Math.abs(fore) > SHEER || Math.abs(aft) > SHEER) {
    c.climb = 0;
    return;
  }
  const up = ((fore + aft) / (2 * REACH)) * v;
  if (c.climb > HOP_LEAST && c.climb - up > LET_GO && !c.wrecked) {
    c.z = Math.max(c.z, 0.3);
    c.vz = Math.max(c.vz, Math.min(HOP, c.climb * HOP_GAIN));
    if (c.vz > HOP_TOLD)
      w.emit({ t: 'jolt', kind: 'hop', car: c.index, prop: -1, x: c.x, y: c.y, power: c.vz });
    // the nose goes up first
    c.pitchV += c.vz * 0.03;
    c.climb = 0;
    return;
  }
  c.climb += (up - c.climb) * SPRING;
}

/** The pothole under (x, y), if any. */
function holeAt(w: World, x: number, y: number): StaticProp | null {
  for (const s of w.mounds)
    if (!s.down && s.def.mound!.jolt > 0 && moundHeight(s, x, y) !== 0) return s;
  return null;
}

/**
 * One tick of how a car rides the ground: after it has driven. Works out how it lies (`pitch`,
 * `bank`) from the ground under its nose, tail and sides, on springs that overshoot and settle,
 * and jolts it when a wheel drops into a pothole.
 */
export function updateRide(w: World, c: Car): void {
  const air = c.z - c.deck > 0.6;
  let nose = 0;
  let side = 0;
  if (!air && c.deck > 0 && w.track) {
    // up on a deck: it lies as the deck climbs or falls along the road
    const T = w.track;
    const n = Math.max(1, Math.round((c.def.body.halfLength * c.size) / T.step));
    const a = w.deckAt((c.idx + n) % T.n);
    const b = w.deckAt((c.idx - n + T.n) % T.n);
    if (a > 0 && b > 0)
      nose = clamp(((a - b) / (2 * n * T.step)) * Math.cos(c.h - T.a[c.idx]!), -STEEPEST, STEEPEST);
  } else if (!air && (w.relief || w.mounds.length)) {
    const cs = Math.cos(c.h);
    const sn = Math.sin(c.h);
    const L = (c.def.body.halfLength - 2) * c.size;
    const W = (c.def.body.halfWidth - 0.5) * c.size;
    // (an end that is up against a face, or out over a drop, is not standing on that ground:
    // a car does not lie up a wall or down a cliff)
    const mid = groundAt(w, c.x, c.y);
    const on = (dx: number, dy: number, far: number): number => {
      const g = groundAt(w, c.x + dx, c.y + dy);
      return Math.abs(g - mid) > far * FACE ? mid : g;
    };
    nose = (on(cs * L, sn * L, L) - on(-cs * L, -sn * L, L)) / (2 * L);
    side = (on(-sn * W, cs * W, W) - on(sn * W, -cs * W, W)) / (2 * W);
    nose = clamp(nose, -STEEPEST, STEEPEST);
    side = clamp(side, -STEEPEST, STEEPEST);
  }
  if (air) {
    // in the air it turns on as it left, the nose coming down, and nothing pulls it straight
    c.pitchV += (-0.7 - c.pitchV) * Math.min(1, 5 * DT);
    c.bankV *= Math.exp(-2 * DT);
  } else {
    c.pitchV += ((nose - c.pitch) * STIFF - c.pitchV * DAMP) * DT;
    c.bankV += ((side - c.bank) * STIFF - c.bankV * DAMP) * DT;
  }
  c.pitch = clamp(c.pitch + c.pitchV * DT, -STEEPEST, STEEPEST);
  c.bank = clamp(c.bank + c.bankV * DT, -STEEPEST, STEEPEST);
  if (!w.mounds.length) return;
  // potholes: a wheel drops in once each time the car drives into one
  const s = c.wrecked || c.z - c.deck > 3 || c.deck > 0 ? null : holeAt(w, c.x, c.y);
  if (!s) {
    c.hole = -1;
    return;
  }
  if (c.hole === s.index) return;
  c.hole = s.index;
  const v = Math.hypot(c.vx, c.vy);
  if (v < JOLT_SPEED) return;
  const M = s.def.mound!;
  const keep = 1 - M.jolt * Math.min(1, v / 160);
  c.vx *= keep;
  c.vy *= keep;
  // knocked askew, to whichever side of the hole's middle it was hit, and thrown up off its lip
  const off = -(s.x - c.x) * Math.sin(c.h) + (s.y - c.y) * Math.cos(c.h);
  c.spin += (off >= 0 ? -1 : 1) * M.jolt * Math.min(1, v / 160) * 4.5;
  c.vz = Math.max(c.vz, Math.min(70, v * 0.32));
  c.z = Math.max(c.z, 0.7);
  c.pitchV -= 3;
  w.emit({ t: 'jolt', kind: 'hole', car: c.index, prop: s.index, x: c.x, y: c.y, power: v });
}
