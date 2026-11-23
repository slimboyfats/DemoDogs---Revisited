import { DT, GUARD_KINDS, type GuardKind, type SimEvent } from '@demodogs/shared';
import type { Car, World } from '@demodogs/sim';
import type { Effects } from './effects';
import type { Sound } from '../audio/sound';

/**
 * How the guards look and sound when they work. The gear itself is stacks on the car (see
 * guard-mounts.ts); everything here is single cells in the mudders way: a tracer and a puff of
 * flak, a leash of sparks between two cars, rings of squeak round a decoy, drips off a wet coat,
 * a hiss of static round a jammed car. The sim reports each use as a `guard` event; what is
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
): void {
  const d = Math.hypot(tx - x, ty - y);
  const n = Math.max(2, Math.ceil(d / 1.6));
  let ox = 0;
  let oy = 0;
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    // a wandering offset, pinned to nothing at both ends
    ox += rand(-jag, jag);
    oy += rand(-jag, jag);
    const pin = Math.sin(k * Math.PI);
    fx.emit(
      'spark',
      x + (tx - x) * k + ox * pin,
      y + (ty - y) * k + oy * pin,
      z + (tz - z) * k,
      rand(-6, 6),
      rand(-6, 6),
      rand(-4, 10),
      life * rand(0.6, 1.2),
      1,
      pick(tones),
    );
  }
}

/** A burst of cells thrown out from a point. */
function spray(
  fx: Effects,
  x: number,
  y: number,
  z: number,
  n: number,
  speed: number,
  tones: readonly number[],
  life = 0.4,
): void {
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU);
    const v = rand(0.3, 1) * speed;
    fx.emit(
      'spark',
      x,
      y,
      z,
      Math.cos(a) * v,
      Math.sin(a) * v,
      rand(10, 80),
      rand(0.5, 1) * life,
      1,
      pick(tones),
    );
  }
}

/** A ring of cells at radius r round (x, y, z), moving outward at `speed`. */
function ring(
  fx: Effects,
  x: number,
  y: number,
  z: number,
  r: number,
  speed: number,
  tones: readonly number[],
  life: number,
): void {
  const n = Math.max(8, Math.round(r * 2.2 * fx.quality));
  const a0 = rand(0, TAU);
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * TAU;
    fx.emit(
      'spark',
      x + Math.cos(a) * r,
      y + Math.sin(a) * r,
      z,
      Math.cos(a) * speed,
      Math.sin(a) * speed,
      0,
      life,
      1,
      pick(tones),
    );
  }
}

const roofOf = (c: Car): number => c.z + c.def.top.z + 2;

