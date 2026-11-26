import {
  BASE_SPEED,
  CAR_OFFSET,
  DT,
  GRAVITY,
  type Controls,
  type PickupManifest,
  type SimEvent,
  type TrickKind,
} from '@demodogs/shared';
import { steerTo } from './ai-kit';
import { odds, place, rivals } from './catchup';
import { damage, explode } from './damage';
import { absorb } from './defence';
import type { Car } from './entities';
import { clamp } from './math';
import { circles, hull } from './physics';
import type { World } from './world';

/**
 * Tricks: the ten toys that come out of a Bag of Tricks crate. Like the catch-up items they go to
 * work the moment they are picked up, the same for a human and for a rival, and each is loud
 * about it:
 *
 * - balloons: every rival ahead is hung from a bunch of balloons and floats, helpless, until they
 *   burst and drop it.
 * - door: the car dives through a dog door and comes out up the road; where there is no road it
 *   comes out right behind the nearest rival, at speed.
 * - dash: the car is a comet for a few seconds. It steers itself down the road (at the nearest
 *   rival where there is none), nothing hurts it, and whatever it strikes is thrown aside.
 * - splat: mud in the face of every rival ahead: a human cannot see for it, an AI driver wanders.
 * - steal: the weapon of the nearest armed rival changes hands (or, if nobody holds one, a
 *   rival's boost and some of its rounds).
 * - dizzy: every rival ahead steers back to front.
 * - pair: the rival in front and the car nearest to it are pulled together like two magnets.
 * - bumper: the car is a pinball bumper: whatever touches it is flung off it.
 * - flop: the car leaps and comes down, as a blast, on the nearest rival.
 * - ghost: the car is a ghost: other cars go through it and nothing hurts it.
 *
 * A trick aimed at a rival is stopped by a shield bubble (it takes a knock) and never lands on a
 * car nothing can hurt just then.
 */

type TrickEvent = Extract<SimEvent, { t: 'trick' }>;

/** A trick at work on a car for a while. `by` is the car that set it off. */
export interface Spell {
  def: PickupManifest;
  t: number;
  by: number;
}

/** What tricks are at work on a car, by kind. */
export interface Tricks {
  /** Hanging from balloons. */
  balloons?: Spell | undefined;
  dash?: Spell | undefined;
  /** Mud in its face. */
  splat?: Spell | undefined;
  dizzy?: Spell | undefined;
  /** Pulled towards car `to`. */
  pair?: (Spell & { to: number }) | undefined;
  bumper?: Spell | undefined;
  /** In the air on a belly flop: `t` counts up from the leap. */
  flop?: Spell | undefined;
  ghost?: Spell | undefined;
}

/** How fast a car is already falling when its balloons burst, art px per second. */
const DROP = 30;
/** How close two hulls must come for a comet or a bumper to strike, beyond touching (art px). */
const STRIKE = 3;
/** A pair further apart than this parts: the pull cannot hold them. */
const PAIR_SNAP = 620;

const secs = (d: PickupManifest, fallback: number) => d.seconds ?? fallback;
const NAME = (d: PickupManifest) => d.meta.name.toUpperCase();
const NOBODY = (d: PickupManifest) => `${NAME(d)}: NOBODY IN REACH`;

function say(
  w: World,
  what: TrickEvent['what'],
  c: Car,
  by: number,
  def: PickupManifest,
  more: Partial<TrickEvent> = {},
): void {
  w.emit({
    t: 'trick',
    kind: def.kind,
    what,
    car: c.index,
    by,
    id: def.id,
    x: c.x,
    y: c.y,
    ...more,
  });
}

/** Can a trick of car `by` land on rival o? A shield takes it, with a knock. */
function lands(w: World, o: Car): boolean {
  if (o.invuln > 0 || o.wrecked) return false;
  if (o.shield > 0) {
    absorb(w, o, 25, o.x, o.y);
    return false;
  }
  return true;
}

/** Is car c a ghost just now (other cars go through it)? */
export function phased(c: Car): boolean {
  return c.tricks.ghost !== undefined;
}

