import { BASE_SPEED, DT, type Controls } from '@demodogs/shared';
import { armsWants } from './arms';
import { arsenalWants } from './arsenal';
import { dropsBehind } from './drops';
import type { Car } from './entities';
import { howlWants } from './howl';
import { angDiff, clamp } from './math';
import { onPad } from './pads';
import { SHOULDER } from './relief';
import type { World } from './world';

/**
 * Helpers for AI behaviours (content). They only read the world and keep the car's own AiState.
 *
 * A driver is put together from four of them: `thingsAhead` (what is in the way and what is
 * worth having), `pickPath` (which way round it all), `cornerSpeed` (how fast the line ahead can
 * be taken) and `recover` (getting out when it has gone wrong), with `wantsFire` and `wantsBoost`
 * for what it carries. None of them names a weapon, a prop or a track: they read kinds and
 * numbers off the manifests, so new cars, items and venues need nothing here.
 */

/** Something near a car's way: to keep off (`w` above 0) or to go for (`w` below 0). */
export interface Thing {
  x: number;
  y: number;
  r: number;
  w: number;
}

/**
 * Getting out of trouble. A car that pushes and does not move backs away with its wheels turned
 * so that its nose swings towards `d` (the angle it still has to turn); if it is no freer for
 * that it backs for longer the next time, and if it cannot back either it gives up backing and
 * shoves forwards the other way. A car facing the wrong way swings round on the handbrake.
 */
export function recover(c: Car, out: Controls, d: number): Controls {
  const ai = c.ai!;
  ai.freeT += DT;
  if (ai.freeT > 4 || Math.abs(c.vf) > 90) ai.tries = 0;
  const turn = d < 0 ? -1 : 1;
  if (ai.revT > 0) {
    ai.revT -= DT;
    ai.stuckT = 0;
    // backing and still not moving: something is behind it too
    ai.jamT = Math.abs(c.vf) < 6 ? ai.jamT + DT : 0;
    if (ai.jamT > 0.45) {
      ai.revT = 0;
      ai.jamT = 0;
    }
    // (in reverse the wheels turn the nose the other way)
    return { steer: -turn, throttle: 0, brake: true, boost: false, fire: out.fire };
  }
  ai.jamT = 0;
  // (down a pit, stalled or flattened it is not stuck: there is nothing to back out of)
  const held = (c.stall ?? 0) > 0 || (c.sunk ?? 0) > 0 || c.squashT > 0;
  if (out.throttle > 0.5 && !out.brake && Math.abs(c.vf) < 12 && !held) {
    ai.stuckT += DT;
    if (ai.stuckT > 0.7) {
      ai.stuckT = 0;
      ai.revT = Math.min(1.6, 0.7 + 0.3 * ai.tries);
      ai.tries++;
      ai.freeT = 0;
    }
  } else ai.stuckT = Math.max(0, ai.stuckT - DT);
  // pointing well away from where it wants to go: round on the handbrake, or on the spot
  if (Math.abs(d) > 1.7) {
    // facing right back the way it should go and hardly moving: back round, the quick way
    if (Math.abs(d) > 2.1 && Math.abs(c.vf) < 25 && ai.freeT > 1.6 && !held) {
      ai.revT = 0.75;
      ai.freeT = 0;
      return { steer: -turn, throttle: 0, brake: true, boost: false, fire: out.fire };
    }
    if (c.vf > 45) return { ...out, steer: turn, throttle: 0, brake: true, boost: false };
    return { ...out, steer: turn, throttle: 0.75, brake: false, boost: false };
  }
  return out;
}

/** The nearest other running car for which `ok` holds, and its distance. */
export function nearestCar(
  w: World,
  c: Car,
  maxDist: number,
  ok: (o: Car, d: number) => boolean,
): [Car | null, number] {
  let best: Car | null = null;
  let bd = maxDist;
  for (const o of w.cars) {
    if (o === c || o.wrecked) continue;
    const d = Math.hypot(o.x - c.x, o.y - c.y);
    if (d < bd && ok(o, d)) {
      bd = d;
      best = o;
    }
  }
  return [best, bd];
}

/** Steer towards (x, y): -1 to 1, and the angle still to turn. */
export function steerTo(c: Car, x: number, y: number, gain = 2.6): [number, number] {
  let d = (Math.atan2(y - c.y, x - c.x) - c.h) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return [Math.max(-1, Math.min(1, d * gain)), d];
}