export function guardEvent(fx: Effects, w: World, e: GuardEvent, S: Sound): void {
  const c = w.cars[e.car]!;
  const v = fx.vol(e.x, e.y);
  const kind = e.kind as GuardKind;
  if (e.what === 'on') {
    // bolted on: a clang and a few sparks off the fixings
    if (v > 0) S.clang(v * 0.7);
    spray(fx, c.x, c.y, c.z + 5, 10, 60, TRACER, 0.3);
    if (kind === 'soak') {
      // a bucketful over the car
      spray(fx, c.x, c.y, c.z + 8, 40 * fx.quality, 70, WATER, 0.6);
      if (v > 0) S.hiss(v * 0.5);
    }
    return;
  }
  if (e.what === 'off') {
    // spent or run out: the last of it drops away
    for (let i = 0; i < 2; i++) fx.puff(c.x, c.y, c.z + 3, 'dust');
    if (kind === 'pads') spray(fx, c.x, c.y, c.z + 2, 14, 50, BUBBLE, 0.35);
    return;
  }
  const tx = e.tx ?? e.x;
  const ty = e.ty ?? e.y;
  switch (kind) {
    case 'decoy':
      // the tube coughs the ball out
      for (let i = 0; i < 3; i++) fx.puff(tx, ty, c.z + 5, 'smoke', -c.vx * 0.1, -c.vy * 0.1);
      spray(fx, tx, ty, c.z + 5, 8, 50, SQUEAK, 0.3);
      if (v > 0) S.boing(v);
      break;
    case 'flak': {
      fx.guards.point(e.car, Math.atan2(ty - c.y, tx - c.x));
      const z = roofOf(c);
      bolt(fx, c.x, c.y, z, tx, ty, z + 1, TRACER, 0.25, 0.12);
      // what it hit comes apart in the air: a dirty puff and a scatter of hot bits
      fx.flame(tx, ty, z, 4, 0, 0, 10);
      fx.plume(tx, ty, z + 1, 3.5, 0x4a4642, 14);
      for (let i = 0; i < 4; i++) fx.puff(tx, ty, z + rand(0, 3), 'smoke');
      spray(fx, tx, ty, z + 1, 16 * fx.quality + 4, 110, TRACER, 0.45);
      fx.flashes.push({ x: tx, y: ty, r: 16, life: 0.1, max: 0.1, rgb: 0xffe6a0 });
      if (v > 0) {
        S.gun(v);
        S.pop(v);
      }
      break;
    }
    case 'mirror': {
      // a glint where the shot struck the plate, and the shot thrown back off it
      const a = Math.atan2(ty - c.y, tx - c.x);
      for (let i = -3; i <= 3; i++) {
        fx.emit('spark', tx + i * 0.9, ty, c.z + 4, 0, 0, 0, 0.14, 1, 0xffffff);
        fx.emit('spark', tx, ty + i * 0.9, c.z + 4, 0, 0, 0, 0.14, 1, 0xffffff);
      }
      for (let i = 0; i < 8; i++) {
        const q = a + rand(-0.5, 0.5);
        const sp = rand(120, 260);
        fx.emit(
          'spark',
          tx,
          ty,
          c.z + 4,
          Math.cos(q) * sp,
          Math.sin(q) * sp,
          rand(0, 40),
          rand(0.12, 0.3),
          1,
          pick(TRACER),
        );
      }
      fx.flashes.push({ x: tx, y: ty, r: 10, life: 0.08, max: 0.08, rgb: 0xffffff });
      if (v > 0) S.tick(true, v);
      break;
    }
    case 'bond':
      // the blow runs down the leash and lands on whoever is at the other end
      bolt(fx, c.x, c.y, roofOf(c), tx, ty, 5, LEASH, 1.1, 0.22);
      spray(fx, tx, ty, 5, 12, 90, LEASH, 0.35);
      fx.flashes.push({ x: tx, y: ty, r: 14, life: 0.1, max: 0.1, rgb: 0xff6a7a });
      if (v > 0) S.crackle(v);
      break;
    case 'sweep':
      fx.guards.whip(e.car);
      spray(fx, tx, ty, 2, 8, 70, TRACER, 0.3);
      if (v > 0) S.tick(false, v);
      break;
    case 'earth':
      // down the chain and into the dirt behind the car
      bolt(fx, c.x, c.y, roofOf(c), tx, ty, 0.5, EARTH, 0.8, 0.14);
      spray(fx, tx, ty, 0.5, 10, 80, EARTH, 0.3);
      fx.puff(tx, ty, 0.5, 'dust');
      fx.flashes.push({ x: tx, y: ty, r: 12, life: 0.08, max: 0.08, rgb: 0xbfe8ff });
      if (v > 0) S.zap(v * 0.6);
      break;
    case 'anchor': {
      // the claws slam in: dirt thrown up at all four corners
      fx.guards.dig(e.car);
      const cs = Math.cos(c.h);
      const sn = Math.sin(c.h);
      for (const wh of c.def.wheels)
        for (const side of [-1, 1]) {
          const ly = side * (c.def.body.halfWidth + 1.5);
          const x = c.x + cs * wh[0] - sn * ly;
          const y = c.y + sn * wh[0] + cs * ly;
          for (let i = 0; i < 2; i++) fx.puff(x, y, 0.5, 'dust', -sn * side * 20, cs * side * 20);
          spray(fx, x, y, 0.5, 3, 50, [0x9a8460, 0x6e5a40, 0xc8b088], 0.35);
        }
      if (v > 0) S.thud(v);
      break;
    }
    case 'pads':
      // blisters burst where the knock landed
      spray(fx, tx, ty, c.z + 3, 22 * fx.quality + 6, 120, BUBBLE, 0.4);
      fx.flashes.push({ x: tx, y: ty, r: 12, life: 0.08, max: 0.08, rgb: 0xdff2ff });
      if (v > 0) S.pop(v);
      break;
    default:
      break;
  }
}

