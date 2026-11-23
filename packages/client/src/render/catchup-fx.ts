import { DT, type SimEvent } from '@demodogs/shared';
import type { Car, World } from '@demodogs/sim';
import type { Sound } from '../audio/sound';
import type { Art } from './art';
import type { Effects } from './effects';

/**
 * How the catch-up items look and sound (the sim's side is sim/catchup.ts). The cars themselves
 * are drawn bigger, smaller or flattened in stacks.ts; here are the bursts when a car changes
 * size or is driven over, the gale behind a second wind, the dust a swollen car stamps up, and the
 * lead ball a collared car drags on its chain. All single cells, nothing fed back into the sim.
 */

type CatchupEvent = Extract<SimEvent, { t: 'catchup' }>;

/** A lead collar's ball: where it lies, how far it has rolled, and its hop over the ground. */
export interface Ball {
  x: number;
  y: number;
  z: number;
  rot: number;
}

const TAU = Math.PI * 2;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
/** The chain's length from the back bumper to the ball, art px. */
const CHAIN = 9;
const GOLD = [0xfff3b0, 0xffd24a, 0xffa828] as const;
const ICE = [0xd8f4ff, 0x7fd4ff, 0x4a8cff] as const;
const GALE = [0xffffff, 0xd6f3ff, 0xa8e2ff] as const;
const pick = (c: readonly number[]) => c[(Math.random() * c.length) | 0]!;

export class CatchupFx {
  private readonly balls = new Map<number, Ball>();
  private stomp = 0;

  /** The ball car c drags (it starts where the collar was clamped on: just behind the car). */
  ball(c: Car): Ball {
    let b = this.balls.get(c.index);
    if (!b) {
      const d = c.def.body.halfLength * c.size + CHAIN;
      b = { x: c.x - Math.cos(c.h) * d, y: c.y - Math.sin(c.h) * d, z: 0, rot: c.h };
      this.balls.set(c.index, b);
    }
    return b;
  }

  /** A ring of single cells thrown out along the ground from (x, y). */
  private ring(
    fx: Effects,
    x: number,
    y: number,
    z: number,
    r: number,
    n: number,
    col: readonly number[],
  ): void {
    const m = Math.ceil(n * fx.quality);
    for (let i = 0; i < m; i++) {
      const a = (i / m) * TAU + rand(-0.15, 0.15);
      const v = rand(0.6, 1.2) * r * 3;
      fx.emit(
        'spark',
        x + Math.cos(a) * r * 0.3,
        y + Math.sin(a) * r * 0.3,
        z + rand(1, 5),
        Math.cos(a) * v,
        Math.sin(a) * v,
        rand(10, 70),
        rand(0.25, 0.55),
        1,
        pick(col),
      );
    }
  }