/** The pickup a Bag of Tricks hands car c: one of its `kits`, by their own odds where c is running. */
export function dip(w: World, c: Car, bag: PickupManifest): PickupManifest {
  const all = (bag.kits ?? []).map((id) => w.content.pickup.get(id)!);
  const hurt = c.hp < 70;
  const at = place(w, c);
  const total = all.reduce((s, k) => s + odds(k, hurt, at, w.mode.crates), 0);
  let roll = w.rng.next() * total;
  for (const k of all) {
    roll -= odds(k, hurt, at, w.mode.crates);
    if (roll < 0) return k;
  }
  return all[all.length - 1]!;
}

/** A trick picked up: set it to work and return the words to float, or null if `got` is not one. */
export function fitTrick(w: World, c: Car, got: PickupManifest): string | null {
  const T = c.tricks;
  switch (got.kind as TrickKind) {
    case 'balloons':
    case 'splat':
    case 'dizzy': {
      const kind = got.kind as 'balloons' | 'splat' | 'dizzy';
      let n = 0;
      for (const o of rivals(w, c, got.radius ?? 300)) {
        if (!lands(w, o)) continue;
        const fresh = !o.tricks[kind];
        o.tricks[kind] = { def: got, t: secs(got, 4), by: c.index };
        if (kind === 'balloons') {
          // off the ground at once, so that the road lets go of it
          o.z = Math.max(o.z, o.deck + 1.5);
          o.vz = Math.max(o.vz, 60);
        }
        // mud in an AI driver's eyes: it drives as it does in smoke
        if (kind === 'splat' && o.ai) o.blind = Math.max(o.blind ?? 0, secs(got, 4));
        if (fresh) say(w, 'on', o, c.index, got);
        n++;
      }
      return n ? `${NAME(got)} x${n}` : NOBODY(got);
    }
    case 'door':
      return door(w, c, got);
    case 'dash':
    case 'bumper':
    case 'ghost': {
      const kind = got.kind as 'dash' | 'bumper' | 'ghost';
      const fresh = !T[kind];
      T[kind] = { def: got, t: secs(got, 5), by: c.index };
      // a comet's engine cannot be dead
      if (kind === 'dash') c.stall = 0;
      if (fresh) say(w, 'on', c, c.index, got);
      return `${NAME(got)} ${Math.round(secs(got, 5))}s`;
    }
    case 'steal':
      return steal(w, c, got);
    case 'pair':
      return pair(w, c, got);
    case 'flop': {
      if (T.flop) return NAME(got);
      const up = got.lift ?? 250;
      const air = (2 * up) / (GRAVITY * w.gravity);
      // onto the nearest rival, where it will be when the car comes down
      let best: Car | null = null;
      let bd = got.radius ?? 170;
      for (const o of w.cars) {
        if (o === c || o.wrecked || Math.abs(o.deck - c.deck) > 8) continue;
        const d = Math.hypot(o.x - c.x, o.y - c.y);
        if (d < bd) {
          bd = d;
          best = o;
        }
      }
      if (best) {
        const vx = (best.x + best.vx * air * 0.8 - c.x) / air;
        const vy = (best.y + best.vy * air * 0.8 - c.y) / air;
        const v = Math.hypot(vx, vy) || 1;
        const k = Math.min(1, (BASE_SPEED * 1.5) / v);
        c.vx = vx * k;
        c.vy = vy * k;
      }
      c.z = Math.max(c.z, c.deck + 1);
      c.vz = up;
      c.spin = 0;
      T.flop = { def: got, t: 0, by: c.index };
      say(w, 'on', c, c.index, got);
      return NAME(got);
    }
    default:
      return null;
  }
}