/**
 * What lies within `reach` ahead of car c that a driver should mind: other cars it is catching
 * (where they will be when it gets there), wrecks, scenery, drums, mines, spikes, pools, fire and
 * pits to keep off; and crates, boost tiles, ramps and scrap bots to go for, as much as it is
 * greedy or in need. A car it means to ram counts as something to go for. Without `rivals`, the
 * running cars are left out (a brawler does not go round them).
 */
export function thingsAhead(w: World, c: Car, reach: number, rivals = true): Thing[] {
  const ai = c.ai!;
  const T = ai.traits;
  const out: Thing[] = [];
  const cs = Math.cos(c.h);
  const sn = Math.sin(c.h);
  const fwd = (x: number, y: number) => (x - c.x) * cs + (y - c.y) * sn;
  const seen = (x: number, y: number, r: number) => {
    const f = fwd(x, y);
    return f > -10 - r && f < reach + r && Math.abs(-(x - c.x) * sn + (y - c.y) * cs) < reach;
  };
  const level = (z: number) => Math.abs(z - c.deck) <= 8;
  const mean = ai.aggro > 0.55 && c.hp > 40;
  for (const o of w.cars) {
    if (o === c || o.buried || !level(o.deck) || o.z - o.deck > 10) continue;
    const f = fwd(o.x, o.y);
    if (f < -14 || f > reach + 20) continue;
    const r = 12 * o.size;
    if (o.wrecked) {
      if (seen(o.x, o.y, r)) out.push({ x: o.x, y: o.y, r: r + 2, w: 1.3 });
      continue;
    }
    // (in a brawl the running cars are what it is there for)
    if (!rivals) continue;
    const closing = c.vf - (o.vx * cs + o.vy * sn);
    // a car that is pulling away is not in the way; one alongside is given room
    if (closing < 6 && f > 28) continue;
    const t = clamp(f / Math.max(closing, 30), 0, 0.9);
    const x = o.x + o.vx * t;
    const y = o.y + o.vy * t;
    if (!seen(x, y, r)) continue;
    // spoiling for it: a car just ahead is there to be hit
    if (mean && f > 10 && f < 90 && o.size <= c.size * 1.3)
      out.push({ x, y, r: r + 4, w: -0.8 * ai.aggro });
    else out.push({ x, y, r, w: closing > 6 ? 1 : 0.6 });
  }
  if (c.deck <= 4) {
    const mx = c.x + cs * reach * 0.5;
    const my = c.y + sn * reach * 0.5;
    for (const s of w.near(mx, my, reach * 0.6)) {
      if (s.down || (s.lift ?? 0) > 8 || s.link !== undefined) continue;
      const P = s.def.pad;
      if (P) {
        // a tile that points the way the car is going: a boost is worth a detour, a ramp is for
        // those who like the air
        if (!seen(s.x, s.y, 0)) continue;
        const [u, v] = onPad(s, c.x, c.y);
        const before = u < -P.long / 2 - 6;
        if (Math.cos(s.rot) * cs + Math.sin(s.rot) * sn > 0.6 && before) {
          // (a ramp is usually there to clear what stands behind it, so nobody shirks one)
          const want = P.kind === 'boost' ? 0.5 + 0.5 * T.greed : 0.35 + 0.5 * T.greed;
          out.push({ x: s.x, y: s.y, r: P.wide * 0.4, w: -want });
        } else if (s.def.mound && !before && Math.abs(v) > P.wide / 2)
          // beside a ramp, or coming at it the wrong way: its side is a step no car climbs
          out.push({ x: s.x, y: s.y, r: P.wide * 0.5, w: 1.2 });
        continue;
      }
      if (!s.def.solid || s.def.mound || !seen(s.x, s.y, s.def.radius)) continue;
      // what a car ploughs through or sails over is not much in the way
      const soft = (s.hp !== undefined && s.hp < 15) || s.def.low !== undefined;
      out.push({ x: s.x, y: s.y, r: s.def.radius, w: soft ? 0.25 : 1.6 });
    }
  }
  for (const p of w.props) {
    if (!p.alive || !level(p.z) || !seen(p.x, p.y, p.def.radius)) continue;
    // what goes off when it is hit, and what is too heavy to shove; the rest is skittles
    if (p.def.explodesAt !== undefined || p.def.rocket || p.fuse > 0)
      out.push({ x: p.x, y: p.y, r: p.def.radius + 5, w: 1.4 });
    else if ((p.def.mass ?? 0.5) > 1.5) out.push({ x: p.x, y: p.y, r: p.def.radius, w: 0.7 });
  }
  for (const m of w.mines)
    if (m.owner !== c.index && level(m.z) && seen(m.x, m.y, 8))
      out.push({ x: m.x, y: m.y, r: 9, w: 2 });
  if (c.deck <= 4) {
    for (const s of w.spikes)
      if (s.owner !== c.index && seen(s.x, s.y, 4)) out.push({ x: s.x, y: s.y, r: 5, w: 1.2 });
    for (const s of w.spills)
      if ((s.def.grip < 0.85 || s.def.drag > 0.2) && seen(s.x, s.y, s.r))
        out.push({ x: s.x, y: s.y, r: s.r * 0.8, w: 0.8 });
    for (const b of w.blazes)
      if (seen(b.x, b.y, b.r)) out.push({ x: b.x, y: b.y, r: b.r * 0.8, w: 1.5 });
    for (const k of w.craters)
      if (seen(k.x, k.y, k.r)) out.push({ x: k.x, y: k.y, r: k.r * 0.7, w: 0.6 });
    // what the stranger weapons leave about: pits, twisters, sentry guns, where a strike will land
    for (const k of w.wild.holes)
      if (seen(k.x, k.y, k.r)) out.push({ x: k.x, y: k.y, r: k.r, w: 2 });
    for (const k of w.wild.twisters)
      if (k.owner !== c.index && seen(k.x, k.y, 16)) out.push({ x: k.x, y: k.y, r: 16, w: 1.5 });
    for (const k of w.arsenal.sentries)
      if (k.owner !== c.index && seen(k.x, k.y, 8)) out.push({ x: k.x, y: k.y, r: 10, w: 1 });
    for (const k of w.arsenal.strikes)
      if (k.owner !== c.index && seen(k.x, k.y, 20)) out.push({ x: k.x, y: k.y, r: 20, w: 1.5 });
    for (const k of w.critters)
      if (k.z < 6 && seen(k.x, k.y, k.def.radius))
        out.push({ x: k.x, y: k.y, r: k.def.radius + 2, w: k.state === 'charge' ? 1.5 : 0.5 });
    // a scrap bot is points and boost for whoever flattens it
    if (c.nitro < 0.8)
      for (const b of w.bots)
        if (b.alive && seen(b.x, b.y, 4)) out.push({ x: b.x, y: b.y, r: 6, w: -0.3 * T.greed });
  }
  // a crate: worth more with nothing to fire, or when hurt (a hurt car's crate may mend it)
  const want = 0.25 + 0.6 * T.greed + (c.weapon ? 0 : 0.5) + (c.hp < 70 ? 0.5 : 0);
  for (const p of w.pickups)
    if (p.on && level(p.z) && seen(p.x, p.y, 0)) out.push({ x: p.x, y: p.y, r: 10, w: -want });
  return out;
}

