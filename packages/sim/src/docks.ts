import { CAR_RADIUS, type SceneryRule } from '@demodogs/shared';
import { batter, damage, spill } from './damage';
import type { LooseProp, StaticProp } from './entities';
import { TAU } from './math';
import { circles } from './physics';
import type { Rng } from './prng';
import { padded } from './guards';
import type { World } from './world';

/**
 * Harbour scenery and the things that only happen at a dock: a basin of deep water crossed by
 * piers, gantry cranes over it, barges in it, yards of stacked containers, and the top box of a
 * stack falling off whole instead of breaking up where it stood.
 */

type Add = (id: string, x: number, y: number, rot: number) => StaticProp | null;
type Harbour = Extract<SceneryRule, { rule: 'harbour' }>;
type Stacks = Extract<SceneryRule, { rule: 'stacks' }>;

function nextGroup(w: World): number {
  return w.statics.reduce((m, s) => Math.max(m, (s.group ?? -1) + 1), 0);
}

function centre(w: World): [number, number] {
  return w.oval ? [w.oval.cx, w.oval.cy] : [w.w / 2, w.h / 2];
}

/** Is (x, y) inside the arena, at least `margin` in from its wall? */
function inside(w: World, x: number, y: number, margin: number): boolean {
  const O = w.oval;
  if (!O) return x > margin && y > margin && x < w.w - margin && y < w.h - margin;
  return Math.hypot((x - O.cx) / O.rx, (y - O.cy) / O.ry) < 1 - margin / Math.min(O.rx, O.ry);
}

/** Is there water of the map within d of (x, y)? */
export function inWater(w: World, x: number, y: number, d = 0): boolean {
  for (const s of w.spills)
    if (s.fixed && s.def.drag > 0 && Math.hypot(s.x - x, s.y - y) < s.r + d) return true;
  return false;
}

export function harbour(w: World, rng: Rng, rule: Harbour, add: Add): void {
  const [cx, cy0] = centre(w);
  const cy = cy0 + rule.y;
  const H = rule.half;
  const P = rule.piers;
  const water = w.content.material.get(rule.material)!;
  const pierGap = (x: number) =>
    Math.min(...P.at.map((a) => Math.abs(x - (cx + a)) - P.wide / 2 - 2));
  // the water: pools on a grid, each as big as it can be without reaching under a pier
  const step = rule.r * 1.25;
  for (let y = cy - H + rule.r * 0.7; y <= cy + H - rule.r * 0.7 + 0.01; y += step)
    for (let x = cx - w.w / 2; x < cx + w.w / 2; x += step) {
      const r = Math.min(rule.r, pierGap(x));
      if (r < 4 || !inside(w, x, y, r * 0.5 + 4)) continue;
      spill(w, water, x, y, r, -1, true);
    }
  // the piers: plank decks from quay to quay, a pile every other plank down both sides
  for (const a of P.at) {
    const px = cx + a;
    const n = Math.max(1, Math.round(P.wide / 8));
    for (let y = cy - H - 4; y <= cy + H + 4; y += 8) {
      if (!inside(w, px, y, 10)) continue;
      for (let i = 0; i < n; i++) add(P.deck, px + (i - (n - 1) / 2) * 8, y, 0);
      if (Math.round((y - cy) / 8) % 2 === 0)
        for (const side of [-1, 1]) add(P.post, px + side * (P.wide / 2 + 2), y, 0);
    }
  }
  // bollards along both quays, never in a pier's way
  if (rule.bollard)
    for (const side of [-1, 1])
      for (let x = cx - w.w / 2; x < cx + w.w / 2; x += rule.spacing) {
        const y = cy + side * (H + 6);
        if (pierGap(x) < 8 || !inside(w, x, y, 14) || !w.free(x, y, 6)) continue;
        add(rule.bollard, x + rng.range(-3, 3), y, rng.next() * TAU);
      }
  // the cranes: legs on both quays, the gantry over the water
  if (rule.cranes) {
    const C = rule.cranes;
    for (const a of C.at) {
      const x = cx + a;
      const reach = H + 16;
      if (!inside(w, x, cy - reach, 16) || !inside(w, x, cy + reach, 16)) continue;
      const group = nextGroup(w);
      for (const sx of [-11, 11])
        for (const sy of [-reach, reach]) {
          const s = add(C.leg, x + sx, cy + sy, 0);
          if (s) Object.assign(s, { group, bears: true });
        }
      for (let y = cy - reach + 6; y <= cy + reach - 6 + 0.01; y += 14) {
        const s = add(C.beam, x, y, Math.PI / 2);
        if (s) Object.assign(s, { group, bears: false });
      }
    }
  }
  // the barges: moored along the channel between the piers, clear of each other
  if (rule.barges) {
    const B = rule.barges;
    const def = w.content.prop.get(B.prop)!;
    for (let n = 0, tries = 0; n < B.count && tries < B.count * 60; tries++) {
      const x = cx + rng.range(-w.w / 2, w.w / 2);
      const y = cy + rng.range(-H + def.radius + 4, H - def.radius - 4);
      if (pierGap(x) < def.radius * 1.6 + 6) continue;
      if (!inside(w, x, y, def.radius * 1.6 + 8) || !w.free(x, y, def.radius + 10)) continue;
      add(B.prop, x, y, rng.range(-0.08, 0.08));
      n++;
    }
  }
}

