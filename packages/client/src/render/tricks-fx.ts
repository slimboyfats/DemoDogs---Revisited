import { DT, type SimEvent } from '@demodogs/shared';
import type { Car, World } from '@demodogs/sim';
import type { Sound } from '../audio/sound';
import type { Art } from './art';
import type { Effects } from './effects';
import type { StackSink } from './stacks';

/**
 * How the tricks look and sound (the sim's side is sim/tricks.ts). Each one has a burst the
 * moment it lands and a steady sign for as long as it lasts, both made to be seen at race zoom by
 * the car's driver and by everybody else: fat cells (`glitter` two or three art px across, never
 * single sparks), a flash on the ground, big words, and a thing on the car wherever there is a
 * thing to put there (balloons, a magnet, a dollop of mud, rubber balls going round it).
 * Nothing here is fed back into the sim.
 */

type TrickEvent = Extract<SimEvent, { t: 'trick' }>;

const TAU = Math.PI * 2;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = (c: readonly number[]) => c[(Math.random() * c.length) | 0]!;

const PARTY = [0xff4058, 0x3a96ff, 0xffd428, 0x5fe06a, 0xffffff] as const;
const DOOR = [0xff60ff, 0xd040ff, 0xffd0ff] as const;
const FIRE = [0xfff6c0, 0xffc040, 0xff7a20] as const;
const MUD = [0x4e3317, 0x6e4a24, 0x3a240f, 0x85603a] as const;
const STAR = [0xfff3a0, 0xffd428, 0xffffff] as const;
const RED = [0xff5a4a, 0xff2a2a, 0xffb0a0] as const;
const BLUE = [0x5aa8ff, 0x2a6aff, 0xb0d8ff] as const;
const GHOST = [0xe8fbff, 0xb8ecff, 0x8fd0ff] as const;
const BALL = [0xff4a4a, 0xffffff, 0x3a96ff] as const;

/** The three balloons over a car: where each hangs off its middle, and its colour swap. */
const BUNCH: readonly [number, number, number, Record<string, string> | undefined][] = [
  [-2.6, -2.2, 0, undefined],
  [2.4, -0.6, 2.4, { balloon: 'balloonb' }],
  [-0.4, 2.6, 1.2, { balloon: 'balloony' }],
];
/** How far over a car's roof its balloons ride, at the car's own size (art px). */
const STRING = 14;
/** How much bigger than their art the balloons are drawn: nobody is to miss them. */
const FAT = 1.5;

/** A dog door standing in the world for a moment. */
interface Door {
  x: number;
  y: number;
  z: number;
  h: number;
  t: number;
}
/** A thieving paw in flight: from where it was to the car it is going to. */
interface Paw {
  x: number;
  y: number;
  to: number;
  t: number;
  /** Going out to rob (it turns round for home when it gets there), or coming back with it. */
  home: number;
}
/** A mud pie in flight, from the car that threw it to the car it is going to land on. */
interface Pie {
  from: number;
  to: number;
  /** Where it set off (the thrower may have moved on since). */
  x0: number;
  y0: number;
  z0: number;
  x: number;
  y: number;
  z: number;
  t: number;
  dur: number;
  spin: number;
}
/** A splat of mud on the screen: where (0 to 1 each way), how big, and its ragged edge. */
export interface Splat {
  x: number;
  y: number;
  r: number;
  seed: number;
}

/** One fat cell. */
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
  fat = 2,
): void {
  fx.emit('glitter', x, y, z, vx, vy, vz, life, fat, rgb);
}

/** One solid drop of mud: it is not lit, it falls and it lands. */
function gob(
  fx: Effects,
  x: number,
  y: number,
  z: number,
  vx: number,
  vy: number,
  vz: number,
  life: number,
  size: number,
): void {
  fx.emit('pip', x, y, z, vx, vy, vz, life, size, pick(MUD));
}

/** A ring of fat cells thrown out along the ground from (x, y). */
function ring(
  fx: Effects,
  x: number,
  y: number,
  z: number,
  speed: number,
  n: number,
  col: readonly number[],
  fat = 2,
): void {
  const m = Math.ceil(n * Math.max(0.5, fx.quality));
  for (let i = 0; i < m; i++) {
    const a = (i / m) * TAU + rand(-0.1, 0.1);
    const v = speed * rand(0.7, 1.15);
    dot(
      fx,
      x,
      y,
      z + rand(1, 5),
      Math.cos(a) * v,
      Math.sin(a) * v,
      rand(10, 60),
      rand(0.35, 0.7),
      pick(col),
      fat,
    );
  }
}

/** A burst of fat cells every way, up as well as out. */
function burst(
  fx: Effects,
  x: number,
  y: number,
  z: number,
  speed: number,
  n: number,
  col: readonly number[],
  fat = 2,
): void {
  const m = Math.ceil(n * Math.max(0.5, fx.quality));
  for (let i = 0; i < m; i++) {
    const a = rand(0, TAU);
    const v = speed * rand(0.2, 1);
    dot(
      fx,
      x,
      y,
      z,
      Math.cos(a) * v,
      Math.sin(a) * v,
      rand(20, 140),
      rand(0.4, 0.9),
      pick(col),
      fat,
    );
  }
}

