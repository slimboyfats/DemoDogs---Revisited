import { DT } from '@demodogs/shared';
import type { Critter, StaticProp, World } from '@demodogs/sim';
import type { Sound } from '../audio/sound';
import type { Art } from './art';
import { roll } from './dice';
import type { Effects } from './effects';
import type { Strip } from './stack';

/**
 * What goes on round a race that is no part of it: smoke out of a chimney and a locomotive's
 * funnel, a sprinkler's jets and a fountain (a prop's `spout`), balloons tethered over the
 * roadside (`float`), birds, planes and airships that cross the sky (a venue's `flyby`), and
 * paper in the air over the line each time a lap is done. All of it is for show: it reads the
 * world and its clock and feeds nothing back, so no two screens need agree about it.
 */

const TAU = Math.PI * 2;
const rand = (a: number, b: number): number => a + roll() * (b - a);

/** How far from the car on screen a spout still runs, art px. */
const SPOUT_NEAR = 330;
/** Paper colours. */
const PAPER = [0xff4d5e, 0xffd23f, 0x3fd0ff, 0x6fe36b, 0xffffff, 0xff8ad8, 0xff9a3c] as const;
const WATER = [0xffffff, 0xd8f4ff, 0x8fdcff, 0x4fb8ea] as const;
const SMOKE = [0x6f6b66, 0x8a8680, 0xa9a59e] as const;
const STEAM = [0xf4f8fa, 0xdfe8ec, 0xc6d4da] as const;
const pick = (c: readonly number[]): number => c[Math.floor(roll() * c.length)]!;

/** Something crossing the sky. */
interface Flier {
  prop: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  high: number;
  flock: number;
  /** Seconds left before it is forgotten. */
  life: number;
  /** Its own beat, so no two flocks flap in step. */
  ph: number;
}

/** What the sky draws into: the two calls of a `StackSink` it needs. */
interface Sky {
  visible(x: number, y: number, rad: number, ht?: number): boolean;
  group(y: number): void;
  stack(s: Strip, x: number, y: number, z: number, rot: number, alpha?: number): void;
}

/** Where a floating thing is now: how far off its spot, and how high. */
export function floating(s: StaticProp, time: number, out: [number, number, number]): void {
  const F = s.def.float!;
  const ph = s.seed * 2.3;
  out[0] = Math.sin(time * 0.23 + ph) * F.drift;
  out[1] = Math.cos(time * 0.17 + ph * 1.7) * F.drift * 0.6;
  out[2] = F.high + Math.sin(time * 0.7 + ph) * 2.5;
}

export class Ambient {
  private spouts: (StaticProp | Critter)[] = [];
  private counted = -1;
  /** Drops owed by each spout: what its rate has earned and not yet let go. */
  private readonly owed = new WeakMap<object, number>();
  readonly fliers: Flier[] = [];
  /** Seconds until each kind of flyby next sets out. */
  private readonly due: number[] = [];
  /** The lap each car was last seen on. */
  private readonly laps: number[] = [];
  /** Which travellers were away when last looked at, to hear one set out. */
  private readonly away = new WeakMap<Critter, boolean>();
  private hoot = 0;

  /** Everything with a spout, found again when scenery has been added. */
  private gather(w: World): void {
    if (this.counted === w.statics.length + w.critters.length) return;
    this.counted = w.statics.length + w.critters.length;
    this.spouts = [];
    for (const s of w.statics) if (s.def.spout) this.spouts.push(s);
    for (const k of w.critters) if (k.def.spout) this.spouts.push(k);
  }

  /** Once a tick: `fx`, `fy` is the middle of what is on screen. */
  step(w: World, fx: Effects, sound: Sound, x: number, y: number): void {
    this.gather(w);
    const q = Math.max(0.35, fx.quality);
    for (const s of this.spouts) {
      if (Math.abs(s.x - x) > SPOUT_NEAR || Math.abs(s.y - y) > SPOUT_NEAR * 0.7) continue;
      if ((s as StaticProp).down || (s as Critter).gone) continue;
      this.spout(w, fx, s, q);
    }
    this.sky(w, x, y, sound, fx);
    this.line(w, fx, sound);
    this.whistle(w, sound, x, y);
  }

