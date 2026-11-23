import { CAR_RADIUS, DT } from '@demodogs/shared';
import type { LooseProp, StaticProp } from './entities';
import { batter, breakProp, damage, light } from './damage';
import { TAU } from './math';
import { circles } from './physics';
import { padded } from './guards';
import type { World } from './world';

/**
 * Scenery that does things by itself: presses that slam shut on a beat, and stacks of heavy
 * scrap that topple and crush what they land on. Rules come from prop manifests (`press`,
 * `topple`, `crush`); nothing here names a content id.
 */

/** Seconds a press takes to drop from open to shut. */
const DROP = 0.18;

/** Where a press is in its beat: seconds since it last slammed shut. */
function beat(s: StaticProp, t: number): number {
  const P = s.def.press!;
  // each press keeps its own beat, from the seed it was stood with
  const off = (s.seed / 10) * P.period;
  return (((t + off) % P.period) + P.period) % P.period;
}

/** How far open a press is at time t (default now): 1 wide open, 0 shut. */
export function pressOpen(w: World, s: StaticProp, t = w.time): number {
  const P = s.def.press;
  if (!P) return 1;
  const p = beat(s, t);
  if (p < P.shut) return 0;
  if (p < P.shut + P.rise) {
    const k = (p - P.shut) / P.rise;
    return k * k * (3 - 2 * k);
  }
  const drop = P.period - DROP;
  if (p < drop) return 1;
  const k = (p - drop) / DROP;
  return 1 - k * k;
}

/** Is the press shuddering, about to drop? (The client shakes it so a driver can see it coming.) */
export function pressWarning(w: World, s: StaticProp, t = w.time): boolean {
  const P = s.def.press;
  if (!P) return false;
  const p = beat(s, t);
  return p >= P.period - DROP - P.warn && p < P.period - DROP;
}

const presses = new WeakMap<World, { n: number; list: StaticProp[] }>();

function pressesOf(w: World): StaticProp[] {
  let c = presses.get(w);
  if (!c || c.n !== w.statics.length) {
    c = { n: w.statics.length, list: w.statics.filter((s) => s.def.press) };
    presses.set(w, c);
  }
  return c.list;
}

/** Run every press one tick: the ones that land this tick crush what is under them. */
export function updatePresses(w: World): void {
  for (const s of pressesOf(w)) {
    if (s.down) continue;
    const P = s.def.press!;
    const now = beat(s, w.time);
    const before = beat(s, w.time - DT);
    if (now >= before) continue;
    slam(w, s, P.reach, P.hurt);
  }
}

function slam(w: World, s: StaticProp, reach: number, hurt: number): void {
  let caught = 0;
  for (const c of w.cars) {
    if (c.wrecked || c.z > 10) continue;
    if (Math.hypot(c.x - s.x, c.y - s.y) > reach + CAR_RADIUS * 0.5) continue;
    caught++;
    // flattened where it stands
    c.vx *= 0.1;
    c.vy *= 0.1;
    c.vf *= 0.1;
    damage(w, c, hurt, null, c.x, c.y);
  }
  for (const p of w.props) {
    if (!p.alive || p.z > 10) continue;
    const dx = p.x - s.x;
    const dy = p.y - s.y;
    const d = Math.hypot(dx, dy);
    if (d > reach + p.def.radius * 0.5) continue;
    if (p.def.explodesAt !== undefined) light(p, -1, 0.02);
    else if (p.def.breaksAt !== undefined) breakProp(w, p, null);
    else {
      // too tough to crush: squeezed out from under it
      const a = d > 0.01 ? Math.atan2(dy, dx) : w.rng.range(0, TAU);
      p.vx += Math.cos(a) * 160;
      p.vy += Math.sin(a) * 160;
      p.vz = Math.max(p.vz, 40);
    }
  }
  w.emit({ t: 'press', prop: s.index, x: s.x, y: s.y, caught });
}

/**
 * A heavy stack comes down: what it was a stack of drops from where it stood and tumbles out away
 * from (x, y), where it was struck.
 */
export function topple(w: World, s: StaticProp, x: number, y: number): void {
  const T = s.def.topple;
  if (!T) return;
  const def = w.content.prop.get(T.prop);
  if (!def) return;
  const dx = s.x - x;
  const dy = s.y - y;
  const away = Math.hypot(dx, dy) > 0.5 ? Math.atan2(dy, dx) : w.rng.range(0, TAU);
  for (let i = 0; i < T.n; i++) {
    const a = away + w.rng.range(-0.7, 0.7);
    const v = T.spread * w.rng.range(0.5, 1) * (0.4 + (0.6 * (i + 1)) / T.n);
    w.props.push({
      index: w.props.length,
      def,
      x: s.x + Math.cos(a) * 2,
      y: s.y + Math.sin(a) * 2,
      z: (T.height * (i + 0.5)) / T.n,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      vz: w.rng.range(5, 40),
      rot: s.rot + w.rng.range(-0.8, 0.8),
      spin: w.rng.range(-5, 5),
      alive: true,
      fuse: 0,
      owner: -1,
    });
  }
}

/** A heavy loose prop hits the ground falling at v: whatever it lands on is hurt. */
export function land(w: World, p: LooseProp, v: number): void {
  const k = ((p.def.crush ?? 0) * v) / 100;
  if (k <= 0) return;
  const r = p.def.radius;
  for (const c of w.cars) {
    if (c.wrecked || c.z > 8) continue;
    // (a car shoves a falling slab aside as it comes down, so look a little wide)
    if (!circles(c).some(([x, y]) => Math.hypot(x - p.x, y - p.y) < r + CAR_RADIUS + 1.5)) continue;
    if (!padded(w, c, p.x, p.y)) damage(w, c, k, null, p.x, p.y);
    w.emit({ t: 'crash', x: p.x, y: p.y, impact: v * 0.5, player: c === w.player });
  }
  for (const s of w.near(p.x, p.y, r)) {
    if (s.down || s.hp === undefined) continue;
    // (it was pushed off the side of what it fell on, so look a little wide)
    if (Math.hypot(s.x - p.x, s.y - p.y) > r + s.def.radius + 2) continue;
    batter(w, s, k * 2, 'impact', p.x, p.y);
  }
  w.emit({ t: 'crash', x: p.x, y: p.y, impact: v * 0.25, player: false });
}
