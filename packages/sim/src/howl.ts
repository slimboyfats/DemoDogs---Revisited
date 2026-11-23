import { DT, type WeaponManifest } from '@demodogs/shared';
import type { Car } from './entities';
import { batter, damage, shed } from './damage';
import { held } from './guards';
import type { World } from './world';

/**
 * Howls: a shockwave that digs no crater and lights no fire. A front of pressure runs out over
 * the ground from where the car stood, and everything it crosses is hurled away from the middle:
 * cars are thrown into the air and tumble, loose props fly, and whatever is in flight (rockets,
 * shells, wrecking balls, sticky bombs, drops of a spray, burning bits) is turned round and sent
 * outward as the howler's own. Things that only lie there (mines, spikes, a ticking bomb, a bank
 * of smoke) are swept along with the front and left at its rim. Scrap bots are bowled over, trees
 * lose leaves and flimsy scenery takes a knock.
 *
 * After mudders' Shockwave (`terrainop.displace`: no crater, a ring of force that flings what it
 * meets). Nothing here names a content id: every number comes from the weapon's manifest.
 */
export interface Howl {
  x: number;
  y: number;
  /** The level it went off on (a deck's height, or 0). */
  z: number;
  /** How far the front has run, where it was a tick ago, and how far it goes. */
  r: number;
  was: number;
  max: number;
  owner: number;
  def: WeaponManifest;
  /** Cars, loose props and scenery it has already struck, by index. */
  cars: number[];
  props: number[];
  statics: number[];
}

/** How far behind the front something fast may have slipped and still be caught by it. */
const BAND = 14;
/** Things on a level this far above or below the wave are passed by. */
const LEVELS = 12;
/** Something already going outward this fast has been thrown and is left alone. */
const THROWN = 120;

/** A shockwave of `def` goes off at (x, y) on level z, as car `owner`'s. */
export function howl(
  w: World,
  def: WeaponManifest,
  owner: number,
  x: number,
  y: number,
  z = 0,
): void {
  const max = def.radius ?? 130;
  w.howls.push({ x, y, z, r: 0, was: -1, max, owner, def, cars: [owner], props: [], statics: [] });
  w.emit({ t: 'howl', car: owner, x, y, z, r: max, life: max / (def.speed ?? 420) });
}

export function fireHowl(w: World, c: Car, def: WeaponManifest): void {
  howl(w, def, c.index, c.x, c.y, c.deck);
}

/** For AI drivers: is a rival close enough to throw, or a rocket coming in? */
export function howlWants(w: World, c: Car): boolean {
  const d = c.weapon;
  if (!d || d.kind !== 'howl' || c.fireCd > 0) return false;
  const R = d.radius ?? 130;
  for (const o of w.cars) {
    if (o === c || o.wrecked || Math.abs(o.deck - c.deck) > LEVELS) continue;
    if (Math.hypot(o.x - c.x, o.y - c.y) < R * 0.45) return true;
  }
  for (const r of w.rockets) {
    if (r.owner === c.index || Math.abs(r.z - c.deck) > LEVELS) continue;
    const dx = c.x - r.x;
    const dy = c.y - r.y;
    const dist = Math.hypot(dx, dy);
    if (dist < R * 0.6 && dx * Math.cos(r.h) + dy * Math.sin(r.h) > dist * 0.7) return true;
  }
  return false;
}

/** One tick: every front runs on and throws what it reaches. */
export function updateHowls(w: World): void {
  for (let i = w.howls.length - 1; i >= 0; i--) {
    const p = w.howls[i]!;
    p.was = p.r;
    p.r = Math.min(p.max, p.r + (p.def.speed ?? 420) * DT);
    front(w, p);
    if (p.r >= p.max) w.howls.splice(i, 1);
  }
}

/** The way out from the middle through (x, y), and how far out that is. */
function out(w: World, p: Howl, x: number, y: number): [number, number, number] {
  const dx = x - p.x;
  const dy = y - p.y;
  const d = Math.hypot(dx, dy);
  if (d > 0.01) return [dx / d, dy / d, d];
  // dead centre: any way will do
  const a = w.rng.range(0, Math.PI * 2);
  return [Math.cos(a), Math.sin(a), 0];
}

