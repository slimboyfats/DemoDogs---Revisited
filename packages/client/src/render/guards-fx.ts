import { DT, GUARD_KINDS, type GuardKind, type SimEvent } from '@demodogs/shared';
import type { Car, World } from '@demodogs/sim';
import type { Effects } from './effects';
import type { Sound } from '../audio/sound';

/**
 * How the guards look and sound when they work. The gear itself is stacks on the car (see
 * guard-mounts.ts); everything here is cells in the mudders way: a tracer from the flak turret, a
 * leash of sparks between two cars, rings of squeak round a decoy, drips off a wet coat, a hiss
 * of static round a jammed car. The cells are fat ones (`dot`), not single sparks: a spark is one
 * screen cell, too fine to tell a guarded car from a bare one at race zoom. Every guard has a
 * steady sign in its own colour that both its owner and a rival can read, and a loud moment when
 * it works. The sim reports each use as a `guard` event; what is
 * steady (a leash, a wet coat, a whistle) is read off `car.guards` every tick.
 */
type GuardEvent = Extract<SimEvent, { t: 'guard' }>;

const TAU = Math.PI * 2;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(a: readonly T[]): T => a[(Math.random() * a.length) | 0]!;

const TRACER = [0xfff6c0, 0xffd060, 0xffffff] as const;
const LEASH = [0xff4a5a, 0xff8a8a, 0xffd0d0] as const;
const EARTH = [0xbfe8ff, 0x8ad0ff, 0xffffff] as const;
const WATER = [0x4a9adf, 0x7cc4ff, 0xb9e4ff] as const;
const STATIC = [0x7ff0ff, 0xe6ffff, 0x9aa6b0, 0xffffff] as const;
const SQUEAK = [0xff5b9a, 0xffa0c8, 0xfff2ae] as const;
const BUBBLE = [0xb9dcf2, 0xffffff, 0xdff2ff] as const;
const CHROME = [0xffffff, 0xd8f4ff, 0xa8e0ff] as const;
const DIRT = [0x9a8460, 0x6e5a40, 0xc8b088] as const;
const CLAW = [0xffb03a, 0xffd890, 0xff8a2a] as const;

/** Each guard's own colour: its steady sign, and the burst when it is bolted on. */
const TONES: Record<GuardKind, readonly number[]> = {
  decoy: SQUEAK,
  flak: TRACER,
  mirror: CHROME,
  bond: LEASH,
  sweep: TRACER,
  earth: EARTH,
  anchor: CLAW,
  soak: WATER,
  jam: STATIC,
  pads: BUBBLE,
};
const LIGHT: Record<GuardKind, number> = {
  decoy: 0xff5b9a,
  flak: 0xffd060,
  mirror: 0xffffff,
  bond: 0xff4a5a,
  sweep: 0xffd060,
  earth: 0x8ad0ff,
  anchor: 0xffb03a,
  soak: 0x4a9adf,
  jam: 0x7ff0ff,
  pads: 0xdff2ff,
};

/** What the mounts need to know from one frame to the next: where a turret points, what twitched. */
export class GuardState {
  private readonly aims = new Map<number, { a: number; t: number }>();
  private readonly twitches = new Map<number, number>();
  private readonly bites = new Map<number, number>();
  /** Seconds until each car's (or decoy's) next ring of cells, by a key. */
  readonly rings = new Map<string, number>();

  /** Which way a car's turret points: at what it last shot for a moment, then forward again. */
  aim(c: Car): number {
    const s = this.aims.get(c.index);
    return s && s.t > 0 ? s.a : c.h;
  }
  /** How hard a car's feelers are whipping, 0 to 1. */
  twitch(c: Car): number {
    return Math.min(1, (this.twitches.get(c.index) ?? 0) / 0.3);
  }
  /** How far down a car's claws are, 0 (riding clear) to 1 (in the ground). */
  bite(c: Car): number {
    return Math.min(1, (this.bites.get(c.index) ?? 0) / 0.15);
  }

  point(car: number, a: number): void {
    this.aims.set(car, { a, t: 0.6 });
  }
  whip(car: number): void {
    this.twitches.set(car, 0.3);
  }
  dig(car: number): void {
    this.bites.set(car, 0.7);
  }

  step(): void {
    for (const s of this.aims.values()) s.t -= DT;
    for (const [k, v] of this.twitches) this.twitches.set(k, Math.max(0, v - DT));
    for (const [k, v] of this.bites) this.bites.set(k, Math.max(0, v - DT));
  }
}

