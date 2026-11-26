import { DRIFT, type SimEvent } from '@demodogs/shared';
import type { Car, World } from '@demodogs/sim';
import type { Sound } from '../audio/sound';
import { roll } from './dice';
import type { Effects } from './effects';

/**
 * How a drift looks and sounds (the sim's side is `drive` in sim/physics.ts): the back wheels
 * throw sparks for as long as it is held, pale at first, yellow once it has earned the small
 * burst and blue once it has earned the big one, with a ring and a blip as each stage comes; let
 * go, the car leaves in a flash of that colour and trails it while the burst lasts. Loud on
 * purpose, so a rival's drift is read as easily as one's own. Nothing is fed back into the sim.
 */

type DriftEvent = Extract<SimEvent, { t: 'drift' }>;

const rand = (a: number, b: number) => a + roll() * (b - a);
const pick = (c: readonly number[]) => c[(roll() * c.length) | 0]!;
const PALE = [0xffffff, 0xe8e4da, 0xc9c4b8] as const;
const GOLD = [0xfffbd6, 0xffe98a, 0xffc12e, 0xff8a1c] as const;
const BLUE = [0xffffff, 0xc8f6ff, 0x6fd6ff, 0x32b4f0] as const;
const TONES = [PALE, GOLD, BLUE] as const;
const LIGHT = [0xffffff, 0xffc12e, 0x6fd6ff] as const;

/** Which stage a held drift has come to: 0, 1 or 2. */
export function driftStage(c: Car): number {
  return c.charge >= DRIFT.stage[1] ? 2 : c.charge >= DRIFT.stage[0] ? 1 : 0;
}

export class DriftFx {
  /** The colours each car's burst trails, by index, and the seconds it still has to trail them. */
  private readonly trail = new Map<number, { col: readonly number[]; t: number }>();

  handle(fx: Effects, w: World, e: DriftEvent, S: Sound): void {
    const c = w.cars[e.car];
    if (!c) return;
    const mine = c === w.player;
    const col = TONES[e.stage] ?? GOLD;
    const v = fx.vol(c.x, c.y);
    // a ring of sparks out from under the car, and a light that everyone sees
    const n = Math.round((e.go ? 22 : 12) * Math.max(0.5, fx.quality)) * (e.stage === 2 ? 1.5 : 1);
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(40, e.go ? 120 : 80);
      fx.emit(
        'glitter',
        c.x + Math.cos(a) * 4,
        c.y + Math.sin(a) * 4,
        c.z + rand(1, 4),
        Math.cos(a) * sp + c.vx * 0.5,
        Math.sin(a) * sp + c.vy * 0.5,
        rand(10, 40),
        rand(0.3, 0.6),
        e.stage === 2 ? 2 : 1,
        pick(col),
      );
    }
    fx.flashes.push({
      x: c.x,
      y: c.y,
      r: e.go ? (e.stage === 2 ? 84 : 60) : 34,
      life: e.go ? 0.35 : 0.2,
      max: e.go ? 0.35 : 0.2,
      rgb: LIGHT[e.stage] ?? LIGHT[1],
    });
    if (!e.go) {
      if (v > 0) S.tick(e.stage === 2, mine ? 1 : v * 0.6);
      return;
    }
    this.trail.set(c.index, { col, t: DRIFT.seconds[e.stage - 1] ?? 0.7 });
    const cs = Math.cos(c.h);
    const sn = Math.sin(c.h);
    for (let i = 0; i < 8; i++)
      fx.flame(c.x - cs * 10, c.y - sn * 10, c.z + 3, rand(3, 5), -cs * 60, -sn * 60);
    if (mine) {
      fx.text(
        c.x,
        c.y,
        e.stage === 2 ? 'SUPER DRIFT!' : 'DRIFT!',
        e.stage === 2 ? '#6fd6ff' : '#ffd24a',
      );
      fx.shake = Math.max(fx.shake, e.stage === 2 ? 3 : 2);
      S.surge(e.stage === 2);
    } else if (v > 0) S.whoosh(v * 0.5);
  }

  step(fx: Effects, w: World, dt: number): void {
    for (const c of w.cars) {
      if (c.wrecked) continue;
      const cs = Math.cos(c.h);
      const sn = Math.sin(c.h);
      const back = c.def.body.halfLength * c.size * 0.75;
      const wide = c.def.body.halfWidth * c.size;
      const T = this.trail.get(c.index);
      if (T) {
        // the burst: two streaks of its colour off the tail
        T.t -= dt;
        if (T.t <= 0) this.trail.delete(c.index);
        for (const side of [-1, 1])
          for (let k = 0; k < 2; k++)
            fx.emit(
              'glitter',
              c.x - cs * (back + 3) - sn * side * wide * 0.6,
              c.y - sn * (back + 3) + cs * side * wide * 0.6,
              c.z + rand(1, 4),
              -cs * rand(30, 80),
              -sn * rand(30, 80),
              rand(-5, 15),
              rand(0.3, 0.6),
              roll() < 0.5 ? 2 : 1,
              pick(T.col),
            );
      }
      if (c.drift === 0 || c.z - c.deck > 0.6) continue;
      // held: sparks off both back wheels, thrown out the way the tail is sliding
      const stage = driftStage(c);
      const col = TONES[stage]!;
      const out = -c.drift;
      const many = (stage === 0 ? 1 : stage === 1 ? 2.4 : 3.6) * (0.4 + 0.6 * fx.quality);
      for (const side of [-1, 1]) {
        const x = c.x - cs * back - sn * side * wide;
        const y = c.y - sn * back + cs * side * wide;
        let n = Math.floor(many) + (roll() < many % 1 ? 1 : 0);
        while (n-- > 0)
          fx.emit(
            'glitter',
            x + rand(-1, 1),
            y + rand(-1, 1),
            c.z + rand(0.5, 2),
            -cs * rand(10, 50) - sn * out * rand(20, 70) + c.vx * 0.2,
            -sn * rand(10, 50) + cs * out * rand(20, 70) + c.vy * 0.2,
            rand(15, 45),
            rand(0.25, stage === 0 ? 0.4 : 0.7),
            stage === 0 ? (roll() < 0.4 ? 2 : 1) : roll() < 0.5 ? stage + 1 : stage,
            pick(col),
          );
      }
    }
  }
}