/**
 * Is this one of the ticks car c looks about it? A driver takes stock a few times a second, not
 * sixty, and the field takes turns so the work is spread. Between looks it holds to what it chose
 * (`pickPath` and `pickHeading` with no things).
 */
export function looksNow(w: World, c: Car): boolean {
  return (w.tick + c.index) % LOOK_EVERY === 0;
}
const LOOK_EVERY = 4;

/** How far (px, py) is from the straight between (ax, ay) and (bx, by), and how far along it (0 to 1). */
function offSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): [number, number] {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len > 0 ? clamp(((px - ax) * dx + (py - ay) * dy) / len, 0, 1) : 0;
  return [Math.hypot(px - ax - dx * t, py - ay - dy * t), t];
}

/**
 * What it costs car c to drive straight at (x, y) with `things` about: more for each thing to
 * keep off that the way passes within a car's width of (and the nearer it is, the more), less
 * for each thing to go for that the way runs over. The second number is how far off the nearest
 * thing squarely in the way is, or Infinity.
 */
export function wayCost(c: Car, x: number, y: number, things: readonly Thing[]): [number, number] {
  let cost = 0;
  let block = Infinity;
  const half = 8 * c.size;
  const len = Math.hypot(x - c.x, y - c.y);
  for (const k of things) {
    const [d, t] = offSegment(k.x, k.y, c.x, c.y, x, y);
    if (k.w < 0) {
      if (d < k.r + 4) cost += k.w * 1.6 * (1.2 - t * 0.4);
      continue;
    }
    const clear = k.r + half;
    if (d >= clear + 10) continue;
    cost += k.w * (2.5 * (1 - d / (clear + 10)) + (d < clear ? 3 : 0)) * (1.4 - t * 0.7);
    if (d < clear * 0.8) block = Math.min(block, t * len);
  }
  return [cost, block];
}