/** Through the dog door: up the road in a race, out behind the nearest rival where there is none. */
function door(w: World, c: Car, got: PickupManifest): string {
  const x = c.x;
  const y = c.y;
  const speed = Math.max(Math.hypot(c.vx, c.vy), 130);
  const T = w.track;
  if (T && w.kind === 'race') {
    // the further back, the further on it comes out
    const far = (got.reach ?? 420) * (0.7 + 0.6 * place(w, c));
    let i = c.idx + Math.max(1, Math.round(far / T.step));
    // (not on top of a car that is already there)
    for (let tries = 0; tries < 8; tries++) {
      const j = i % T.n;
      if (!w.cars.some((o) => o !== c && Math.hypot(o.x - T.x[j]!, o.y - T.y[j]!) < 20)) break;
      i += 2;
    }
    if (i >= T.n) {
      c.lap++;
      if (c.lap === w.laps && c.isPlayer) w.emit({ t: 'final-lap', car: c.index });
    }
    w.placeOnTrack(c, i % T.n, 0);
    c.onIdx = c.idx;
    c.onLap = c.lap;
    c.deck = w.deckAt(c.idx);
  } else {
    let best: Car | null = null;
    let bd = got.radius ?? 500;
    for (const o of w.cars) {
      if (o === c || o.wrecked) continue;
      const d = Math.hypot(o.x - c.x, o.y - c.y);
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    if (!best) return NOBODY(got);
    // behind it if there is room, else whichever side has
    let h = best.h;
    let px = c.x;
    let py = c.y;
    for (const turn of [0, Math.PI / 2, -Math.PI / 2, Math.PI]) {
      h = best.h + turn;
      const back = (hull(best) + hull(c)) * 2 + 8;
      [px, py] = w.keepInside(best.x - Math.cos(h) * back, best.y - Math.sin(h) * back, 8);
      if (w.free(px, py, 8)) break;
    }
    c.x = px;
    c.y = py;
    c.h = h;
    c.deck = best.deck;
  }
  c.vx = Math.cos(c.h) * speed;
  c.vy = Math.sin(c.h) * speed;
  c.vf = speed;
  c.spin = 0;
  c.z = c.deck + 5;
  c.vz = 30;
  c.downT = 0;
  c.invuln = Math.max(c.invuln, 0.8);
  say(w, 'use', c, c.index, got, { x, y, tx: c.x, ty: c.y });
  return NAME(got);
}

/** The nearest armed rival's weapon changes hands; with none armed, a rival's boost and rounds. */
function steal(w: World, c: Car, got: PickupManifest): string {
  const R = got.radius ?? 420;
  const near = w.cars
    .filter((o) => o !== c && !o.wrecked && !o.finished && o.invuln <= 0)
    .map((o) => [o, Math.hypot(o.x - c.x, o.y - c.y)] as const)
    .filter(([, d]) => d < R || (w.kind === 'race' && w.track !== null))
    .sort((a, b) => a[1] - b[1] || a[0].index - b[0].index)
    .map(([o]) => o);
  const o = near.find((o) => o.weapon && o.ammo > 0) ?? near[0];
  if (!o) return NOBODY(got);
  if (o.shield > 0) {
    absorb(w, o, 25, o.x, o.y);
    return `${NAME(got)}: BLOCKED`;
  }
  let label: string;
  if (o.weapon && o.ammo > 0) {
    c.weapon = o.weapon;
    c.ammo = o.ammo;
    label = `${o.weapon.meta.name.toUpperCase()} x${o.ammo}`;
    o.weapon = null;
    o.ammo = 0;
  } else {
    const n = Math.min(o.rounds, Math.round(got.amount ?? 20));
    o.rounds -= n;
    c.rounds += n;
    c.nitro = Math.min(1, c.nitro + o.nitro);
    o.nitro = 0;
    label = n > 0 ? `BOOST + AMMO ${n}` : 'BOOST';
  }
  say(w, 'use', c, c.index, got, { to: o.index, x: o.x, y: o.y, tx: c.x, ty: c.y, label });
  return `STOLE ${label}`;
}

/** The rival in front (or the nearest) and the car nearest to it are pulled together. */
function pair(w: World, c: Car, got: PickupManifest): string {
  const R = got.radius ?? 300;
  const ok = (o: Car) => !o.wrecked && !o.finished && !o.tricks.pair;
  // the one just ahead in a race, the nearest where nobody is ahead
  const cands = rivals(w, c, R)
    .filter(ok)
    .sort(
      (a, b) =>
        Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y) || a.index - b.index,
    );
  for (const a of cands) {
    if (!lands(w, a)) continue;
    // its partner: the nearest other car, another rival before the car that threw this
    let b: Car | null = null;
    let bd = Infinity;
    for (const o of w.cars) {
      if (o === a || !ok(o) || o.invuln > 0 || o.shield > 0) continue;
      const d = Math.hypot(o.x - a.x, o.y - a.y) + (o === c ? R : 0);
      if (d < bd && d < PAIR_SNAP) {
        bd = d;
        b = o;
      }
    }
    if (!b) continue;
    const t = secs(got, 5);
    a.tricks.pair = { def: got, t, by: c.index, to: b.index };
    b.tricks.pair = { def: got, t, by: c.index, to: a.index };
    say(w, 'on', a, c.index, got, { to: b.index, tx: b.x, ty: b.y });
    return b === c ? `${NAME(got)}: ${a.name} + YOU` : `${NAME(got)}: ${a.name} + ${b.name}`;
  }
  return NOBODY(got);
}