/** A line of cells from a to b for this tick only: a string, a pull. */
function line(
  fx: Effects,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  col: readonly number[],
  jag = 0,
  size = 1,
): void {
  const n = Math.max(2, Math.ceil(Math.hypot(bx - ax, by - ay, bz - az) / (size * 0.9)));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    fx.emit(
      'pip',
      ax + (bx - ax) * t + rand(-jag, jag),
      ay + (by - ay) * t + rand(-jag, jag),
      az + (bz - az) * t,
      0,
      0,
      0,
      0.03,
      size,
      col[i % col.length]!,
    );
  }
}

export class TrickFx {
  readonly doors: Door[] = [];
  readonly paws: Paw[] = [];
  readonly pies: Pie[] = [];
  /** Where each pied car last dropped a spot of mud on the ground. */
  private readonly trail = new Map<number, number>();
  /** Mud on your own screen (the HUD draws it), and how long it has left to run off. */
  readonly splats: Splat[] = [];
  mud = 0;
  /** How long the mud was thrown for. */
  mudFor = 1;
  /** Where each car was heading a tick ago: a door stands the way the car went in. */
  private readonly was = new Map<number, number>();
  private tick = 0;
  private sound: Sound | null = null;

  handle(fx: Effects, w: World, e: TrickEvent, S: Sound, art: Art): void {
    this.sound = S;
    const c = w.cars[e.car]!;
    const mine = c === w.player;
    const v = fx.vol(e.x, e.y);
    const flash = (rgb: number, r = 90, life = 0.4, x = e.x, y = e.y) =>
      fx.flashes.push({ x, y, r, life, max: life, rgb });
    const shake = (own: number, near: number) =>
      (fx.shake = Math.max(fx.shake, mine ? own : near * v));
    switch (e.kind) {
      case 'balloons':
        if (e.what === 'on') {
          ring(fx, e.x, e.y, c.z, 110, 70, PARTY);
          flash(0xff6a78);
          fx.text(e.x, e.y - 12, mine ? 'UP YOU GO!' : `${c.name} FLOATS OFF!`, '#ff6a78', true);
          shake(8, 3);
          if (v > 0) {
            S.boing(v);
            S.squeak(v * 0.8);
          }
        } else {
          // every balloon bursts where it hangs
          const top = c.z + (STRING + 10) * c.size;
          for (const [bx, by] of BUNCH) burst(fx, c.x + bx, c.y + by, top, 150, 26, PARTY, 2.4);
          flash(0xffffff, 70, 0.25);
          fx.text(e.x, e.y, 'POP!', '#ffffff', true);
          if (v > 0) {
            S.pop(v);
            S.pop(v * 0.8);
            S.crackle(v * 0.6);
          }
        }
        break;
      case 'door': {
        // one where it went in, one where it comes out, both lit and both loud
        const h0 = this.was.get(c.index) ?? c.h;
        this.doors.push({ x: e.x, y: e.y, z: 0, h: h0, t: 1.5 });
        if (e.tx !== undefined && e.ty !== undefined) {
          this.doors.push({ x: e.tx, y: e.ty, z: c.deck, h: c.h, t: 1.5 });
          ring(fx, e.tx, e.ty, c.deck, 150, 90, DOOR, 2.4);
          flash(0xf048ff, 130, 0.5, e.tx, e.ty);
          fx.text(e.tx, e.ty, mine ? 'DOG DOOR!' : `${c.name}: DOG DOOR!`, '#ff9aff', true);
        }
        ring(fx, e.x, e.y, 0, 150, 90, DOOR, 2.4);
        flash(0xf048ff, 130, 0.5);
        shake(10, 5);
        if (v > 0 || mine) {
          S.whoosh(Math.max(v, mine ? 1 : 0));
          S.zap(Math.max(v, mine ? 0.8 : 0), true);
        }
        break;
      }
      case 'dash':
        if (e.what === 'on') {
          ring(fx, e.x, e.y, c.z, 160, 100, FIRE, 2.4);
          flash(0xffa030, 130, 0.5);
          fx.text(e.x, e.y - 12, mine ? 'COMET!' : `${c.name}: COMET!`, '#ffc040', true);
          shake(12, 6);
          if (v > 0) {
            S.howl(v);
            S.surge(true);
          }
        } else if (e.what === 'use') {
          burst(fx, e.x, e.y, c.z + 4, 220, 60, FIRE, 2.4);
          flash(0xfff0c0, 100, 0.3);
          fx.text(e.x, e.y, 'WHAM!', '#fff0c0', true);
          fx.shake = Math.max(fx.shake, mine || e.to === w.player.index ? 14 : 8 * v);
          if (v > 0) {
            S.crash(90 * v);
            S.thud(v);
          }
        } else {
          ring(fx, e.x, e.y, c.z, 60, 24, FIRE);
          if (v > 0) S.pop(v * 0.6);
        }
        break;
      case 'splat':
        if (e.what === 'on') {
          // a pie is thrown: it flies over from the car that threw it and lands with the splash
          const from = w.cars[e.by];
          if (from && from !== c) {
            const d = Math.hypot(c.x - from.x, c.y - from.y);
            this.pies.push({
              from: from.index,
              to: c.index,
              x0: from.x,
              y0: from.y,
              z0: from.z + 8,
              x: from.x,
              y: from.y,
              z: from.z + 8,
              t: 0,
              dur: Math.min(0.7, Math.max(0.3, d / 260)),
              spin: rand(-14, 14),
            });
            if (this.pies.filter((q) => q.from === from.index).length === 1) {
              fx.text(
                from.x,
                from.y - 12,
                from === w.player ? 'PIE AWAY!' : `${from.name} THROWS A PIE!`,
                '#e8b878',
                true,
              );
              const u = fx.vol(from.x, from.y);
              if (u > 0) S.whoosh(u);
            }
          } else this.splash(fx, w, c, S);
        } else if (mine) this.mud = Math.min(this.mud, 0.4);
        break;
      case 'steal': {
        // the paw is already at the car it robbed: it shows there, then flies home with the goods
        this.paws.push({ x: e.x, y: e.y, to: e.car, t: 0, home: 0.25 });
        burst(fx, e.x, e.y, 6, 120, 40, STAR, 2);
        flash(0xffd428, 80, 0.35);
        const o = e.to !== undefined ? w.cars[e.to] : undefined;
        const robbed = o === w.player;
        fx.text(
          e.x,
          e.y,
          robbed ? `${c.name} STOLE YOUR ${e.label ?? 'GEAR'}!` : `${e.label ?? 'GEAR'} STOLEN!`,
          '#ffd428',
          true,
        );
        if (robbed) fx.shake = Math.max(fx.shake, 10);
        if (v > 0 || mine || robbed) {
          const k = Math.max(v, mine || robbed ? 1 : 0);
          S.squeak(k);
          S.whistle(0.35, k * 0.8);
        }
        break;
      }
      case 'dizzy':
        if (e.what === 'on') {
          ring(fx, e.x, e.y, c.z + 8, 90, 50, STAR);
          flash(0xffe870, 80, 0.35);
          fx.text(
            e.x,
            e.y,
            mine ? 'DIZZY! STEERING SWAPPED' : `${c.name} IS DIZZY!`,
            '#ffe870',
            true,
          );
          shake(8, 3);
          if (v > 0) S.whistle(0.5, v);
        } else if (v > 0) S.pop(v * 0.5);
        break;
      case 'pair':
        if (e.what === 'on') {
          const o = w.cars[e.to ?? -1];
          for (const k of o ? [c, o] : [c]) {
            ring(fx, k.x, k.y, k.z, 100, 50, k === c ? RED : BLUE);
            fx.flashes.push({
              x: k.x,
              y: k.y,
              r: 90,
              life: 0.4,
              max: 0.4,
              rgb: k === c ? 0xff4a3a : 0x3a8aff,
            });
            fx.text(
              k.x,
              k.y,
              k === w.player ? 'MAGNETISED!' : `${k.name}: MAGNETISED!`,
              k === c ? '#ff8a7a' : '#8ac0ff',
              true,
            );
          }
          if (c === w.player || o === w.player) fx.shake = Math.max(fx.shake, 10);
          if (v > 0) {
            S.clang(v);
            S.zap(v, true);
          }
        } else if (v > 0) S.pop(v * 0.6);
        break;
      case 'bumper':
        if (e.what === 'on') {
          ring(fx, e.x, e.y, c.z, 120, 70, BALL, 2.4);
          flash(0xff6a6a);
          fx.text(e.x, e.y - 12, mine ? 'BOUNCY BALL!' : `${c.name}: BOUNCY!`, '#ff8a8a', true);
          if (v > 0) S.boing(v);
        } else if (e.what === 'use') {
          burst(fx, e.x, e.y, c.z + 4, 200, 50, BALL, 2.6);
          flash(0xffffff, 110, 0.3);
          fx.text(e.x, e.y, 'BOING!', '#ffffff', true);
          fx.shake = Math.max(fx.shake, mine || e.to === w.player.index ? 12 : 7 * v);
          if (v > 0) {
            S.boing(v);
            S.thud(v * 0.7);
          }
        } else if (v > 0) S.pop(v * 0.6);
        break;
      case 'flop':
        if (e.what === 'on') {
          ring(fx, e.x, e.y, c.z, 110, 60, STAR);
          for (let i = 0; i < 20; i++) fx.puff(e.x, e.y, 1, 'dust', rand(-70, 70), rand(-70, 70));
          fx.text(e.x, e.y - 12, mine ? 'BELLY FLOP!' : `${c.name}: BELLY FLOP!`, '#ffe870', true);
          if (v > 0) {
            S.boing(v);
            S.whistle(0.9, v * 0.8);
          }
        } else {
          // (the blast is an `explode` of its own; this is the slap of the car on the ground)
          ring(fx, e.x, e.y, c.z, 220, 110, STAR, 2.6);
          for (let i = 0; i < 40; i++)
            fx.puff(e.x, e.y, 1, 'dust', rand(-110, 110), rand(-110, 110));
          fx.text(e.x, e.y, 'SPLAT!', '#fff0c0', true);
          fx.shake = Math.max(fx.shake, mine ? 16 : 12 * v);
          if (v > 0) S.thud(v);
        }
        break;
      case 'ghost':
        if (e.what === 'on') {
          ring(fx, e.x, e.y, c.z, 100, 70, GHOST, 2.4);
          flash(0xc8f0ff, 110, 0.5);
          fx.text(e.x, e.y - 12, mine ? 'GHOST DOG!' : `${c.name}: GHOST DOG!`, '#d8f6ff', true);
          if (v > 0) {
            S.whistle(0.8, v * 0.7);
            S.howl(v * 0.5);
          }
        } else {
          ring(fx, e.x, e.y, c.z, 60, 30, GHOST);
          if (v > 0) S.pop(v * 0.6);
        }
        break;
    }
    void art;
  }