/** Where a driver has decided to go: the point, and how far off the first thing still in its way is. */
export interface Way {
  x: number;
  y: number;
  /** Across the road from its centre line, art px (a track only). */
  lat: number;
  blocked: number;
}

/** The sideways steps a driver weighs up when it looks for a way past, art px. */
const STEPS = [0, -14, 14, -28, 28, -44, 44, -62, 62];

/**
 * Racing: where car c should aim, `look` px on round the track. It would like to be on the
 * racing line (moved over by `bias` px, its own lane), and weighs that against what is in the
 * way and what is worth having: of a fan of points across the road there it takes the cheapest,
 * moving over to it no faster than a car can. With a rival coming up behind, a driver that
 * blocks leans the same way the rival is going.
 */
export function pickPath(
  w: World,
  c: Car,
  look: number,
  bias: number,
  things: readonly Thing[] | null,
): Way {
  const T = w.track!;
  const L = w.line!;
  const ai = c.ai!;
  const N = T.n;
  const i2 = (c.idx + Math.max(2, Math.round(look / T.step))) % N;
  const nx = -Math.sin(T.a[i2]!);
  const ny = Math.cos(T.a[i2]!);
  // up on a deck there are rails; beside raised road there is its shoulder to run wide on
  const room = w.road / 2 - (w.deckAt(i2) > 0 ? 14 : 9);
  const want = clamp(L.off[i2]! + bias, -room + 6, room - 6);
  // a car hard behind and catching up: which side of the road it is on
  let chaser: number | null = null;
  if (ai.traits.block > 0.05) {
    const cs = Math.cos(c.h);
    const sn = Math.sin(c.h);
    let bd = 80;
    for (const o of w.cars) {
      if (o === c || o.wrecked || Math.abs(o.deck - c.deck) > 8) continue;
      const f = (o.x - c.x) * cs + (o.y - c.y) * sn;
      if (f > -8 || f < -bd || o.vf < c.vf + 4) continue;
      bd = -f;
      const a = T.a[o.idx]!;
      chaser = -(o.x - T.x[o.idx]!) * Math.sin(a) + (o.y - T.y[o.idx]!) * Math.cos(a);
    }
  }
  let best = ai.want;
  let bc = Infinity;
  let blocked = ai.block;
  for (const step of things ? STEPS : []) {
    const lat = clamp(want + step, -room, room);
    const x = T.x[i2]! + nx * lat;
    const y = T.y[i2]! + ny * lat;
    const [cost, block] = wayCost(c, x, y, things!);
    const move = lat - want;
    let total = cost + Math.abs(move) * 0.022 + Math.abs(move - ai.side) * 0.012;
    if (chaser !== null) total += Math.abs(lat - chaser) * 0.03 * ai.traits.block;
    if (total < bc) {
      bc = total;
      best = move;
      blocked = block;
    }
  }
  ai.want = best;
  ai.block = blocked;
  // (a car moves across the road at a pace, it does not jump)
  ai.side += clamp(best - ai.side, -150 * DT, 150 * DT);
  const lat = clamp(want + ai.side, -room, room);
  return { x: T.x[i2]! + nx * lat, y: T.y[i2]! + ny * lat, lat, blocked };
}

/**
 * In an arena there is no line: the driver wants to go straight at (tx, ty) and weighs a fan of
 * headings either side of that for what is in the way, as `pickPath` does across a road.
 */