/** Per tick: what is steady. Squeaking decoys, leashes, dragging chains, drips and static. */
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
    if (due(`d${d.id}`, 0.16)) {
      ring(fx, d.x, d.y, d.z + d.up + 2, 3, 70, SQUEAK, 0.28);
      const v = fx.vol(d.x, d.y);
      if (v > 0) S.squeak(v);
    }
    fx.emit(
      'spark',
      d.x,
      d.y,
      d.z + d.up + 3,
      rand(-20, 20),
      rand(-20, 20),
      50,
      0.3,
      1,
      pick(SQUEAK),
    );
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
    if (g.bond) {
      // a slack leash of dim cells to whoever would take the next blow
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
        const n = Math.ceil(bd / 2.2);
        const z0 = roofOf(c);
        const t = w.time * 9;
        for (let i = 1; i < n; i++) {
          const k = i / n;
          // it sags in the middle, and a brighter knot of charge runs along it to the other car
          const z = z0 + (5 - z0) * k - Math.sin(k * Math.PI) * 3;
          const hot = Math.abs(((k * 3 - t) % 1) + 1) % 1 < 0.18;
          fx.emit(
            'spark',
            c.x + (best.x - c.x) * k + rand(-0.4, 0.4),
            c.y + (best.y - c.y) * k + rand(-0.4, 0.4),
            Math.max(1, z),
            0,
            0,
            0,
            0.04,
            1,
            hot ? 0xffe0e0 : 0xff5a6a,
          );
        }
      }
    }
    if (g.earth && c.z - c.deck < 1 && Math.hypot(c.vx, c.vy) > 50 && Math.random() < 0.3) {
      // the weight on the end of the chain strikes sparks off the road
      const back = hl + 8;
      fx.emit(
        'spark',
        c.x - cs * back + rand(-1, 1),
        c.y - sn * back + rand(-1, 1),
        c.deck + 0.5,
        -c.vx * 0.2 + rand(-30, 30),
        -c.vy * 0.2 + rand(-30, 30),
        rand(20, 60),
        rand(0.15, 0.35),
        1,
        Math.random() < 0.5 ? 0xfff6c0 : 0xffb03a,
      );
    }
    if (g.soak) {
      // water runs off it all the way round
      const n = Math.max(1, Math.round(3 * fx.quality));
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
      // the sprinkler on the tank throws a fine fan forward
      const sx = c.x + cs * (hl - 4.4);
      const sy = c.y + sn * (hl - 4.4);
      const a = c.h + rand(-1.3, 1.3);
      fx.emit(
        'spark',
        sx,
        sy,
        c.z + 9,
        c.vx + Math.cos(a) * 45,
        c.vy + Math.sin(a) * 45,
        rand(30, 60),
        rand(0.3, 0.55),
        1,
        pick(WATER),
      );
    }
    if (g.jam) {
      // static: cells that blink on and off anywhere round the car, and a ring off the dish
      const n = Math.max(2, Math.round(7 * fx.quality));
      for (let i = 0; i < n; i++)
        fx.emit(
          'spark',
          c.x + rand(-hl - 5, hl + 5),
          c.y + rand(-hw - 6, hw + 6),
          c.z + rand(1, 12),
          c.vx,
          c.vy,
          0,
          rand(0.03, 0.09),
          1,
          pick(STATIC),
        );
      if (due(`j${c.index}`, 0.45)) ring(fx, c.x, c.y, roofOf(c) + 3, 4, 85, STATIC, 0.3);
    }
    if (g.mirror && Math.random() < 0.12) {
      // a glint running along a plate
      const lx = rand(-4, 4);
      const ly = (Math.random() < 0.5 ? -1 : 1) * (hw + 0.8);
      fx.emit(
        'spark',
        c.x + cs * lx - sn * ly,
        c.y + sn * lx + cs * ly,
        c.z + rand(2, 4.5),
        c.vx,
        c.vy,
        0,
        0.1,
        1,
        0xffffff,
      );
    }
  }
}