  /** A pie lands on car c: mud everywhere, and over your screen if c is yours. */
  private splash(fx: Effects, w: World, c: Car, S: Sound): void {
    const mine = c === w.player;
    const v = fx.vol(c.x, c.y);
    // a crown of mud thrown up and out, heavy drops that fall back, and a brown cloud
    const top = c.z + 7 * c.size;
    const m = Math.ceil(70 * Math.max(0.5, fx.quality));
    for (let i = 0; i < m; i++) {
      const a = rand(0, TAU);
      const sp = rand(40, 170);
      gob(
        fx,
        c.x + Math.cos(a) * 3,
        c.y + Math.sin(a) * 3,
        top,
        c.vx * 0.6 + Math.cos(a) * sp,
        c.vy * 0.6 + Math.sin(a) * sp,
        rand(40, 150),
        rand(0.7, 1.3),
        rand(1.2, 2.4),
      );
    }
    for (let i = 0; i < 16; i++) fx.puff(c.x, c.y, 3, 'dust', rand(-70, 70), rand(-70, 70));
    // the mud it threw lands round the car
    const M = w.content.material.get('material.mud');
    if (M)
      for (let i = 0; i < 6; i++)
        fx.pool(M, c.x + rand(-16, 16), c.y + rand(-16, 16), rand(1.5, 3.5));
    fx.flashes.push({ x: c.x, y: c.y, r: 90, life: 0.35, max: 0.35, rgb: 0x9c6c3a });
    fx.text(c.x, c.y - 12, mine ? 'SPLAT! MUD PIE!' : `${c.name} GOT PIED!`, '#e8b878', true);
    fx.shake = Math.max(fx.shake, mine ? 12 : 4 * v);
    if (mine) {
      const secs = c.tricks.splat?.t ?? 4;
      this.mud = this.mudFor = secs;
      this.splats.length = 0;
      // one great splat over the middle of the screen, where the road is, and smaller ones round it
      this.splats.push({ x: rand(0.42, 0.58), y: rand(0.36, 0.5), r: 0.3, seed: rand(0, 100) });
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU + rand(-0.4, 0.4);
        this.splats.push({
          x: 0.5 + Math.cos(a) * rand(0.26, 0.4),
          y: 0.45 + Math.sin(a) * rand(0.25, 0.38),
          r: rand(0.1, 0.17),
          seed: rand(0, 100),
        });
      }
    }
    if (v > 0 || mine) {
      const k = Math.max(v, mine ? 1 : 0);
      S.thud(k);
      S.hiss(k * 0.7, false);
      S.pop(k * 0.8);
    }
  }

  /** Per tick: the steady sign of every trick at work, the doors, and the paws in flight. */
  step(fx: Effects, w: World): void {
    this.tick++;
    const beat = this.tick % 6 === 0;
    const glow = (c: Car, rgb: number, r = 50) => {
      if (beat) fx.flashes.push({ x: c.x, y: c.y, r, life: 0.16, max: 0.16, rgb });
    };
    this.mud = Math.max(0, this.mud - DT);
    for (const c of w.cars) {
      const T = c.tricks;
      const cs = Math.cos(c.h);
      const sn = Math.sin(c.h);
      const L = c.def.body.halfLength * c.size;
      const W = c.def.body.halfWidth * c.size;
      const speed = Math.hypot(c.vx, c.vy);
      if (T.balloons) {
        // the strings, from the roof up to each knot (the balloons themselves are stacks)
        const top = c.z + STRING * c.size;
        for (const [bx, by, bz] of BUNCH)
          line(
            fx,
            c.x,
            c.y,
            c.z + 6 * c.size,
            c.x + bx * FAT * c.size,
            c.y + by * FAT * c.size,
            top + bz * c.size,
            [0xffffff],
            0,
            0.7,
          );
        glow(c, 0xff6a78, 40);
      }
      if (T.dash) {
        // a comet: fire off the tail, a streak of light down each flank, the ground lit under it
        for (let i = 0; i < 5; i++)
          fx.flame(
            c.x - cs * (L + rand(0, 6)) - sn * rand(-W, W),
            c.y - sn * (L + rand(0, 6)) + cs * rand(-W, W),
            c.z + rand(1, 4),
            4.5 * c.size,
            -c.vx * 0.2,
            -c.vy * 0.2,
          );
        const n = Math.ceil(7 * Math.max(0.5, fx.quality));
        for (let i = 0; i < n; i++) {
          const o = (Math.random() < 0.5 ? -1 : 1) * (W + rand(0, 2));
          const back = rand(-L, L);
          dot(
            fx,
            c.x - cs * back - sn * o,
            c.y - sn * back + cs * o,
            c.z + rand(1, 6),
            -c.vx * 0.5,
            -c.vy * 0.5,
            rand(0, 30),
            rand(0.2, 0.45),
            pick(FIRE),
            2.2,
          );
        }
        glow(c, 0xffa030, 70);
        if (speed > 60 && this.tick % 3 === 0) fx.shake = Math.max(fx.shake, 2 * fx.vol(c.x, c.y));
      }
      if (T.splat && speed > 25) {
        // it leaves a trail of brown spots on the road behind it
        const last = this.trail.get(c.index) ?? 0;
        if (w.time - last > 0.09) {
          this.trail.set(c.index, w.time);
          const M = w.content.material.get('material.mud');
          if (M)
            fx.pool(
              M,
              c.x - cs * L * 0.8 + rand(-W, W) * 0.6,
              c.y - sn * L * 0.8 + rand(-W, W) * 0.6,
              rand(1.2, 2.4),
            );
        }
      }
      if (T.splat && this.tick % 2 === 0) {
        // it runs off the car in fat brown drops
        const a = rand(0, TAU);
        gob(
          fx,
          c.x + Math.cos(a) * W,
          c.y + Math.sin(a) * W,
          c.z + 6 * c.size,
          c.vx * 0.5 + Math.cos(a) * 30,
          c.vy * 0.5 + Math.sin(a) * 30,
          rand(10, 40),
          rand(0.5, 0.8),
          rand(1.2, 2),
        );
      }
      if (T.dizzy) {
        // stars going round over its roof, and a slower ring of them wider out
        for (let i = 0; i < 4; i++) {
          const a = w.time * 7 + (i / 4) * TAU;
          dot(
            fx,
            c.x + Math.cos(a) * (W + 3),
            c.y + Math.sin(a) * (W + 1),
            c.z + (11 + Math.sin(a * 2) * 1.5) * c.size,
            c.vx,
            c.vy,
            0,
            0.07,
            STAR[i % 3]!,
            2.6,
          );
        }
        glow(c, 0xffe870, 40);
      }
      const P = T.pair;
      if (P && c.index < P.to) {
        // the pull: a crackling line between the two, red at one end and blue at the other
        const o = w.cars[P.to]!;
        const mx = (c.x + o.x) / 2;
        const my = (c.y + o.y) / 2;
        const mz = (c.z + o.z) / 2 + 6;
        line(fx, c.x, c.y, c.z + 7 * c.size, mx, my, mz, RED, 1.2, 1.4);
        line(fx, mx, my, mz, o.x, o.y, o.z + 7 * o.size, BLUE, 1.2, 1.4);
        if (beat) {
          dot(fx, mx, my, mz, rand(-40, 40), rand(-40, 40), rand(20, 60), 0.4, 0xffffff, 2.4);
          glow(c, 0xff4a3a, 44);
          glow(o, 0x3a8aff, 44);
        }
      }
      if (T.bumper) {
        // a ring of lamps round it, chasing, as on a pinball table
        const n = 12;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU + w.time * 2.5;
          const lit = (i + Math.floor(w.time * 8)) % 3;
          const ex = Math.cos(a) * (L + 6);
          const ey = Math.sin(a) * (W + 6);
          dot(
            fx,
            c.x + ex * cs - ey * sn,
            c.y + ex * sn + ey * cs,
            c.z + 2,
            c.vx,
            c.vy,
            0,
            0.07,
            BALL[lit]!,
            lit === 0 ? 2.6 : 1.8,
          );
        }
        glow(c, 0xff6a6a, 46);
      }
      if (T.flop) {
        // where it is coming down: a ring on the ground under it that tightens as it falls
        const high = Math.max(0, c.z - c.deck);
        const r = 6 + high * 0.35;
        const n = 16;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU + w.time * 3;
          dot(
            fx,
            c.x + Math.cos(a) * r,
            c.y + Math.sin(a) * r,
            c.deck + 0.5,
            c.vx,
            c.vy,
            0,
            0.07,
            i % 2 ? 0xff3a2a : 0xfff0c0,
            2.4,
          );
        }
        if (this.tick % 2 === 0)
          dot(fx, c.x, c.y, c.z, rand(-20, 20), rand(-20, 20), 0, 0.5, pick(STAR), 2);
      }
      if (T.ghost) {
        // wisps that rise off it, and a cold light on the ground it crosses
        const n = Math.ceil(6 * Math.max(0.5, fx.quality));
        for (let i = 0; i < n; i++) {
          const a = rand(0, TAU);
          const ex = Math.cos(a) * (L + 1);
          const ey = Math.sin(a) * (W + 1);
          dot(
            fx,
            c.x + ex * cs - ey * sn,
            c.y + ex * sn + ey * cs,
            c.z + rand(1, 7),
            c.vx * 0.7,
            c.vy * 0.7,
            rand(30, 70),
            rand(0.3, 0.6),
            pick(GHOST),
            2.6,
          );
        }
        glow(c, 0xa8e4ff, 54);
      }
      this.was.set(c.index, c.h);
    }
    for (let i = this.doors.length - 1; i >= 0; i--) {
      const d = this.doors[i]!;
      d.t -= DT;
      if (d.t <= 0) {
        // it folds up in a puff of its own light
        burst(fx, d.x, d.y, d.z + 6, 90, 30, DOOR, 2);
        this.doors.splice(i, 1);
        continue;
      }
      if (this.tick % 2 === 0) {
        // light spilling out of the way through
        const o = rand(-7, 7);
        dot(
          fx,
          d.x - Math.sin(d.h) * o,
          d.y + Math.cos(d.h) * o,
          d.z + rand(1, 11),
          Math.cos(d.h) * rand(-40, 40),
          Math.sin(d.h) * rand(-40, 40),
          rand(0, 30),
          rand(0.3, 0.5),
          pick(DOOR),
          2,
        );
      }
      if (beat) fx.flashes.push({ x: d.x, y: d.y, r: 60, life: 0.16, max: 0.16, rgb: 0xf048ff });
    }
    for (let i = this.pies.length - 1; i >= 0; i--) {
      const p = this.pies[i]!;
      const c = w.cars[p.to]!;
      p.t += DT;
      const k = Math.min(1, p.t / p.dur);
      // it goes where the car is now, high over everything between
      p.x = p.x0 + (c.x - p.x0) * k;
      p.y = p.y0 + (c.y - p.y0) * k;
      p.z = p.z0 + (c.z + 7 - p.z0) * k + Math.sin(k * Math.PI) * 34;
      if (k >= 1) {
        this.pies.splice(i, 1);
        if (!c.wrecked) this.splash(fx, w, c, this.sound!);
        continue;
      }
      // a few drops shaken off it on the way
      if (this.tick % 2 === 0)
        gob(fx, p.x, p.y, p.z - 1, rand(-20, 20), rand(-20, 20), rand(-30, 0), 0.6, 1.6);
    }
    for (let i = this.paws.length - 1; i >= 0; i--) {
      const p = this.paws[i]!;
      const c = w.cars[p.to]!;
      p.t += DT;
      if (p.t < p.home) continue;
      // home at a run, faster the closer it gets, with a tail of gold behind it
      const dx = c.x - p.x;
      const dy = c.y - p.y;
      const d = Math.hypot(dx, dy);
      const v = Math.max(260, d * 6) * DT;
      if (d <= v + 4) {
        burst(fx, c.x, c.y, c.z + 6, 110, 30, STAR, 2);
        fx.flashes.push({ x: c.x, y: c.y, r: 70, life: 0.3, max: 0.3, rgb: 0xffd428 });
        this.paws.splice(i, 1);
        continue;
      }
      p.x += (dx / d) * v;
      p.y += (dy / d) * v;
      dot(fx, p.x, p.y, 10, rand(-15, 15), rand(-15, 15), 0, 0.4, pick(STAR), 2);
    }
  }
}