  handle(fx: Effects, w: World, e: CatchupEvent, S: Sound, art: Art): void {
    const c = w.cars[e.car]!;
    const mine = c === w.player;
    const v = fx.vol(e.x, e.y);
    switch (e.what) {
      case 'grow':
        // loud on purpose: two rings of gold, a cloud of dust, a flash, and the ground shakes
        this.ring(fx, e.x, e.y, c.z, 26, 110, GOLD);
        this.ring(fx, e.x, e.y, c.z + 6, 14, 60, GOLD);
        for (let i = 0; i < 26; i++) {
          const a = rand(0, TAU);
          fx.puff(e.x, e.y, 1, 'dust', Math.cos(a) * 70, Math.sin(a) * 70);
        }
        fx.flashes.push({ x: e.x, y: e.y, r: 110, life: 0.5, max: 0.5, rgb: 0xffd24a });
        fx.text(e.x, e.y, mine ? 'BIG DOG!' : `${c.name} IS HUGE!`, '#ffd24a', true);
        fx.shake = Math.max(fx.shake, mine ? 10 : 8 * v);
        if (v > 0) {
          S.boing(v);
          S.thud(v);
        }
        break;
      case 'shrink':
        // the bolt is the sim's `arc`; here the car's lost bulk goes off as a shell of cold cells
        this.ring(fx, e.x, e.y, c.z, 20, 90, ICE);
        this.ring(fx, e.x, e.y, c.z + 8, 10, 40, ICE);
        fx.flashes.push({ x: e.x, y: e.y, r: 90, life: 0.45, max: 0.45, rgb: 0x7fd4ff });
        fx.text(e.x, e.y, mine ? 'ZAPPED!' : `${c.name} ZAPPED!`, '#7fd4ff', true);
        fx.shake = Math.max(fx.shake, mine ? 10 : 6 * v);
        break;
      case 'back':
        this.ring(fx, e.x, e.y, c.z, 6, 14, c.size > 1 ? GOLD : ICE);
        if (v > 0) S.pop(v * 0.6);
        break;
      case 'squash': {
        this.ring(fx, e.x, e.y, 0, 24, 90, GOLD);
        for (let i = 0; i < 30; i++) {
          const a = rand(0, TAU);
          fx.puff(e.x, e.y, 1, 'dust', Math.cos(a) * 70, Math.sin(a) * 70);
        }
        fx.flashes.push({ x: e.x, y: e.y, r: 80, life: 0.3, max: 0.3, rgb: 0xfff3b0 });
        fx.text(e.x, e.y, mine ? 'FLATTENED!' : `${c.name} FLATTENED!`, '#ffd24a', true);
        fx.shake = Math.max(fx.shake, mine || e.by === w.player.index ? 12 : 8 * v);
        if (v > 0) {
          S.thud(v);
          S.crash(60 * v);
        }
        break;
      }
      case 'wind':
        this.ring(fx, e.x, e.y, c.z, 22, 80, GALE);
        fx.flashes.push({ x: e.x, y: e.y, r: 80, life: 0.35, max: 0.35, rgb: 0xd6f3ff });
        fx.text(e.x, e.y, mine ? 'SECOND WIND!' : `${c.name}: SECOND WIND!`, '#d6f3ff', true);
        if (v > 0) S.whoosh(v);
        break;
      case 'collar':
        this.balls.delete(e.car);
        for (let i = 0; i < 40; i++) fx.spark(e.x, e.y, 3, 110);
        fx.flashes.push({ x: e.x, y: e.y, r: 70, life: 0.3, max: 0.3, rgb: 0xc9ced8 });
        if (v > 0) S.clang(v);
        fx.text(e.x, e.y, mine ? 'LEAD COLLAR!' : `${c.name} COLLARED!`, '#c9ced8', true);
        if (mine) fx.shake = Math.max(fx.shake, 8);
        break;
      case 'collar-off': {
        // the shackle lets go: the ball tumbles off on its own
        const b = this.balls.get(e.car);
        this.balls.delete(e.car);
        if (b && e.id)
          fx.fling(
            art.prop(e.id),
            b.x,
            b.y,
            b.z + 1,
            c.vx * 0.6 + rand(-25, 25),
            c.vy * 0.6 + rand(-25, 25),
            rand(50, 90),
            b.rot,
            5,
          );
        if (v > 0) S.clang(v * 0.6);
        break;
      }
      case 'bones':
        fx.text(e.x, e.y, mine ? 'LOOK UP!' : 'BONES!', '#f7f1dd', true);
        if (v > 0) S.whoosh(v * 0.6);
        break;
    }
  }

