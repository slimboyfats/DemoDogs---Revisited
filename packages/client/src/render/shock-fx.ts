import type { SimEvent } from '@demodogs/shared';
import type { World } from '@demodogs/sim';
import type { Sound } from '../audio/sound';
import type { Flash } from './effects';
import { SKind, Sparks } from './pixel/sparks';

type ShockEvent = Extract<SimEvent, { t: 'pulse' | 'arc' | 'stall' }>;

const TAU = Math.PI * 2;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const BLUE = 0x6fb8ff;

/**
 * How shocks look and sound. The sim reports a pulse going out, each bolt that jumps and each
 * engine that dies; the spreading ring itself is read from `world.pulses` every tick and laid
 * down as a crackling band of cells, and a car with a dead engine is read from its `stall` and
 * fizzes until it runs again.
 */
export class ShockFx {
  readonly sparks = new Sparks(9000);

  constructor(
    private readonly w: World,
    private readonly flashes: Flash[],
    private readonly sound: Sound,
    private readonly vol: (x: number, y: number) => number,
    private readonly shake: (amount: number) => void,
  ) {}

  handle(e: ShockEvent): void {
    const w = this.w;
    switch (e.t) {
      case 'pulse': {
        const c = w.cars[e.car]!;
        this.flashes.push({ x: e.x, y: e.y, r: e.r * 1.4, life: 0.3, max: 0.3, rgb: BLUE });
        // the car throws its charge: a burst of bolts off the body
        for (let i = 0; i < 6; i++) {
          const a = rand(0, TAU);
          const d = rand(10, 18);
          this.sparks.bolt(c.x, c.y, c.z + 6, c.x + Math.cos(a) * d, c.y + Math.sin(a) * d, 1);
        }
        this.sparks.shower(c.x, c.y, c.z + 6, 24, 110);
        if (c === w.player) this.shake(3);
        const v = this.vol(e.x, e.y);
        if (v > 0) this.sound.zap(v, true);
        break;
      }
      case 'arc': {
        this.sparks.bolt(e.x, e.y, e.z, e.tx, e.ty, e.tz);
        // a second, thinner bolt alongside flickers in a moment later
        this.sparks.bolt(e.x, e.y, e.z, e.tx, e.ty, e.tz, 0.1, false);
        this.sparks.shower(e.tx, e.ty, e.tz, 8, 80);
        this.flashes.push({ x: e.tx, y: e.ty, r: 26, life: 0.12, max: 0.12, rgb: BLUE });
        const v = this.vol(e.tx, e.ty);
        if (v > 0) this.sound.zap(v * 0.7, false);
        break;
      }
      case 'stall': {
        const c = w.cars[e.car]!;
        this.sparks.shower(c.x, c.y, c.z + 5, 14, 60);
        if (c === w.player) this.shake(4);
        break;
      }
    }
  }

  /** Per tick: the rings crackle as they spread, dead engines fizz, and every cell ages. */
  step(dt: number): void {
    const w = this.w;
    for (const p of w.pulses) {
      // a band of cells round the ring's edge, thickest at the front of the wave
      const n = Math.ceil(p.r * 2.2);
      for (let i = 0; i < n; i++) {
        const a = rand(0, TAU);
        const r = p.r - rand(0, 4) * rand(0, 1);
        this.sparks.add(
          SKind.Bolt,
          p.x + Math.cos(a) * r,
          p.y + Math.sin(a) * r,
          rand(0, 2.5),
          0,
          0,
          0,
          rand(0.06, 0.16),
        );
      }
      // short crooked licks along the edge
      for (let k = 0; k < 4; k++) {
        const a = rand(0, TAU);
        const b = a + rand(0.12, 0.3);
        this.sparks.bolt(
          p.x + Math.cos(a) * p.r,
          p.y + Math.sin(a) * p.r,
          1,
          p.x + Math.cos(b) * p.r,
          p.y + Math.sin(b) * p.r,
          1,
          0.1,
          false,
        );
      }
    }
    for (const c of w.cars) {
      if (!c.stall || c.wrecked) continue;
      if (Math.random() < 0.45) {
        // a lick of charge crawling over the body
        const a = rand(0, TAU);
        const b = a + rand(1, 2.5);
        const L = c.def.body.halfLength * c.size;
        const W = c.def.body.halfWidth * c.size;
        const z = c.z + rand(3, 7);
        const cs = Math.cos(c.h);
        const sn = Math.sin(c.h);
        const ax = Math.cos(a) * L * 0.8;
        const ay = Math.sin(a) * W;
        const bx = Math.cos(b) * L * 0.8;
        const by = Math.sin(b) * W;
        this.sparks.bolt(
          c.x + ax * cs - ay * sn,
          c.y + ax * sn + ay * cs,
          z,
          c.x + bx * cs - by * sn,
          c.y + bx * sn + by * cs,
          z,
          0.08,
          false,
        );
      }
      if (Math.random() < 0.3) this.sparks.shower(c.x, c.y, c.z + 6, 1, 50);
    }
    this.sparks.step(dt);
  }
}