/**
 * How solid a car under a trick is drawn: a ghost is half there (steadily, not blinking), and a
 * comet or a car in the middle of a belly flop is all there, though nothing can hurt it. Undefined
 * for a car to be drawn the ordinary way.
 */
export function trickAlpha(c: Car): number | undefined {
  const T = c.tricks;
  if (T.ghost) return 0.45;
  if (T.dash || T.flop) return 1;
  return undefined;
}

/**
 * What a trick puts on a car, queued with the car (inside its zoom and its tilt, so it is the
 * car's size and lies as the car lies): balloons over it, a magnet or a dollop of mud on its
 * roof, rubber balls going round it.
 */
export function queueTricks(
  R: StackSink,
  art: Art,
  w: World,
  c: Car,
  alpha: number,
  k: number,
  up: number,
  base: number,
): void {
  const T = c.tricks;
  const D = c.def;
  const cs = Math.cos(c.h) * k;
  const sn = Math.sin(c.h) * k;
  const roof = art.carRoof(D.id);
  const top = base + (0.6 + c.bounce + art.carHeight(D.id, roof, 0)) * up;
  const rx = c.x + cs * roof;
  const ry = c.y + sn * roof;
  if (T.balloons) {
    // three of them over the car, nodding against each other
    const id = T.balloons.def.id;
    R.zoom(k * FAT);
    BUNCH.forEach(([bx, by, bz, swap], i) => {
      const nod = Math.sin(w.time * 3.1 + i * 2.1 + c.index) * 0.7;
      R.stack(
        art.prop(id, swap),
        c.x + (bx * FAT + nod) * k,
        c.y + (by * FAT + Math.cos(w.time * 2.3 + i) * 0.5) * k,
        base + (STRING + bz) * up,
        i * 2.1,
        alpha,
      );
    });
    R.zoom(k);
  }
  if (T.splat) R.stack(art.prop(T.splat.def.id), rx, ry, top - 0.4 * up, c.h, alpha);
  if (T.pair) {
    // the magnet stands off the roof and points at the car it is pulling towards
    const o = w.cars[T.pair.to]!;
    const a = Math.atan2(o.y - c.y, o.x - c.x);
    const hop = Math.abs(Math.sin(w.time * 9 + c.index)) * 1.2;
    R.stack(art.prop(T.pair.def.id), rx, ry, top + (2 + hop) * up, a, alpha);
  }
  if (T.bumper) {
    const ball = art.prop(T.bumper.def.id);
    const L = D.body.halfLength + 5;
    const W = D.body.halfWidth + 5;
    for (let i = 0; i < 3; i++) {
      const a = w.time * 5 + (i / 3) * TAU;
      const ex = Math.cos(a) * L;
      const ey = Math.sin(a) * W;
      R.stack(
        ball,
        c.x + cs * ex - sn * ey,
        c.y + sn * ex + cs * ey,
        base + (1 + Math.abs(Math.sin(w.time * 9 + i * 2)) * 3) * up,
        a * 2,
        alpha,
      );
    }
  }
}