export function stacks(w: World, rng: Rng, rule: Stacks, add: Add): void {
  const [sx, sy] = rule.step;
  for (let n = 0, tries = 0; n < rule.count && tries < rule.count * 40; tries++) {
    const cols = rule.cols[0] + rng.int(rule.cols[1] - rule.cols[0] + 1);
    const rows = rule.rows[0] + rng.int(rule.rows[1] - rule.rows[0] + 1);
    // squared to the arena, end on or side on
    const rot = rng.next() < 0.5 ? 0 : Math.PI / 2;
    const cs = Math.cos(rot);
    const sn = Math.sin(rot);
    const x = rng.range(0, w.w);
    const y = rng.range(0, w.h);
    const reach = Math.hypot(cols * sx, rows * sy) / 2 + 4;
    if (!inside(w, x, y, reach + 10) || inWater(w, x, y, reach + rule.clear)) continue;
    if (!w.free(x, y, reach + rule.clear)) continue;
    if (w.cars.some((c) => Math.hypot(c.x - x, c.y - y) < reach + 34)) continue;
    if (w.pickups.some((p) => Math.hypot(p.x - x, p.y - y) < reach + 8)) continue;
    for (let i = 0; i < cols; i++)
      for (let j = 0; j < rows; j++) {
        // now and then a gap where a box has been taken away
        if (cols * rows > 2 && rng.next() < 0.08) continue;
        const lx = (i - (cols - 1) / 2) * sx;
        const ly = (j - (rows - 1) / 2) * sy;
        const px = x + lx * cs - ly * sn;
        const py = y + lx * sn + ly * cs;
        const group = nextGroup(w);
        const b = add(rng.pick(rule.bottom), px, py, rot);
        if (!b) continue;
        Object.assign(b, { group, bears: true });
        if (rng.next() < rule.high) {
          const t = add(rng.pick(rule.top), px, py, rot);
          if (t) Object.assign(t, { group, bears: false });
        }
      }
    n++;
  }
}

/**
 * A piece standing on something has come down: it falls off whole as its loose kind, tipping
 * away from where it was hit (or any way at all when the box under it went).
 */
export function tipOff(w: World, s: StaticProp, x: number, y: number): void {
  const T = s.def.topples;
  if (!T) return;
  const def = w.content.prop.get(T.into)!;
  let a = Math.atan2(s.y - y, s.x - x);
  if (Math.hypot(s.x - x, s.y - y) < 0.5) a = w.rng.next() * TAU;
  // it slides off the box under it (if that still stands) to the first open side, starting
  // with the side away from the hit: loose props are pushed out of anything solid
  let base = 0;
  for (const o of w.near(s.x, s.y, 2))
    if (o !== s && !o.down && o.def.solid && Math.hypot(o.x - s.x, o.y - s.y) < 2)
      base = Math.max(base, o.def.radius);
  const off = base ? base + def.radius + 0.5 : 2;
  const clear = (t: number) => {
    const px = s.x + Math.cos(t) * off;
    const py = s.y + Math.sin(t) * off;
    for (const o of w.near(px, py, def.radius))
      if (!o.down && o.def.solid && Math.hypot(o.x - px, o.y - py) < o.def.radius + def.radius)
        return false;
    return inside(w, px, py, def.radius + 2);
  };
  for (let k = 0; k < 8; k++) {
    const t = a + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (TAU / 8);
    if (clear(t)) {
      a = t;
      break;
    }
  }
  const v = w.rng.range(35, 60);
  const p: LooseProp = {
    index: w.props.length,
    def,
    x: s.x + Math.cos(a) * off,
    y: s.y + Math.sin(a) * off,
    z: T.z,
    vx: Math.cos(a) * v,
    vy: Math.sin(a) * v,
    vz: w.rng.range(10, 35),
    rot: s.rot,
    spin: w.rng.range(-2.5, 2.5),
    alive: true,
    fuse: 0,
    owner: -1,
  };
  w.props.push(p);
}

/**
 * A heavy loose prop coming down fast (a falling container) meets a car roof or the ground: it
 * crushes the car under it, staves in light scenery it lands on, and bounces.
 */
export function smash(w: World, p: LooseProp): void {
  const C = p.def.smash;
  if (!C || p.crushed) return;
  const fall = -p.vz;
  // a container's weight does the damage more than its speed
  const k = Math.min(1, 0.55 + fall / 220);
  // touching a car's body: a car shoves a loose prop out to exactly this far
  const m = p.def.radius + CAR_RADIUS + 1.5;
  let hit = false;
  let player = false;
  for (const c of w.cars) {
    if (c.wrecked || c.z > 8 || Math.abs(c.x - p.x) > 30 || Math.abs(c.y - p.y) > 30) continue;
    if (!circles(c).some((q) => Math.hypot(q[0] - p.x, q[1] - p.y) < m)) continue;
    if (!padded(w, c, p.x, p.y)) damage(w, c, C * k, null, p.x, p.y);
    hit = true;
    player ||= c === w.player;
  }
  if (!hit && p.z > 0) return;
  const r = p.def.radius + 4;
  if (p.z <= 0)
    for (const s of w.near(p.x, p.y, r))
      if (!s.down && Math.hypot(s.x - p.x, s.y - p.y) < r)
        batter(w, s, C * k * 1.5, 'impact', p.x, p.y);
  w.emit({ t: 'crash', x: p.x, y: p.y, impact: fall, player });
  p.crushed = true;
  p.z = Math.max(0, p.z);
  p.vz = fall * 0.2;
}