/** How near car o's hull is to car c's: the gap between them, and the way from c to o. */
function gap(c: Car, o: Car): [number, number, number] {
  let best = Infinity;
  let nx = 1;
  let ny = 0;
  for (const p of circles(c))
    for (const q of circles(o)) {
      const dx = q[0] - p[0];
      const dy = q[1] - p[1];
      const d = Math.hypot(dx, dy);
      if (d < best) {
        best = d;
        nx = d > 0.001 ? dx / d : 1;
        ny = d > 0.001 ? dy / d : 0;
      }
    }
  return [best - hull(c) - hull(o), nx, ny];
}

/** Car c, a comet or a bumper, throws off every car that has come up against it. */
function strike(w: World, c: Car, S: Spell, lift: number): void {
  const d = S.def;
  for (const o of w.cars) {
    if (o === c || o.wrecked || o.hitCd > 0 || phased(o)) continue;
    if (Math.abs(o.z - c.z) > 10 || Math.abs(o.deck - c.deck) > 8) continue;
    if (Math.abs(o.x - c.x) > 40 * (c.size + o.size)) continue;
    const [far, nx, ny] = gap(c, o);
    if (far > STRIKE) continue;
    const v = d.factor ?? 220;
    o.vx = c.vx * 0.4 + nx * v;
    o.vy = c.vy * 0.4 + ny * v;
    o.vz = Math.max(o.vz, lift);
    o.z = Math.max(o.z, o.deck + 0.5);
    o.spin += w.rng.range(3, 6) * (w.rng.next() < 0.5 ? -1 : 1);
    o.hitCd = 0.4;
    const px = o.x - nx * hull(o);
    const py = o.y - ny * hull(o);
    damage(w, o, d.amount ?? 8, c, px, py);
    say(w, 'use', c, c.index, d, { to: o.index, x: px, y: py });
  }
}

/** What a car under a trick does with its driver's controls. */
export function trickControls(w: World, c: Car, ctl: Controls): Controls {
  const T = c.tricks;
  if (T.dash) {
    // it steers itself: down the road, or at the nearest car where there is no road
    let tx = c.x + Math.cos(c.h) * 60;
    let ty = c.y + Math.sin(c.h) * 60;
    const K = w.track;
    if (K && w.kind === 'race') {
      const i = (c.idx + Math.round((34 + Math.abs(c.vf) * 0.45) / K.step)) % K.n;
      tx = K.x[i]!;
      ty = K.y[i]!;
    } else {
      let bd = Infinity;
      for (const o of w.cars) {
        if (o === c || o.wrecked) continue;
        const d = Math.hypot(o.x - c.x, o.y - c.y);
        if (d < bd) {
          bd = d;
          tx = o.x + o.vx * 0.2;
          ty = o.y + o.vy * 0.2;
        }
      }
    }
    return {
      steer: steerTo(c, tx, ty, 3.2)[0],
      throttle: 1,
      brake: false,
      boost: false,
      fire: ctl.fire,
    };
  }
  if (T.dizzy) return { ...ctl, steer: -ctl.steer };
  return ctl;
}