/** The things tricks stand in the world for a moment: dog doors, and thieving paws in flight. */
export function queueTrickThings(R: StackSink, art: Art, w: World, fx: TrickFx): void {
  for (const d of fx.doors) {
    if (!R.visible(d.x, d.y, 14, 18)) continue;
    R.group(d.y);
    // it springs up out of the ground and sinks back into it
    const rise = Math.min(1, (1.5 - d.t) / 0.12, d.t / 0.2);
    R.stack(art.prop('pickup.dog-door'), d.x, d.y, d.z - (1 - rise) * 14, d.h);
  }
  for (const p of fx.pies) {
    if (!R.visible(p.x, p.y, 14, 20 + p.z)) continue;
    R.group(p.y);
    // twice life size and turning over as it flies
    R.zoom(2);
    R.stack(art.prop('pickup.mud-pie', undefined, 1), p.x, p.y, p.z, p.t * p.spin);
    R.zoom(1);
  }
  for (const p of fx.paws) {
    if (!R.visible(p.x, p.y, 14, 20)) continue;
    const c = w.cars[p.to]!;
    R.group(p.y);
    // twice life size, so that nobody misses whose paw it was
    R.zoom(2);
    const out = p.t < p.home;
    const a = Math.atan2(c.y - p.y, c.x - p.x) + (out ? Math.PI : 0);
    R.stack(art.prop('pickup.sticky-paws'), p.x, p.y, 9 + Math.sin(p.t * 20) * 1.5, a);
    R.zoom(1);
  }
}