/**
 * One fat cell: `fat` art px across where a spark is a single screen cell. It brakes in the air
 * and strobes as it goes out (the engine's `glitter`), so a line of them crackles.
 */
function dot(
  fx: Effects,
  x: number,
  y: number,
  z: number,
  vx: number,
  vy: number,
  vz: number,
  life: number,
  rgb: number,
  fat = 1,
): void {
  fx.emit('glitter', x, y, z, vx, vy, vz, life, fat, rgb);
}

/** A line of cells from (x, y, z) to (tx, ty, tz), each a little off the line: a bolt or a tracer. */
function bolt(
  fx: Effects,
  x: number,
  y: number,
  z: number,
  tx: number,
  ty: number,
  tz: number,
  tones: readonly number[],
  jag: number,
  life: number,
  fat = 1,
): void {
  const d = Math.hypot(tx - x, ty - y);
  const n = Math.max(2, Math.ceil(d / 1.4));
  let ox = 0;
  let oy = 0;
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    // a wandering offset, pinned to nothing at both ends
    ox += rand(-jag, jag);
    oy += rand(-jag, jag);
    const pin = Math.sin(k * Math.PI);
    dot(
      fx,
      x + (tx - x) * k + ox * pin,
      y + (ty - y) * k + oy * pin,
      z + (tz - z) * k,
      rand(-6, 6),
      rand(-6, 6),
      rand(-4, 10),
      life * rand(0.6, 1.2),
      pick(tones),
      fat,
    );
  }
}

/** A burst of cells thrown out from a point; they fly about `reach` before they stop. */
function spray(
  fx: Effects,
  x: number,
  y: number,
  z: number,
  n: number,
  reach: number,
  tones: readonly number[],
  life = 0.4,
  fat = 1,
): void {
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU);
    const v = rand(0.3, 1) * reach * 4.5;
    dot(
      fx,
      x,
      y,
      z,
      Math.cos(a) * v,
      Math.sin(a) * v,
      rand(10, 80),
      rand(0.5, 1) * life,
      pick(tones),
      fat,
    );
  }
}

/** A ring of cells at radius r round (x, y, z), that opens out by about `grow` before it fades. */
function ring(
  fx: Effects,
  x: number,
  y: number,
  z: number,
  r: number,
  grow: number,
  tones: readonly number[],
  life: number,
  fat = 1,
): void {
  const n = Math.max(10, Math.round((r + grow * 0.5) * 2.4 * fx.quality));
  const a0 = rand(0, TAU);
  const v = grow * 4.5;
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * TAU;
    dot(
      fx,
      x + Math.cos(a) * r,
      y + Math.sin(a) * r,
      z,
      Math.cos(a) * v,
      Math.sin(a) * v,
      0,
      life,
      pick(tones),
      fat,
    );
  }
}

/**
 * The car's outline in cells, `out` clear of the body, lit all at once: the whole coat flashes.
 * `ends` lights only the nose and the tail.
 */
function rim(
  fx: Effects,
  c: Car,
  tones: readonly number[],
  z: number,
  life: number,
  out = 1.5,
  ends = false,
): void {
  const hl = c.def.body.halfLength + out;
  const hw = c.def.body.halfWidth + out;
  const cs = Math.cos(c.h);
  const sn = Math.sin(c.h);
  const at = (lx: number, ly: number): void =>
    dot(fx, c.x + cs * lx - sn * ly, c.y + sn * lx + cs * ly, z, c.vx, c.vy, 0, life, pick(tones));
  for (let ly = -hw; ly <= hw; ly += 1.3) {
    at(-hl, ly);
    at(hl, ly);
  }
  if (ends) return;
  for (let lx = -hl; lx <= hl; lx += 1.3) {
    at(lx, -hw);
    at(lx, hw);
  }
}

const roofOf = (c: Car): number => c.z + c.def.top.z + 2;

