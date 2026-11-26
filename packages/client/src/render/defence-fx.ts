import { DT, type SimEvent } from '@demodogs/shared';
import type { Car, World } from '@demodogs/sim';
import {
  DOME,
  drawBubble,
  SHIELD_HOT,
  SHIELD_RGB,
  type BubbleHit,
  type BubbleShape,
} from './pixel/bubble';
import type { FxKind, Put } from './pixel/particles';
import type { Strip } from './stack';
import { pixels } from './strips';
import { weldPlan, weldSome, type Layout } from './weld';

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const WELD_RGB = [0xffffff, 0xd8f4ff, 0x9ad8ff, 0xfff2b0] as const;

/** What the shield and welder effects need from the rest of the effects. */
export interface DefenceHost {
  readonly w: World;
  readonly bodies: Strip[];
  readonly changed: Set<Strip>;
  readonly flashes: { x: number; y: number; r: number; life: number; max: number; rgb: number }[];
  freshBody(c: Car): Strip;
  particle(
    kind: FxKind,
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    life: number,
    size: number,
    rgb: number,
  ): void;
  pop(x: number, y: number): void;
}

interface Welding {
  plan: Int32Array;
  /** How many of the plan are done, and the armour the car had when it was drawn up. */
  done: number;
  hp0: number;
}

/**
 * The shield bubble and the field welder, drawn: the bubble's crackling cage of cells, the ring
 * of light where a blow lands on it and the shower of shards when it bursts; and the welder's
 * voxels going back into the dents with a spit of sparks from each bead.
 */
export class DefenceFx {
  private readonly hits = new Map<number, BubbleHit[]>();
  private readonly welds = new Map<number, Welding>();

  constructor(private readonly h: DefenceHost) {}

  /** The bubble round a car: along it, across it and up. */
  private shape(c: Car): BubbleShape {
    const k = c.size;
    return {
      rx: (c.def.body.halfLength + 5) * k,
      ry: (c.def.body.halfWidth + 6) * k,
      rz: 10 * k,
      h: c.h,
    };
  }

  handle(e: SimEvent): void {
    const w = this.h.w;
    if (e.t === 'hit' || e.t === 'respawn' || e.t === 'wreck') {
      // the body changed under the welder: draw the plan up again
      this.welds.delete(e.car);
      return;
    }
    if (e.t === 'weld') {
      const c = w.cars[e.car]!;
      if (e.what === 'part') this.sputter(c, 18, 7);
      if (e.what === 'done') this.welds.delete(e.car);
      return;
    }
    if (e.t !== 'shield') return;
    const c = w.cars[e.car]!;
    const S = this.shape(c);
    const r = S.rx;
    const rz = S.rz;
    if (e.what === 'up') {
      // the cage blinks on from a flash of cells thrown in towards the car
      for (let i = 0; i < 40; i++) {
        const a = rand(0, Math.PI * 2);
        this.h.particle(
          'spark',
          c.x + Math.cos(a) * r * 1.6,
          c.y + Math.sin(a) * r * 1.6,
          rand(2, rz),
          -Math.cos(a) * 60 + c.vx,
          -Math.sin(a) * 60 + c.vy,
          rand(0, 30),
          0.25,
          1,
          SHIELD_HOT,
        );
      }
      this.hits.set(e.car, []);
    } else if (e.what === 'hit') {
      const list = this.hits.get(e.car) ?? [];
      list.push({ a: Math.atan2(e.y - c.y, e.x - c.x), t: 0 });
      if (list.length > 4) list.shift();
      this.hits.set(e.car, list);
      for (let i = 0; i < 6; i++)
        this.h.particle(
          'spark',
          e.x,
          e.y,
          rand(2, 6),
          rand(-60, 60),
          rand(-60, 60),
          rand(20, 80),
          rand(0.2, 0.4),
          1,
          SHIELD_HOT,
        );
    } else {
      // pop: every cell of the cage flies off as a shard; fade: they drift loose and wink out
      const pop = e.what === 'pop';
      const ox = pop ? e.x : c.x;
      const oy = pop ? e.y : c.y;
      const hc = Math.cos(c.h);
      const hs = Math.sin(c.h);
      for (let i = 0; i < DOME.length; i += 3) {
        if (!pop && Math.random() < 0.5) continue;
        const fx = DOME[i]! * S.rx;
        const fy = DOME[i + 1]! * S.ry;
        const x = c.x + fx * hc - fy * hs;
        const y = c.y + fx * hs + fy * hc;
        const z = Math.max(0, DOME[i + 2]!) * rz + 1;
        let dx = x - ox;
        let dy = y - oy;
        const d = Math.hypot(dx, dy) || 1;
        dx /= d;
        dy /= d;
        const v = pop ? rand(70, 190) : rand(5, 25);
        this.h.particle(
          'glitter',
          x,
          y,
          z,
          c.vx * 0.7 + dx * v,
          c.vy * 0.7 + dy * v,
          pop ? rand(20, 90) : rand(10, 30),
          pop ? rand(0.4, 0.9) : rand(0.5, 1.1),
          1,
          Math.random() < 0.3 ? SHIELD_HOT : SHIELD_RGB,
        );
      }
      if (pop) {
        this.h.flashes.push({ x: c.x, y: c.y, r: 46, life: 0.25, max: 0.25, rgb: SHIELD_RGB });
        this.h.pop(c.x, c.y);
      }
      this.hits.delete(e.car);
    }
  }