  private spout(w: World, fx: Effects, s: StaticProp | Critter, q: number): void {
    const P = s.def.spout!;
    const rot = 'rot' in s ? s.rot : s.h;
    const c = Math.cos(rot);
    const sn = Math.sin(rot);
    const x = s.x + c * P.at[0] - sn * P.at[1];
    const y = s.y + sn * P.at[0] + c * P.at[1];
    const z = P.at[2] + ('z' in s ? s.z : 0);
    let n = (this.owed.get(s) ?? 0) + P.rate * DT * q;
    const seed = 'seed' in s ? s.seed : s.index;
    switch (P.what) {
      case 'smoke':
      case 'steam':
        for (; n >= 1; n--)
          fx.plume(
            x + rand(-0.6, 0.6),
            y + rand(-0.6, 0.6),
            z,
            1.6,
            pick(P.what === 'smoke' ? SMOKE : STEAM),
            rand(18, 30),
          );
        break;
      case 'water':
        for (; n >= 1; n--) {
          const a = rand(0, TAU);
          const v = rand(5, 17);
          const up = rand(74, 96);
          fx.emit(
            'pip',
            x,
            y,
            z,
            Math.cos(a) * v,
            Math.sin(a) * v,
            up,
            (up + Math.sqrt(up * up + 600 * z)) / 300,
            roll() < 0.4 ? 2 : 1.5,
            pick(WATER),
          );
        }
        break;
      case 'jets': {
        const a = rot + w.time * P.spin + seed;
        for (; n >= 1; n--) {
          const k = roll() < 0.5 ? 1 : -1;
          const b = a + rand(-0.07, 0.07);
          const v = rand(62, 84) * k;
          const up = rand(46, 60);
          fx.emit(
            'pip',
            x,
            y,
            z,
            Math.cos(b) * v,
            Math.sin(b) * v,
            up,
            (up + Math.sqrt(up * up + 600 * z)) / 300,
            roll() < 0.4 ? 2 : 1.5,
            pick(WATER),
          );
        }
        break;
      }
      case 'sparks': {
        // a welder: a second of work, then a look at it
        const on = (w.time * 0.45 + seed * 0.37) % 1 < 0.42;
        if (!on) n = 0;
        for (; n >= 1; n--) fx.spark(x, y, z, 70);
        break;
      }
    }
    this.owed.set(s, n);
  }

  /** Send the venue's flybys across the picture, each in its turn, and move those on the way. */
  private sky(w: World, x: number, y: number, sound: Sound, fx: Effects): void {
    const list = w.venue.flyby;
    for (let i = this.fliers.length - 1; i >= 0; i--) {
      const f = this.fliers[i]!;
      f.x += f.vx * DT;
      f.y += f.vy * DT;
      if ((f.life -= DT) <= 0) this.fliers.splice(i, 1);
    }
    if (!list || w.phase === 'over') return;
    list.forEach((F, i) => {
      // (the first of each comes early, at its own moment, so a race opens with something up)
      this.due[i] ??= F.every * (0.12 + 0.3 * ((i * 0.618) % 1));
      if ((this.due[i] -= DT) > 0) return;
      this.due[i] = F.every * rand(0.75, 1.3);
      // across the picture from one side to the other, a little aslant, passing near its middle
      const a = (roll() < 0.5 ? 0 : Math.PI) + rand(-0.45, 0.45);
      const far = 330;
      const off = rand(-70, 70);
      const vx = Math.cos(a) * F.speed;
      const vy = Math.sin(a) * F.speed;
      // (it aims at where the car on screen will be when it gets there)
      const P = w.player;
      const t = far / F.speed;
      const cx = x + P.vx * t * 0.6;
      const cy = y + P.vy * t * 0.6;
      this.fliers.push({
        prop: F.prop,
        x: cx - Math.cos(a) * far - Math.sin(a) * off,
        y: cy - Math.sin(a) * far + Math.cos(a) * off + F.high * 0.5,
        vx,
        vy,
        high: F.high,
        flock: F.flock,
        life: (far * 2.4) / F.speed,
        ph: rand(0, 9),
      });
      if (F.flock === 1 && fx.quality > 0) sound.flyover(0.5);
    });
  }