/** A number from 0 to 1 that is always the same for the same seed and index. */
function hash(seed: number, i: number): number {
  const v = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

/**
 * Mud on the glass. Each splat is a wet blot thrown hard at the screen: a heavy body darker at
 * its edge, tongues of mud sprayed out from it with a drop at the end of each, drops flung
 * further, a wet shine across the top, and runs down from its foot that lengthen and taper as
 * the mud slides. It all slides down the glass as it thins, and is gone in the last moments of
 * its `left` seconds out of `all`.
 */
export function drawMud(
  ctx: CanvasRenderingContext2D,
  splats: readonly Splat[],
  left: number,
  all: number,
  W: number,
  H: number,
): void {
  const gone = 1 - left / all;
  const fade = Math.min(1, left / 0.6);
  const S = Math.min(W, H);
  const DARK = '#2b1a0a';
  const MID = '#4e3317';
  const WET = '#6e4a24';
  ctx.save();
  for (const p of splats) {
    const x = p.x * W;
    const y = p.y * H + gone * gone * H * 0.1;
    const r = p.r * S;
    const h = (i: number) => hash(p.seed, i);
    ctx.globalAlpha = 0.97 * fade;
    // the tongues and the drops flung off (under the body, so that it sits on them)
    ctx.fillStyle = DARK;
    // it hit the glass going one way: most of what sprays out goes on that way, and furthest
    const way = h(7) * TAU;
    const rays = 6 + Math.floor(h(0) * 4);
    for (let i = 0; i < rays; i++) {
      const a = way + (h(i + 1) - 0.5) * (i < rays - 2 ? 2.2 : TAU);
      const on = Math.cos(a - way);
      const len = r * (1 + Math.max(0, on) * 0.55 + h(i + 20) * 0.35);
      const wd = r * (0.1 + h(i + 40) * 0.09);
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const ex = x + ca * len;
      const ey = y + sa * len * 0.92;
      // a tapered tongue from the body out to the drop
      ctx.beginPath();
      ctx.moveTo(x - sa * wd * 2.2, y + ca * wd * 2.2);
      ctx.quadraticCurveTo(x + ca * len * 0.6 - sa * wd, y + sa * len * 0.55 + ca * wd, ex, ey);
      ctx.quadraticCurveTo(
        x + ca * len * 0.6 + sa * wd,
        y + sa * len * 0.55 - ca * wd,
        x + sa * wd * 2.2,
        y - ca * wd * 2.2,
      );
      ctx.fill();
      ctx.beginPath();
      ctx.arc(ex, ey, wd * 1.5, 0, TAU);
      ctx.fill();
      // and a drop or two that flew on past it
      if (h(i + 60) > 0.45 && on > 0) {
        const far = len * (1.2 + h(i + 80) * 0.35);
        ctx.beginPath();
        ctx.arc(x + ca * far, y + sa * far * 0.92, wd * (0.6 + h(i + 90) * 0.7), 0, TAU);
        ctx.fill();
      }
    }
    // the body: dark at its edge, wetter and lighter towards the middle
    const blob = (k: number) => {
      ctx.beginPath();
      const n = 40;
      for (let i = 0; i <= n; i++) {
        const t = (i / n) * TAU;
        const q =
          r *
          k *
          (1 +
            0.13 * Math.sin(t * 3 + p.seed) +
            0.08 * Math.sin(t * 5 + p.seed * 1.7) +
            0.05 * Math.sin(t * 9 + p.seed * 2.9));
        const px = x + Math.cos(t) * q;
        const py = y + Math.sin(t) * q * 0.9;
        if (i) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      }
      ctx.closePath();
    };
    const g = ctx.createRadialGradient(x - r * 0.2, y - r * 0.25, r * 0.1, x, y, r * 1.1);
    g.addColorStop(0, WET);
    g.addColorStop(0.55, MID);
    g.addColorStop(1, DARK);
    ctx.fillStyle = g;
    blob(1);
    ctx.fill();
    // the runs: tapered, a round drop at the foot of each, longer as it slides
    const runs = 2 + Math.floor(h(100) * 3);
    for (let i = 0; i < runs; i++) {
      const dx = x + (h(110 + i) - 0.5) * r * 1.3;
      const wd = r * (0.09 + h(120 + i) * 0.07);
      const len = r * (0.4 + h(130 + i) * 0.7) * (0.35 + gone * 1.9);
      const top = y + r * 0.55;
      const run = ctx.createLinearGradient(dx - wd, 0, dx + wd, 0);
      run.addColorStop(0, DARK);
      run.addColorStop(0.45, WET);
      run.addColorStop(1, DARK);
      ctx.fillStyle = run;
      ctx.beginPath();
      ctx.moveTo(dx - wd * 1.6, top);
      ctx.quadraticCurveTo(dx - wd * 0.7, top + len * 0.6, dx - wd * 0.55, top + len);
      ctx.lineTo(dx + wd * 0.55, top + len);
      ctx.quadraticCurveTo(dx + wd * 0.7, top + len * 0.6, dx + wd * 1.6, top);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(dx, top + len, wd * 1.05, 0, TAU);
      ctx.fill();
      // its shine
      ctx.fillStyle = 'rgba(255,236,200,0.35)';
      ctx.beginPath();
      ctx.arc(dx - wd * 0.35, top + len - wd * 0.3, wd * 0.3, 0, TAU);
      ctx.fill();
    }
    // the wet shine across the top of the body: a soft crescent and a few bright points
    ctx.save();
    blob(0.92);
    ctx.clip();
    const shine = ctx.createRadialGradient(
      x - r * 0.35,
      y - r * 0.45,
      0,
      x - r * 0.35,
      y - r * 0.45,
      r * 0.75,
    );
    shine.addColorStop(0, 'rgba(255,240,215,0.42)');
    shine.addColorStop(0.5, 'rgba(255,240,215,0.12)');
    shine.addColorStop(1, 'rgba(255,240,215,0)');
    ctx.fillStyle = shine;
    ctx.fillRect(x - r * 1.2, y - r * 1.2, r * 2.4, r * 2.4);
    // lumps in it: darker hollows with a light lip above each
    for (let i = 0; i < 5; i++) {
      const lx = x + (h(150 + i) - 0.5) * r * 1.2;
      const ly = y + (h(160 + i) - 0.4) * r * 1.0;
      const lr = r * (0.08 + h(170 + i) * 0.1);
      ctx.fillStyle = 'rgba(30,18,6,0.45)';
      ctx.beginPath();
      ctx.ellipse(lx, ly + lr * 0.25, lr, lr * 0.7, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,236,200,0.28)';
      ctx.beginPath();
      ctx.ellipse(lx - lr * 0.2, ly - lr * 0.45, lr * 0.55, lr * 0.22, -0.3, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = 'rgba(255,248,232,0.85)';
    for (let i = 0; i < 3; i++) {
      ctx.globalAlpha = 0.9 * fade;
      ctx.beginPath();
      ctx.ellipse(
        x - r * (0.3 + h(180 + i) * 0.3),
        y - r * (0.35 + h(190 + i) * 0.25),
        r * 0.05 * (1 + i * 0.4),
        r * 0.03 * (1 + i * 0.4),
        -0.5,
        0,
        TAU,
      );
      ctx.fill();
    }
  }
  ctx.restore();
}