  /** Per tick: age the blows on the bubbles and lay the next beads of weld. */
  afterStep(): void {
    for (const list of this.hits.values()) for (const h of list) h.t += DT;
    const w = this.h.w;
    for (const c of w.cars) {
      if (c.weldT <= 0 || c.wrecked) continue;
      const body = this.h.bodies[c.index]!;
      const fresh = this.h.freshBody(c);
      const L: Layout = {
        W: body.img.width,
        cw: body.cw,
        ch: body.ch,
        cols: body.cols,
        res: body.res,
      };
      let wd = this.welds.get(c.index);
      if (!wd) {
        wd = { plan: weldPlan(pixels(body), pixels(fresh), L, Math.random), done: 0, hp0: c.hp };
        this.welds.set(c.index, wd);
      }
      // the share of the damage that is mended is the share of the missing armour put back
      const f = wd.hp0 >= 100 ? 1 : Math.min(1, (c.hp - wd.hp0) / (100 - wd.hp0 - 1e-6));
      const to = Math.min(wd.plan.length, Math.ceil(wd.plan.length * f));
      if (to <= wd.done) continue;
      const beads = weldSome(pixels(body), pixels(fresh), wd.plan, wd.done, to, L, 3);
      wd.done = to;
      body.stale = true;
      body.aux = undefined;
      this.h.changed.add(body);
      const cs = Math.cos(c.h) * c.size;
      const sn = Math.sin(c.h) * c.size;
      for (const b of beads) {
        const x = c.x + cs * b.x - sn * b.y;
        const y = c.y + sn * b.x + cs * b.y;
        for (let k = 0; k < 2; k++)
          this.h.particle(
            'spark',
            x,
            y,
            c.z + (b.z + 0.5) * c.size,
            c.vx + rand(-40, 40),
            c.vy + rand(-40, 40),
            rand(40, 110),
            rand(0.15, 0.4),
            1,
            WELD_RGB[Math.floor(Math.random() * 4)]!,
          );
      }
      if (beads.length && Math.random() < 0.25)
        this.h.flashes.push({ x: c.x, y: c.y, r: 14, life: 0.06, max: 0.06, rgb: 0x9ad8ff });
    }
  }

  /** A burst of weld sparks over a car: a part going back on. */
  private sputter(c: Car, n: number, spread: number): void {
    for (let i = 0; i < n; i++)
      this.h.particle(
        'spark',
        c.x + rand(-spread, spread),
        c.y + rand(-spread, spread),
        c.z + rand(2, 6),
        c.vx + rand(-50, 50),
        c.vy + rand(-50, 50),
        rand(40, 120),
        rand(0.2, 0.5),
        1,
        WELD_RGB[Math.floor(Math.random() * 4)]!,
      );
    this.h.flashes.push({ x: c.x, y: c.y, r: 24, life: 0.12, max: 0.12, rgb: 0xbfe8ff });
  }

  /** Draw every car's bubble. */
  draw(glow: Put, seen: (x: number, y: number) => boolean): void {
    const w = this.h.w;
    for (const c of w.cars) {
      if (c.shield <= 0 || c.wrecked || !seen(c.x, c.y)) continue;
      const fading = c.shieldT < 1.5 ? 1 - c.shieldT / 1.5 : 0;
      drawBubble(
        c.x,
        c.y,
        c.z,
        this.shape(c),
        w.time,
        c.shield / c.shieldMax,
        fading,
        this.hits.get(c.index) ?? [],
        glow,
      );
    }
  }
}