export function guardEvent(fx: Effects, w: World, e: GuardEvent, S: Sound): void {
  const c = w.cars[e.car]!;
  const v = fx.vol(e.x, e.y);
  const kind = e.kind as GuardKind;
  const tones = TONES[kind] ?? TRACER;
  const light = (x: number, y: number, r: number, life = 0.14): void => {
    fx.flashes.push({ x, y, r, life, max: life, rgb: LIGHT[kind] ?? 0xffffff });
  };
  if (e.what === 'on') {
    // bolted on: a clang, and the car lights up in the guard's own colour
    if (v > 0) S.clang(v * 0.7);
    ring(fx, c.x, c.y, c.z + 5, 5, 22, tones, 0.45, 2);
    rim(fx, c, tones, c.z + 4, 0.35);
    light(c.x, c.y, 40, 0.25);
    if (kind === 'soak') {
      // a bucketful over the car
      spray(fx, c.x, c.y, c.z + 8, 40 * fx.quality, 16, WATER, 0.6);
      if (v > 0) S.hiss(v * 0.5);
    }
    return;
  }
  if (e.what === 'off') {
    // spent or run out: the last of it drops away, and the colour goes out with a blink
    for (let i = 0; i < 4; i++) fx.puff(c.x, c.y, c.z + 3, 'dust');
    rim(fx, c, tones, c.z + 4, 0.2);
    if (kind === 'pads') spray(fx, c.x, c.y, c.z + 2, 20, 14, BUBBLE, 0.35, 2);
    return;
  }
  const tx = e.tx ?? e.x;
  const ty = e.ty ?? e.y;
  switch (kind) {
    case 'decoy':
      // the tube coughs the ball out
      for (let i = 0; i < 6; i++) fx.puff(tx, ty, c.z + 5, 'smoke', -c.vx * 0.1, -c.vy * 0.1);
      spray(fx, tx, ty, c.z + 5, 20, 16, SQUEAK, 0.4, 2);
      ring(fx, tx, ty, c.z + 5, 3, 16, SQUEAK, 0.35);
      light(tx, ty, 36);
      if (v > 0) S.boing(v);
      break;
    case 'flak': {
      fx.guards.point(e.car, Math.atan2(ty - c.y, tx - c.x));
      const z = roofOf(c);
      // a burst of tracer up the line, and a muzzle flash on the roof
      bolt(fx, c.x, c.y, z, tx, ty, z + 6, TRACER, 0.2, 0.16, 2);
      bolt(fx, c.x, c.y, z, tx, ty, z + 6, TRACER, 0.6, 0.12);
      spray(fx, c.x, c.y, z + 1, 8, 6, TRACER, 0.15, 2);
      light(c.x, c.y, 30, 0.1);
      // what it hit goes off in the air (the blast is the sim's own): hot bits fly from it
      spray(fx, tx, ty, z + 6, 24 * fx.quality + 6, 26, TRACER, 0.5, 2);
      if (v > 0) S.gun(v);
      break;
    }
    case 'mirror': {
      // a big four-point glint where the shot struck the plate, and the whole coat flares
      for (let i = -6; i <= 6; i++) {
        const f = Math.abs(i) < 3 ? 2 : 1;
        dot(fx, tx + i, ty, c.z + 5, 0, 0, 0, 0.22, 0xffffff, f);
        dot(fx, tx, ty + i, c.z + 5, 0, 0, 0, 0.22, 0xffffff, f);
      }
      rim(fx, c, CHROME, c.z + 4, 0.2);
      spray(fx, tx, ty, c.z + 5, 12, 12, CHROME, 0.3);
      // the shot goes back down its own line to whoever fired it
      const to = e.to === undefined ? undefined : w.cars[e.to];
      if (to) {
        bolt(fx, tx, ty, c.z + 5, to.x, to.y, to.z + 5, CHROME, 0.25, 0.22, 2);
        spray(fx, to.x, to.y, to.z + 5, 10, 10, CHROME, 0.3, 2);
        fx.flashes.push({ x: to.x, y: to.y, r: 24, life: 0.12, max: 0.12, rgb: 0xffffff });
      }
      light(tx, ty, 40);
      if (v > 0) {
        S.tick(true, v);
        S.clang(v * 0.4);
      }
      break;
    }
    case 'bond':
      // the blow runs down the leash and lands on whoever is at the other end
      bolt(fx, c.x, c.y, roofOf(c), tx, ty, 5, LEASH, 1.1, 0.28, 2);
      bolt(fx, c.x, c.y, roofOf(c), tx, ty, 5, LEASH, 2, 0.2);
      spray(fx, tx, ty, 5, 24, 18, LEASH, 0.4, 2);
      ring(fx, tx, ty, 5, 4, 14, LEASH, 0.3);
      rim(fx, c, LEASH, c.z + 4, 0.2);
      light(tx, ty, 40);
      light(c.x, c.y, 30);
      if (v > 0) S.crackle(v);
      break;
    case 'sweep': {
      // the feeler whips out to what it found
      fx.guards.whip(e.car);
      const nx = c.x + Math.cos(c.h) * (c.def.body.halfLength + 8);
      const ny = c.y + Math.sin(c.h) * (c.def.body.halfLength + 8);
      bolt(fx, nx, ny, c.z + 2, tx, ty, 1, TRACER, 0.5, 0.2, 2);
      spray(fx, tx, ty, 2, 18, 12, TRACER, 0.35, 2);
      ring(fx, tx, ty, 1, 2, 10, TRACER, 0.3);
      light(tx, ty, 30);
      if (v > 0) S.tick(false, v);
      break;
    }
    case 'earth':
      // down the chain and into the dirt behind the car, where it spreads out and is gone
      bolt(fx, c.x, c.y, roofOf(c), tx, ty, 0.5, EARTH, 0.8, 0.22, 2);
      bolt(fx, c.x, c.y, roofOf(c), tx, ty, 0.5, EARTH, 1.8, 0.16);
      spray(fx, tx, ty, 0.5, 20, 16, EARTH, 0.35, 2);
      ring(fx, tx, ty, 0.5, 3, 24, EARTH, 0.4);
      rim(fx, c, EARTH, c.z + 4, 0.2);
      for (let i = 0; i < 3; i++) fx.puff(tx, ty, 0.5, 'dust');
      light(tx, ty, 40);
      if (v > 0) S.zap(v * 0.6);
      break;
    case 'anchor': {
      // the claws slam in: dirt thrown up at all four corners, and the ground jumps round the car
      fx.guards.dig(e.car);
      const cs = Math.cos(c.h);
      const sn = Math.sin(c.h);
      for (const wh of c.def.wheels)
        for (const side of [-1, 1]) {
          const ly = side * (c.def.body.halfWidth + 1.5);
          const x = c.x + cs * wh[0] - sn * ly;
          const y = c.y + sn * wh[0] + cs * ly;
          for (let i = 0; i < 4; i++) fx.puff(x, y, 0.5, 'dust', -sn * side * 30, cs * side * 30);
          spray(fx, x, y, 0.5, 6, 9, DIRT, 0.45, 2);
          spray(fx, x, y, 1, 4, 6, CLAW, 0.25);
        }
      ring(fx, c.x, c.y, 0.5, c.def.body.halfLength + 2, 12, DIRT, 0.4, 2);
      rim(fx, c, CLAW, c.z + 2, 0.25);
      light(c.x, c.y, 36);
      if (v > 0) S.thud(v);
      break;
    }
    case 'pads':
      // blisters burst where the knock landed
      spray(fx, tx, ty, c.z + 3, 30 * fx.quality + 10, 20, BUBBLE, 0.45, 2);
      ring(fx, tx, ty, c.z + 3, 2, 14, BUBBLE, 0.3);
      rim(fx, c, BUBBLE, c.z + 3, 0.2, 2, true);
      light(tx, ty, 34);
      if (v > 0) S.pop(v);
      break;
    default:
      break;
  }
}