export function pickHeading(
  c: Car,
  tx: number,
  ty: number,
  look: number,
  things: readonly Thing[] | null,
): Way {
  const ai = c.ai!;
  const a0 = Math.atan2(ty - c.y, tx - c.x);
  const far = Math.min(look, Math.max(30, Math.hypot(tx - c.x, ty - c.y)));
  let best = ai.want;
  let bc = Infinity;
  let blocked = ai.block;
  for (const step of things ? STEPS : []) {
    const turn = step / 50;
    const [cost, block] = wayCost(
      c,
      c.x + Math.cos(a0 + turn) * far,
      c.y + Math.sin(a0 + turn) * far,
      things!,
    );
    const total = cost + Math.abs(turn) * 1.1 + Math.abs(turn - ai.side) * 0.4;
    if (total < bc) {
      bc = total;
      best = turn;
      blocked = block;
    }
  }
  ai.want = best;
  ai.block = blocked;
  ai.side += clamp(best - ai.side, -4 * DT, 4 * DT);
  const a = a0 + ai.side;
  return { x: c.x + Math.cos(a) * far, y: c.y + Math.sin(a) * far, lat: 0, blocked };
}

/** What a car slows at with the brakes on, art px/s² (a little under what the brakes give). */
const BRAKING = 280;

/**
 * The most car c should be doing now to get round what is coming: for every stretch of the
 * racing line as far ahead as it would take to stop, the speed that bend can be taken at (its
 * wheels turn it so many radians a second, less on a wet road; a driver with more nerve uses
 * more of that), and so the speed it may have here and still brake down to it in time.
 */
export function cornerSpeed(w: World, c: Car): number {
  const T = w.track!;
  const L = w.line!;
  const N = T.n;
  const turn = 3 * c.stats.grip * w.grip * (0.6 + 0.3 * c.ai!.traits.nerve);
  const v = Math.max(0, c.vf);
  const far = (v * v) / (2 * BRAKING) + 50;
  let best = Infinity;
  for (let d = 0; d <= far; d += T.step * 3) {
    const k = Math.abs(L.k[(c.idx + Math.round(d / T.step)) % N]!);
    if (k < 1e-4) continue;
    const cap = turn / k;
    best = Math.min(best, Math.sqrt(cap * cap + 2 * BRAKING * d));
  }
  return best;
}

/** The top speed car c would have on a clear road now, about. */
export function topSpeed(c: Car): number {
  return BASE_SPEED * c.stats.speed * c.aiSpeed * c.pace;
}

/**
 * Is car c, in a race, down beside raised road it should be up on? Then the number is which side
 * of the road it is on (-1 left, 1 right); else 0.
 */
export function belowRoad(w: World, c: Car): number {
  const R = w.relief;
  const T = w.track;
  if (!R?.plat || !T) return 0;
  const i = c.idx;
  const top = R.platAt(T.x[i]!, T.y[i]!);
  if (top < 8 || top - R.platAt(c.x, c.y) < 6) return 0;
  const a = T.a[i]!;
  return -(c.x - T.x[i]!) * Math.sin(a) + (c.y - T.y[i]!) * Math.cos(a) < 0 ? -1 : 1;
}

/**
 * Where a car down beside raised road (on `side` of it) should aim to get back up: along the
 * foot of the wall the way the road goes, where the on-ramps beside it start and where, at the
 * end of the raised stretch, the road comes down to it.
 */
export function wayBackUp(w: World, c: Car, side: number, look: number): [number, number] {
  const T = w.track!;
  const i2 = (c.idx + Math.max(4, Math.round(look / T.step))) % T.n;
  const out = w.road / 2 + SHOULDER + w.tuning.laneWide * 0.5;
  const a = T.a[i2]!;
  return [T.x[i2]! - Math.sin(a) * side * out, T.y[i2]! + Math.cos(a) * side * out];
}

/**
 * The ramp car c is about to take, if any: a jump tile within `reach` px that points its way and
 * that it is lined up with. The answer is a point a little beyond the ramp along its arrow: a
 * driver that steers for it goes straight up the middle, which is the only way up one (a ramp's
 * sides are steps).
 */
export function rampAhead(w: World, c: Car, reach: number): [number, number] | null {
  if (c.deck > 4) return null;
  let best: [number, number] | null = null;
  let bd = Infinity;
  const cs = Math.cos(c.h);
  const sn = Math.sin(c.h);
  for (const s of w.pads) {
    const P = s.def.pad!;
    if (s.down || P.kind !== 'jump') continue;
    if (Math.abs(s.x - c.x) > reach + 20 || Math.abs(s.y - c.y) > reach + 20) continue;
    const ax = Math.cos(s.rot);
    const ay = Math.sin(s.rot);
    if (ax * cs + ay * sn < 0.5) continue;
    const [u, v] = onPad(s, c.x, c.y);
    if (u < -reach || u > P.long / 2 || Math.abs(v) > P.wide / 2 + 14) continue;
    const d = Math.abs(v) + Math.abs(u) * 0.1;
    if (d < bd) {
      bd = d;
      best = [s.x + ax * 44, s.y + ay * 44];
    }
  }
  return best;
}