/** Has the front just come over something `d` from the middle (`r` its own size)? */
function reached(p: Howl, d: number, r = 0): boolean {
  return d - r <= p.r;
}

/** As `reached`, for things with no list of their own: only while the front is at them. */
function crossing(p: Howl, d: number): boolean {
  return d <= p.r && d > p.was - BAND;
}

/** For things that only lie there: the front is on them now, and carries them with it. */
function swept(p: Howl, d: number): boolean {
  return d <= p.r && d > p.was - 0.01;
}

/** How hard the wave still is `d` from the middle: full at the centre, under half at the rim. */
function force(p: Howl, d: number): number {
  return 1 - 0.55 * Math.min(1, d / p.max);
}

/**
 * Turn something in flight round: it leaves along (ux, uy) at least as fast as `min`, keeping
 * whatever speed it had if that was more. False if it was already on its way out.
 */
function turn(v: { vx: number; vy: number }, ux: number, uy: number, min: number): boolean {
  if (v.vx * ux + v.vy * uy > THROWN) return false;
  const s = Math.max(min, Math.hypot(v.vx, v.vy));
  v.vx = ux * s;
  v.vy = uy * s;
  return true;
}

function front(w: World, p: Howl): void {
  const d = p.def;
  const push = d.push ?? 300;
  const lift = d.lift ?? 170;
  const by = w.cars[p.owner] ?? null;
  const shot = (x: number, y: number, z: number, dx: number, dy: number) =>
    w.emit({ t: 'hurl', what: 'shot', x, y, z, dx, dy });

  for (const c of w.cars) {
    if (p.cars.includes(c.index) || Math.abs(c.deck - p.z) > LEVELS) continue;
    const [ux, uy, dist] = out(w, p, c.x, c.y);
    if (!reached(p, dist, c.def.body.halfWidth)) continue;
    p.cars.push(c.index);
    if (c.invuln > 0 && !c.wrecked) continue;
    // (claws that are dug in hold it down: the wave goes over it)
    const k = force(p, dist) * held(w, c);
    c.vx += ux * push * k;
    c.vy += uy * push * k;
    c.vz = Math.max(c.vz, lift * k);
    c.z = Math.max(c.z, c.deck + 0.6);
    c.spin += w.rng.range(-7, 7) * k;
    w.emit({ t: 'hurl', what: 'car', car: c.index, x: c.x, y: c.y, z: c.z, dx: ux, dy: uy });
    if (!c.wrecked && d.damage) damage(w, c, d.damage * k, by && by !== c ? by : null, c.x, c.y);
  }

  for (const b of w.bots) {
    if (!b.alive) continue;
    const [ux, uy, dist] = out(w, p, b.x, b.y);
    if (!reached(p, dist)) continue;
    b.alive = false;
    b.deadT = w.rng.range(b.def.respawn[0], b.def.respawn[1]);
    w.emit({ t: 'smash', bot: b.index, by: p.owner, x: b.x, y: b.y, vx: ux * 150, vy: uy * 150 });
    if (by) {
      by.score += b.def.points;
      by.smashed++;
    }
  }

  for (const q of w.props) {
    if (!q.alive || p.props.includes(q.index)) continue;
    const [ux, uy, dist] = out(w, p, q.x, q.y);
    if (!reached(p, dist, q.def.radius)) continue;
    p.props.push(q.index);
    const k = force(p, dist);
    q.vx += ux * push * 1.15 * k;
    q.vy += uy * push * 1.15 * k;
    // a drum already climbing on its own fire keeps its climb and is only blown sideways
    if (!q.flying) {
      q.vz = Math.max(q.vz, lift * 0.8 * k);
      q.z = Math.max(q.z, 0.5);
    }
    q.spin += w.rng.range(-10, 10);
    w.emit({ t: 'hurl', what: 'prop', x: q.x, y: q.y, z: q.z, dx: ux, dy: uy });
  }

  // in flight: turned round and sent out, and now the howler's own
  for (const r of w.rockets) {
    if (Math.abs(r.z - p.z) > LEVELS) continue;
    const [ux, uy, dist] = out(w, p, r.x, r.y);
    if (!crossing(p, dist)) continue;
    if (r.owner === p.owner && Math.cos(r.h) * ux + Math.sin(r.h) * uy > 0.5) continue;
    r.h = Math.atan2(uy, ux);
    r.v = Math.max(r.v, push);
    r.life = Math.max(r.life, 0.7);
    r.owner = p.owner;
    delete r.target;
    shot(r.x, r.y, r.z + 4, ux, uy);
  }
  const A = w.arms;
  for (const s of A.shells) {
    const [ux, uy, dist] = out(w, p, s.x, s.y);
    if (!crossing(p, dist) || !turn(s, ux, uy, push * 0.6)) continue;
    s.vz = Math.max(s.vz, lift * 0.6);
    s.owner = p.owner;
    shot(s.x, s.y, s.z, ux, uy);
  }
  for (const b of A.balls) {
    const [ux, uy, dist] = out(w, p, b.x, b.y);
    if (!crossing(p, dist) || !turn(b, ux, uy, push)) continue;
    b.owner = p.owner;
    shot(b.x, b.y, 4, ux, uy);
  }
  for (const g of A.gobs) {
    const [ux, uy, dist] = out(w, p, g.x, g.y);
    if (!crossing(p, dist) || !turn(g, ux, uy, push * 0.8)) continue;
    g.owner = p.owner;
  }
  for (const o of A.orbs) {
    if (o.drift <= 0) continue;
    const [ux, uy, dist] = out(w, p, o.x, o.y);
    if (!crossing(p, dist) || !turn(o, ux, uy, push * 0.7)) continue;
    o.owner = p.owner;
    shot(o.x, o.y, 5, ux, uy);
  }
  for (const s of A.stickies) {
    if (s.car >= 0) continue;
    const [ux, uy, dist] = out(w, p, s.x, s.y);
    if (!crossing(p, dist)) continue;
    if (s.flying) {
      if (!turn(s, ux, uy, push)) continue;
      s.flight = Math.max(s.flight, 0.4);
      s.owner = p.owner;
      shot(s.x, s.y, 4, ux, uy);
    } else if (swept(p, dist)) [s.x, s.y] = w.keepInside(p.x + ux * p.r, p.y + uy * p.r, 2);
  }
  for (const e of w.embers) {
    const [ux, uy, dist] = out(w, p, e.x, e.y);
    if (!crossing(p, dist) || e.vx * ux + e.vy * uy > THROWN) continue;
    e.vx += ux * push * 0.6;
    e.vy += uy * push * 0.6;
    e.vz = Math.max(e.vz, lift * 0.4);
  }

  // lying or hanging there: swept along with the front and left at its rim
  for (const m of w.mines) {
    if (Math.abs(m.z - p.z) > LEVELS) continue;
    const [ux, uy, dist] = out(w, p, m.x, m.y);
    if (!swept(p, dist)) continue;
    [m.x, m.y] = w.keepInside(p.x + ux * p.r, p.y + uy * p.r, 3);
    m.owner = p.owner;
  }
  for (const s of w.spikes) {
    const [ux, uy, dist] = out(w, p, s.x, s.y);
    if (!swept(p, dist)) continue;
    [s.x, s.y] = w.keepInside(p.x + ux * p.r, p.y + uy * p.r, 2);
    s.owner = p.owner;
  }
  for (const c of w.clouds) {
    const [ux, uy, dist] = out(w, p, c.x, c.y);
    if (!swept(p, dist)) continue;
    [c.x, c.y] = w.keepInside(p.x + ux * p.r, p.y + uy * p.r, 2);
  }

  // scenery: leaves are torn off, and what is flimsy takes a knock on the side facing the wave
  if (p.z > LEVELS) return;
  for (const s of w.near(p.x, p.y, p.r)) {
    if (s.down || p.statics.includes(s.index)) continue;
    const dist = Math.hypot(s.x - p.x, s.y - p.y);
    if (!reached(p, dist, s.def.radius)) continue;
    p.statics.push(s.index);
    const k = force(p, dist);
    const C = s.def.crown;
    if (C && s.leaves) shed(w, s, k * (1 - C.hold) * 0.8, 'blast', p.x, p.y);
    if (s.hp === undefined) continue;
    const e = Math.min(1, s.def.radius / (dist || 1));
    batter(w, s, 40 * d.power * k, 'blast', s.x + (p.x - s.x) * e, s.y + (p.y - s.y) * e);
  }
}