function end(w: World, c: Car, kind: keyof Tricks): void {
  const S = c.tricks[kind];
  if (!S) return;
  c.tricks[kind] = undefined;
  say(w, 'off', c, S.by, S.def);
}

/** Once a tick, after the catch-up items and before the cars drive. */
export function updateTricks(w: World): void {
  for (const c of w.cars) {
    const T = c.tricks;
    if (c.wrecked) {
      // a wreck is done with all of them (its partner in a pair is let go below)
      for (const k of Object.keys(T) as (keyof Tricks)[]) end(w, c, k);
      continue;
    }
    const B = T.balloons;
    if (B) {
      B.t -= DT;
      if (B.t <= 0) {
        end(w, c, 'balloons');
        // the drop: it comes down hard
        c.vz = Math.min(c.vz, -DROP);
        damage(w, c, B.def.amount ?? 6, w.cars[B.by] ?? null, c.x, c.y);
      } else {
        // held at the height of the string, turning slowly, with the air dragging at it
        const top = c.deck + (B.def.lift ?? 24);
        c.vz = clamp((top - c.z) * 5, -40, 90) + GRAVITY * w.gravity * DT;
        c.z = Math.max(c.z, c.deck + 1.5);
        const f = Math.exp(-1.5 * DT);
        c.vx = c.vx * f + w.wind[0] * 0.2 * DT;
        c.vy = c.vy * f + w.wind[1] * 0.2 * DT;
        c.spin += Math.sin(w.time * 2.3 + c.index * 1.7) * 3 * DT;
      }
    }
    for (const kind of ['splat', 'dizzy'] as const) {
      const S = T[kind];
      if (S && (S.t -= DT) <= 0) end(w, c, kind);
    }
    const D = T.dash;
    if (D) {
      if ((D.t -= DT) <= 0) end(w, c, 'dash');
      else {
        c.invuln = Math.max(c.invuln, 0.1);
        c.stall = 0;
        c.pace *= D.def.pace ?? 1.5;
        strike(w, c, D, 80);
      }
    }
    const M = T.bumper;
    if (M) {
      if ((M.t -= DT) <= 0) end(w, c, 'bumper');
      else strike(w, c, M, 40);
    }
    const G = T.ghost;
    if (G) {
      if ((G.t -= DT) <= 0) end(w, c, 'ghost');
      else c.invuln = Math.max(c.invuln, 0.1);
    }
    const F = T.flop;
    if (F) {
      F.t += DT;
      c.invuln = Math.max(c.invuln, 0.1);
      if (F.t > 0.2 && c.z - c.deck <= 0.6) {
        // down: the blast is the car's own, and it is the one thing that does not feel it
        T.flop = undefined;
        c.invuln = Math.max(c.invuln, 0.6);
        const vx = c.vx * 0.35;
        const vy = c.vy * 0.35;
        const spin = c.spin;
        say(w, 'use', c, c.index, F.def);
        explode(w, c.x, c.y, F.def.factor ?? 1.1, c, c.deck);
        c.vx = vx;
        c.vy = vy;
        c.spin = spin;
        c.vz = 70;
      }
    }
    const P = T.pair;
    if (P) {
      const o = w.cars[P.to]!;
      const dx = o.x - c.x;
      const dy = o.y - c.y;
      const d = Math.hypot(dx, dy) || 1;
      P.t -= DT;
      if (P.t <= 0 || o.wrecked || !o.tricks.pair || d > PAIR_SNAP) {
        end(w, c, 'pair');
        if (o.tricks.pair?.to === c.index) o.tricks.pair = undefined;
      } else if (d > (hull(c) + hull(o)) * 1.2 + CAR_OFFSET) {
        // each is hauled towards the other, wheels on the ground or not
        const a = (P.def.factor ?? 300) * DT;
        c.vx += (dx / d) * a;
        c.vy += (dy / d) * a;
      }
    }
  }
}