/** How far ahead of a car a weapon of no particular reach is worth firing, art px. */
const SHOT = 200;

/**
 * Should car c fire what it holds this tick? Each kind of weapon says when it would hit
 * (`armsWants` and the rest); a driver quick on the trigger also lets fly at a rival roughly in
 * front once it has held a thing a while, and anything dropped behind goes when a rival is on
 * its tail, or it is leading with one not far back, or it has carried it too long. On an easier
 * setting a driver takes a moment to find the button.
 */
export function wantsFire(w: World, c: Car): boolean {
  const ai = c.ai!;
  const d = c.weapon;
  if (!d) {
    ai.heldT = ai.aimT = 0;
    return false;
  }
  ai.heldT += DT;
  if (c.fireCd > 0) return false;
  const trig = ai.traits.trigger;
  const cs = Math.cos(c.h);
  const sn = Math.sin(c.h);
  let want = armsWants(w, c) || arsenalWants(w, c) || howlWants(w, c);
  // the nearest rival in front and behind, on this level
  let front = Infinity;
  let aim = 9;
  let back = Infinity;
  let near = Infinity;
  for (const o of w.cars) {
    if (o === c || o.wrecked || Math.abs(o.deck - c.deck) > 8) continue;
    const dx = o.x - c.x;
    const dy = o.y - c.y;
    const dist = Math.hypot(dx, dy);
    const off = Math.abs(angDiff(Math.atan2(dy, dx), c.h));
    near = Math.min(near, dist);
    if (off < 0.7 && dist < front) {
      front = dist;
      aim = off;
    }
    if (off > 2.3 && dist < back) back = dist;
  }
  if (dropsBehind(d.kind)) {
    const lead = w.kind === 'race' && w.standings()[0] === c;
    want =
      back < 60 + 50 * trig ||
      (lead && back < 220 && ai.heldT > 4) ||
      (ai.heldT > 16 - 8 * trig && c.vx * cs + c.vy * sn > 60);
  } else if (d.kind === 'rocket') want = front < SHOT + 60 * trig && aim < 0.12 + 0.12 * trig;
  else if (d.kind === 'pulse') want = near < (d.radius ?? 70) * 0.7;
  else if (!want && ai.heldT > 14 - 9 * trig)
    // carried long enough: a rival roughly in front will do
    want = front < (d.range ?? SHOT) && aim < 0.3 + 0.3 * trig;
  ai.aimT = want ? ai.aimT + DT : 0;
  return want && ai.aimT >= 0.35 * Math.max(0, 1 / Math.max(0.3, w.level.wits) - 1);
}

/**
 * Should car c light its boost? Only pointing where it means to go (`d`, the angle left to turn)
 * with `clear` px of road it can take flat out ahead, and then when there is something to gain:
 * a rival just ahead to pass or just behind to shake off, speed to get back after a tangle, or a
 * tank that is full anyway. Once lit it burns for a second or so.
 */
export function wantsBoost(w: World, c: Car, d: number, clear: boolean): boolean {
  const ai = c.ai!;
  if (ai.boostT > 0) {
    ai.boostT -= DT;
    return clear || ai.boostT > 0.5;
  }
  if (!clear || Math.abs(d) > 0.2 || c.nitro < 0.3 || c.offroad || c.z - c.deck > 1) return false;
  const top = topSpeed(c);
  let why = c.nitro > 0.92 || c.vf < top * 0.7;
  if (!why) {
    const cs = Math.cos(c.h);
    const sn = Math.sin(c.h);
    for (const o of w.cars) {
      if (o === c || o.wrecked) continue;
      const f = (o.x - c.x) * cs + (o.y - c.y) * sn;
      const s = Math.abs(-(o.x - c.x) * sn + (o.y - c.y) * cs);
      if (s < 60 && ((f > 20 && f < 140) || (f < -10 && f > -70))) why = true;
    }
  }
  if (!why) return false;
  ai.boostT = 0.9 + 0.6 * ai.traits.nerve;
  return true;
}