  /** Paper over the line each time the car on screen starts a lap, and when anyone finishes. */
  private line(w: World, fx: Effects, sound: Sound): void {
    const T = w.track;
    if (!T) return;
    for (const c of w.cars) {
      const was = this.laps[c.index];
      this.laps[c.index] = c.lap;
      if (was === undefined || c.lap <= was || c.lap < 1) continue;
      if (c !== w.player && !c.finished) continue;
      if (Math.hypot(T.x[0]! - w.player.x, T.y[0]! - w.player.y) > 420) continue;
      const a = T.a[0]!;
      const nx = -Math.sin(a);
      const ny = Math.cos(a);
      const half = w.road / 2 + 6;
      const n = Math.round(110 * Math.max(0.4, fx.quality));
      for (const side of [-1, 1])
        for (let i = 0; i < n; i++) {
          // two cannons, one each side of the road, firing up and in over it
          const v = rand(30, 110);
          const b = rand(-0.5, 0.5);
          fx.emit(
            'paper',
            T.x[0]! + nx * half * side + Math.cos(a) * rand(-3, 3),
            T.y[0]! + ny * half * side + Math.sin(a) * rand(-3, 3),
            rand(6, 12),
            -nx * side * v * Math.cos(b) + Math.cos(a) * v * Math.sin(b) + c.vx * 0.25,
            -ny * side * v * Math.cos(b) + Math.sin(a) * v * Math.sin(b) + c.vy * 0.25,
            rand(90, 190),
            rand(2.2, 3.6),
            roll() < 0.4 ? 3 : 2,
            pick(PAPER),
          );
        }
      if (fx.vol(T.x[0]!, T.y[0]!) > 0) sound.pop(0.8);
    }
  }

  /** A heavy traveller that sets out within earshot is heard: a locomotive whistles, a tram rings. */
  private whistle(w: World, sound: Sound, x: number, y: number): void {
    if (this.hoot > 0) this.hoot -= DT;
    for (const k of w.critters) {
      if (!k.trek || k.trek.i !== 0) continue;
      const was = this.away.get(k) ?? true;
      const now = !!k.gone || (k.vx === 0 && k.vy === 0);
      this.away.set(k, now);
      if (!was || now || this.hoot > 0) continue;
      const d = Math.hypot(k.x - x, k.y - y);
      const cry = k.def.critter!.cry;
      if (d > 520 || (cry !== 'toot' && cry !== 'honk')) continue;
      this.hoot = 2;
      sound.cry(cry, Math.max(0.25, 1 - d / 520));
    }
  }

  /** The sky's traffic, into the stacks: each thing at its height, a flock in a V behind its leader. */
  queue(R: Sky, art: Art, w: World): void {
    // (while a race is got ready everything is "in view": every kind is drawn once, far off, so
    // that none of them is built or packed for the first time when it flies over)
    const list = w.venue.flyby;
    if (list && R.visible(-1e7, -1e7, 0))
      for (const F of list)
        for (let p = 0; p < art.poses(F.prop); p++)
          R.stack(art.prop(F.prop, undefined, p), -1e5, -1e5, 0, 0);
    for (const f of this.fliers) {
      const h = Math.atan2(f.vy, f.vx);
      const n = art.poses(f.prop);
      for (let i = 0; i < f.flock; i++) {
        // a V: each bird behind and out to one side of the one before it
        const row = (i + 1) >> 1;
        const side = i & 1 ? 1 : -1;
        const bx = f.x - Math.cos(h) * row * 9 - Math.sin(h) * side * row * 7;
        const by = f.y - Math.sin(h) * row * 9 + Math.cos(h) * side * row * 7;
        const z = f.high + Math.sin(w.time * 1.3 + f.ph + i) * 2;
        if (!R.visible(bx, by, 30, z + 30)) continue;
        R.group(by + 60);
        // (a bird's poses are standing, wings up, wings down; a machine has the one)
        const pose = n >= 3 ? 1 + (Math.floor(w.time * 7 + f.ph + i * 0.6) & 1) : 0;
        R.stack(art.prop(f.prop, undefined, pose), bx, by, z, h);
      }
    }
  }

  /** Their shadows, on the ground under them: how a thing in the sky is seen to be passing over. */
  shadows(
    shadow: (x: number, y: number, rx: number, ry: number, rot: number, a: number) => void,
    art: Art,
  ): void {
    for (const f of this.fliers) {
      const st = art.prop(f.prop);
      const h = Math.atan2(f.vy, f.vx);
      const rx = (st.cw / st.res) * 0.4;
      const ry = (st.ch / st.res) * 0.36;
      for (let i = 0; i < f.flock; i++) {
        const row = (i + 1) >> 1;
        const side = i & 1 ? 1 : -1;
        shadow(
          f.x - Math.cos(h) * row * 9 - Math.sin(h) * side * row * 7 + f.high * 0.25,
          f.y - Math.sin(h) * row * 9 + Math.cos(h) * side * row * 7 + f.high * 0.2,
          rx,
          ry,
          h,
          0.2,
        );
      }
    }
  }
}