  /** Per tick: the gale, the stamping, the crackle on a shrunk car, and every ball on its chain. */
  step(fx: Effects, w: World): void {
    this.stomp -= DT;
    for (const c of w.cars) {
      if (c.wrecked) {
        this.balls.delete(c.index);
        continue;
      }
      const speed = Math.hypot(c.vx, c.vy);
      const cs = Math.cos(c.h);
      const sn = Math.sin(c.h);
      const L = c.def.body.halfLength * c.size;
      const W = c.def.body.halfWidth * c.size;
      if (c.wind && speed > 20) {
        // speed lines: dashes of bright cells laid along the way it is going, left hanging in
        // the air beside and behind the car as it pulls away from them
        const ux = c.vx / speed;
        const uy = c.vy / speed;
        const n = Math.ceil(5 * fx.quality);
        for (let i = 0; i < n; i++) {
          const o = rand(-W - 6, W + 6);
          const back = rand(-L, L * 2.6);
          const x = c.x - ux * back - uy * o;
          const y = c.y - uy * back + ux * o;
          const z = c.z + rand(1, 8);
          const len = Math.round(rand(7, 18));
          const col = pick(GALE);
          const life = rand(0.14, 0.28);
          for (let q = 0; q < len; q += 0.5)
            fx.emit('spark', x - ux * q, y - uy * q, z, c.vx * 0.25, c.vy * 0.25, 0, life, 1, col);
        }
        if (Math.random() < 0.5)
          fx.puff(c.x - cs * L, c.y - sn * L, 1, 'dust', -c.vx * 0.3, -c.vy * 0.3);
      }
      if (c.squashT > 0.3 && Math.random() < 0.6) {
        // seeing stars: a few of them going round above a flattened car
        const a = w.time * 7 + Math.random() * 0.4 + (Math.random() < 0.5 ? Math.PI : 0);
        fx.emit(
          'spark',
          c.x + Math.cos(a) * 7 * c.size * 1.6,
          c.y + Math.sin(a) * 5 * c.size * 1.6,
          c.z + 7,
          0,
          0,
          8,
          0.2,
          1,
          pick(GOLD),
        );
      }
      if (c.size > 1.3 && speed > 30 && c.z - c.deck < 1) {
        // a swollen car stamps the ground: dust out from under each wheel, a tremor when it is near
        for (const sg of [-1, 1])
          if (Math.random() < 0.5)
            fx.puff(
              c.x - cs * L * 0.6 - sn * W * sg,
              c.y - sn * L * 0.6 + cs * W * sg,
              1,
              'dust',
              sg * -sn * 20,
              sg * cs * 20,
            );
        if (this.stomp <= 0) {
          const v = fx.vol(c.x, c.y);
          if (v > 0.3) {
            fx.shake = Math.max(fx.shake, 2.5 * v);
            this.stomp = 0.22;
          }
        }
      }
      // an aura nobody can miss, the owner or a rival: gold boiling off a swollen car, cold
      // sparks and little bolts crawling round a shrunk one, and each lights the ground under it
      const morph = c.size > 1.3 ? GOLD : c.size < 0.8 ? ICE : null;
      if (morph) {
        const big = c.size > 1;
        const n = Math.ceil((big ? 5 : 3) * fx.quality);
        for (let i = 0; i < n; i++) {
          const a = rand(0, TAU);
          const ex = Math.cos(a) * (L + 3);
          const ey = Math.sin(a) * (W + 3);
          fx.emit(
            'spark',
            c.x + ex * cs - ey * sn,
            c.y + ex * sn + ey * cs,
            c.z + rand(0, big ? 10 : 4),
            c.vx * 0.6,
            c.vy * 0.6,
            rand(30, big ? 110 : 60),
            rand(0.25, 0.5),
            1,
            pick(morph),
          );
        }
        if (Math.floor(w.time * 60) % 6 === 0)
          fx.flashes.push({
            x: c.x,
            y: c.y,
            r: big ? 60 : 34,
            life: 0.14,
            max: 0.14,
            rgb: big ? 0xffc040 : 0x60b8ff,
          });
      }
      if (c.size < 0.8 && Math.random() < 0.25)
        fx.emit(
          'spark',
          c.x + rand(-W, W),
          c.y + rand(-W, W),
          c.z + rand(1, 5),
          0,
          0,
          rand(10, 40),
          rand(0.1, 0.25),
          1,
          pick(ICE),
        );
      if (!c.collar) {
        this.balls.delete(c.index);
        continue;
      }
      // the ball is pulled along at the end of its chain, and skips when the car is quick
      const b = this.ball(c);
      const ax = c.x - cs * L;
      const ay = c.y - sn * L;
      const dx = b.x - ax;
      const dy = b.y - ay;
      const d = Math.hypot(dx, dy) || 1;
      if (d > CHAIN) {
        const nx = ax + (dx / d) * CHAIN;
        const ny = ay + (dy / d) * CHAIN;
        const moved = Math.hypot(nx - b.x, ny - b.y);
        b.rot += moved / 3.3;
        b.x = nx;
        b.y = ny;
        if (moved > 0.8 && Math.random() < 0.5) fx.spark(b.x, b.y, 0.5, 20);
        if (moved > 1.5 && Math.random() < 0.3) fx.puff(b.x, b.y, 0.5, 'dust');
      }
      b.z = c.deck + Math.abs(Math.sin(w.time * 14 + c.index)) * Math.min(2.5, speed * 0.02);
    }
  }
}