/**
 * Per tick: what is steady. Each guard a car carries shows in its own colour, on and round the
 * car, so that the owner knows what it has and a rival knows what not to try.
 */
export function guardTick(fx: Effects, w: World, S: Sound): void {
  const G = fx.guards;
  G.step();
  const due = (key: string, every: number): boolean => {
    const t = (G.rings.get(key) ?? 0) - DT;
    G.rings.set(key, t <= 0 ? every : t);
    return t <= 0;
  };
  for (const d of w.decoys) {
    // it squeals: rings of cells going out, so you can see what the rocket hears
    if (due(`d${d.id}`, 0.14)) {
      ring(fx, d.x, d.y, d.z + d.up + 2, 3, 20, SQUEAK, 0.32, 2);
      fx.flashes.push({ x: d.x, y: d.y, r: 26, life: 0.1, max: 0.1, rgb: 0xff5b9a });
      const v = fx.vol(d.x, d.y);
      if (v > 0) S.squeak(v);
    }
    dot(fx, d.x, d.y, d.z + d.up + 3, rand(-60, 60), rand(-60, 60), 50, 0.3, pick(SQUEAK), 2);
  }
  for (const c of w.cars) {
    if (c.wrecked) continue;
    let any = false;
    for (const k of GUARD_KINDS) if (c.guards[k]) any = true;
    if (!any) continue;
    const g = c.guards;
    const cs = Math.cos(c.h);
    const sn = Math.sin(c.h);
    const hl = c.def.body.halfLength;
    const hw = c.def.body.halfWidth;
    /** A cell that rides with the car at (lx, ly) in the car's own frame. */
    const on = (lx: number, ly: number, z: number, life: number, rgb: number, fat = 1): void =>
      dot(fx, c.x + cs * lx - sn * ly, c.y + sn * lx + cs * ly, z, c.vx, c.vy, 0, life, rgb, fat);
    const key = (k: string): string => `${k}${c.index}`;
    if (g.decoy && (w.time * 2 + c.index * 0.3) % 1 < 0.5) {
      // the rack on the boot winks pink, half a second on and half off: loaded
      for (let i = -1; i <= 1; i++) on(-hl + 2.8, i * 1.8, roofOf(c) + 1, 0.04, pick(SQUEAK), 2);
      for (let i = -2; i <= 2; i++) on(-hl - 1.5, i * 1.6, c.z + 3, 0.04, pick(SQUEAK));
    }
    if (g.flak) {
      // the turret's sweep: a short beam going round and round off the roof
      const a = w.time * 6 + c.index;
      for (let r = 4; r <= 20; r += 1.4)
        dot(
          fx,
          c.x + Math.cos(a) * r,
          c.y + Math.sin(a) * r,
          roofOf(c),
          c.vx,
          c.vy,
          0,
          0.05,
          r > 16 ? 0xffffff : 0xffd060,
        );
    }
    if (g.bond) {
      // a leash of cells to whoever would take the next blow
      let best: Car | null = null;
      let bd = g.bond.def.reach ?? 90;
      for (const o of w.cars) {
        if (o === c || o.wrecked) continue;
        const dd = Math.hypot(o.x - c.x, o.y - c.y);
        if (dd < bd) {
          bd = dd;
          best = o;
        }
      }
      if (best) {
        const n = Math.ceil(bd / 1.3);
        const z0 = roofOf(c);
        const t = w.time * 9;
        for (let i = 1; i < n; i++) {
          const k = i / n;
          // it sags in the middle, and a brighter knot of charge runs along it to the other car
          const z = z0 + (5 - z0) * k - Math.sin(k * Math.PI) * 3;
          const hot = Math.abs(((k * 3 - t) % 1) + 1) % 1 < 0.18;
          dot(
            fx,
            c.x + (best.x - c.x) * k + rand(-0.4, 0.4),
            c.y + (best.y - c.y) * k + rand(-0.4, 0.4),
            Math.max(1, z),
            0,
            0,
            0,
            hot ? 0.09 : 0.05,
            hot ? 0xffffff : 0xff4a5a,
            hot ? 2 : 1,
          );
        }
        // and a collar of the same red round each end of it
        if (due(key('b'), 0.4)) {
          ring(fx, c.x, c.y, c.z + 3, hl + 1, 2, LEASH, 0.18);
          ring(fx, best.x, best.y, best.z + 3, best.def.body.halfLength + 1, 2, LEASH, 0.18);
        }
      }
    }
    if (g.sweep && due(key('s'), 0.4)) {
      // the feelers feel ahead: a fan of cells going out in front, as far as they reach
      const reach = g.sweep.def.reach ?? 34;
      const v = (reach - hl - 6) * 4.5;
      for (let a = -1; a <= 1.01; a += 0.125) {
        const q = c.h + a;
        dot(
          fx,
          c.x + Math.cos(q) * (hl + 6),
          c.y + Math.sin(q) * (hl + 6),
          c.z + 1.5,
          c.vx + Math.cos(q) * v,
          c.vy + Math.sin(q) * v,
          0,
          0.36,
          pick(TRACER),
        );
      }
    }
    if (g.earth) {
      if (c.z - c.deck < 1 && Math.hypot(c.vx, c.vy) > 50) {
        // the weight on the end of the chain strikes sparks off the road
        const back = hl + 8;
        for (let i = 0; i < 2; i++)
          dot(
            fx,
            c.x - cs * back + rand(-1, 1),
            c.y - sn * back + rand(-1, 1),
            c.deck + 0.5,
            -c.vx * 0.4 + rand(-90, 90),
            -c.vy * 0.4 + rand(-90, 90),
            rand(20, 60),
            rand(0.15, 0.35),
            Math.random() < 0.5 ? 0xfff6c0 : 0xffb03a,
          );
      }
      // a little charge always creeping down the chain to ground
      if (due(key('e'), 0.35)) {
        bolt(
          fx,
          c.x - cs * hl,
          c.y - sn * hl,
          c.z + 3,
          c.x - cs * (hl + 8),
          c.y - sn * (hl + 8),
          c.deck + 0.5,
          EARTH,
          0.5,
          0.18,
          2,
        );
        ring(fx, c.x - cs * (hl + 8), c.y - sn * (hl + 8), c.deck + 0.5, 1, 7, EARTH, 0.25);
      }
    }
    if (g.anchor && due(key('a'), 0.45)) {
      // the claw tips glint at all four corners
      for (const wh of c.def.wheels)
        for (const side of [-1, 1])
          on(wh[0] * 0.92, side * (hw + 1.6), c.z + 2, 0.18, pick(CLAW), 2);
    }
    if (g.soak) {
      // water runs off it all the way round
      const n = Math.max(2, Math.round(6 * fx.quality));
      for (let i = 0; i < n; i++) {
        const lx = rand(-hl, hl);
        const ly = (Math.random() < 0.5 ? -1 : 1) * rand(hw - 1, hw + 0.5);
        fx.emit(
          'spark',
          c.x + cs * lx - sn * ly,
          c.y + sn * lx + cs * ly,
          c.z + rand(2, 6),
          c.vx * 0.6 + rand(-8, 8),
          c.vy * 0.6 + rand(-8, 8),
          rand(-5, 15),
          rand(0.25, 0.5),
          1,
          pick(WATER),
        );
      }
      // the sprinkler on the tank throws a fan of fat drops forward
      const sx = c.x + cs * (hl - 4.4);
      const sy = c.y + sn * (hl - 4.4);
      for (let i = 0; i < 2; i++) {
        const a = c.h + rand(-1.3, 1.3);
        dot(
          fx,
          sx,
          sy,
          c.z + 9,
          c.vx + Math.cos(a) * 110,
          c.vy + Math.sin(a) * 110,
          rand(30, 60),
          rand(0.3, 0.55),
          pick(WATER),
          1,
        );
      }
      // and the wet coat itself shows: a blue line round the car that comes and goes
      if (due(key('w'), 0.5)) rim(fx, c, WATER, c.z + 2, 0.22, 1);
    }
    if (g.jam) {
      // static: cells that blink on and off anywhere round the car, and rings off the dish
      const n = Math.max(3, Math.round(10 * fx.quality));
      for (let i = 0; i < n; i++)
        on(
          rand(-hl - 6, hl + 6),
          rand(-hw - 7, hw + 7),
          c.z + rand(1, 12),
          rand(0.03, 0.09),
          pick(STATIC),
          Math.random() < 0.3 ? 2 : 1,
        );
      if (due(key('j'), 0.3)) ring(fx, c.x, c.y, roofOf(c) + 3, 4, 22, STATIC, 0.34);
    }
    if (g.mirror) {
      // a bar of light sliding down the car from nose to tail, over and over
      const k = (w.time * 1.6 + c.index * 0.37) % 1;
      const lx = hl + 1 - k * (2 * hl + 2);
      for (let ly = -hw - 1; ly <= hw + 1; ly += 0.6)
        on(lx, ly, roofOf(c) - 1, 0.05, Math.abs(ly) > hw ? 0xa8e0ff : 0xffffff);
      // stars that wink on the plates
      if (Math.random() < 0.35) {
        const sx = rand(-hl, hl);
        const sy = (Math.random() < 0.5 ? -1 : 1) * (hw + 0.8);
        for (let i = -2; i <= 2; i++) {
          on(sx + i, sy, c.z + 4, 0.12, 0xffffff, i ? 1 : 2);
          on(sx, sy + i, c.z + 4, 0.12, 0xffffff, 1);
        }
      }
      // and the whole coat flashes its outline
      if (due(key('m'), 0.55)) rim(fx, c, CHROME, c.z + 3, 0.14);
    }
    if (g.pads && (w.time * 2 + c.index * 0.3) % 1 < 0.5) {
      // the blisters on both bumpers catch the light, half a second on and half off
      rim(fx, c, BUBBLE, c.z + 3, 0.04, 2.2, true);
    }
  }
}
