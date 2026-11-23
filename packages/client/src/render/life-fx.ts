import { DT, type SimEvent } from '@demodogs/shared';
import type { Car, World } from '@demodogs/sim';
import type { Sound } from '../audio/sound';
import type { Art } from './art';
import type { Effects } from './effects';
import { CKind } from './pixel/cells';
import { voxelsOf } from './strips';

/**
 * How the track pieces look and sound (the sim's side is sim/pads.ts and sim/critters.ts): the
 * kick of a boost tile and the fire a surging car trails, the dust off a ramp and the ring where
 * the car comes down, feathers and wool, the cries of animals, and the mark a car leaves through
 * long grass. The tiles and the animals themselves are drawn in stacks.ts. All single cells,
 * loud on purpose, and nothing fed back into the sim.
 */

type LifeEvent = Extract<SimEvent, { t: 'pad' | 'critter' | 'trample' }>;

const TAU = Math.PI * 2;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = (c: readonly number[]) => c[(Math.random() * c.length) | 0]!;
const AMBER = [0xfffbd6, 0xffe98a, 0xffb637, 0xff8a1c] as const;
const BLUE = [0xffffff, 0xc8f6ff, 0x6fd6ff, 0x32b4f0] as const;
const CRIES = { cluck: 'BAWK!', baa: 'BAA!', moo: 'MOO!', caw: 'CAW!', squeak: 'EEK!' } as const;
const hex = (rgb: number) => `#${rgb.toString(16).padStart(6, '0')}`;

export class LifeFx {
  /** Cars that left a ramp and have not come down yet, by index. */
  private readonly flying = new Set<number>();
  /** Which colours a surging car trails: those of the tile that kicked it. */
  private readonly trail = new Map<number, readonly number[]>();
  private readonly tones = new Map<string, number[]>();
  /** Seconds until the next cry may be played: a flock goes up as one voice, not seven. */
  private hush = 0;

  /** A dozen colours off a prop's art: what its feathers, wool or petals are. */
  private tonesOf(art: Art, id: string): number[] {
    let t = this.tones.get(id);
    if (!t) {
      const all = voxelsOf(art.prop(id));
      t = [];
      for (let i = 0; i < 14 && all.length; i++)
        t.push(all[Math.floor(Math.random() * all.length)]!.rgb);
      this.tones.set(id, t);
    }
    return t;
  }

  /** Play a cry if one is not already in the air; says whether it did. */
  private cry(S: Sound, kind: keyof typeof CRIES, v: number): boolean {
    if (v <= 0 || this.hush > 0) return false;
    this.hush = 0.15;
    S.cry(kind, v);
    return true;
  }

  /** Feathers, wool or fur: single cells that flutter down and lie where they land. */
  private fluff(
    fx: Effects,
    tones: readonly number[],
    n: number,
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    spread: number,
  ): void {
    if (!tones.length) return;
    const m = Math.ceil(n * Math.max(0.4, fx.quality));
    for (let i = 0; i < m; i++) {
      const a = rand(0, TAU);
      const v = rand(0.2, 1) * spread;
      fx.cells.add(
        CKind.Leaf,
        x + rand(-2, 2),
        y + rand(-2, 2),
        z + rand(1, 5),
        vx * rand(0.2, 0.7) + Math.cos(a) * v,
        vy * rand(0.2, 0.7) + Math.sin(a) * v,
        rand(20, 90),
        rand(3, 6),
        pick(tones),
      );
    }
  }

  handle(fx: Effects, w: World, e: LifeEvent, S: Sound, art: Art): void {
    const v = fx.vol(e.x, e.y);
    if (e.t === 'trample') {
      const s = w.statics[e.prop]!;
      const c = w.cars[e.car]!;
      const tones = this.tonesOf(art, s.def.id);
      this.fluff(fx, tones, 7, s.x, s.y, 1, c.vx, c.vy, 30);
      // and it lies flat from now on: a smear of its own colours along the way the car went
      const a = Math.atan2(c.vy, c.vx);
      fx.paintGround(s.x, s.y, 8, (g) => {
        for (let i = 0; i < 16; i++) {
          const d = rand(-1, 4.5);
          const o = rand(-2.6, 2.6);
          g.fillStyle = hex(pick(tones));
          g.globalAlpha = 0.85;
          g.fillRect(
            Math.round(s.x + Math.cos(a) * d - Math.sin(a) * o),
            Math.round(s.y + Math.sin(a) * d + Math.cos(a) * o),
            1,
            1,
          );
        }
        g.globalAlpha = 1;
      });
      if (v > 0 && Math.random() < 0.35) S.rustle(v);
      return;
    }
    if (e.t === 'pad') {
      const c = w.cars[e.car]!;
      const mine = c === w.player;
      if (e.kind === 'boost') {
        const turbo = w.statics[e.prop]!.def.pad!.kind === 'boost' && e.power > 90;
        const col = turbo ? BLUE : AMBER;
        this.trail.set(c.index, col);
        // a ring of sparks off the plate, a gout of fire out of the back, and a flash
        const n = Math.ceil((turbo ? 60 : 40) * Math.max(0.4, fx.quality));
        const cs = Math.cos(c.h);
        const sn = Math.sin(c.h);
        for (let i = 0; i < n; i++) {
          const a = rand(0, TAU);
          const sp = rand(40, 130);
          fx.emit(
            'spark',
            e.x - cs * 8,
            e.y - sn * 8,
            rand(1, 5),
            Math.cos(a) * sp - cs * 90,
            Math.sin(a) * sp - sn * 90,
            rand(20, 90),
            rand(0.25, 0.6),
            1,
            pick(col),
          );
        }
        for (let i = 0; i < 10; i++)
          fx.flame(e.x - cs * 10, e.y - sn * 10, 3, rand(3, 6), -cs * 60, -sn * 60);
        fx.flashes.push({
          x: e.x,
          y: e.y,
          r: turbo ? 90 : 64,
          life: 0.35,
          max: 0.35,
          rgb: turbo ? 0x6fd6ff : 0xffb637,
        });
        if (mine) {
          fx.text(e.x, e.y, turbo ? 'TURBO!' : 'BOOST!', turbo ? '#6fd6ff' : '#ffd24a', turbo);
          fx.shake = Math.max(fx.shake, turbo ? 5 : 3);
          S.surge(turbo);
        } else if (v > 0) S.whoosh(v * 0.5);
        return;
      }
      // off a ramp: the wheels throw dust back down it
      this.flying.add(c.index);
      for (let i = 0; i < 10; i++)
        fx.puff(e.x, e.y, 2, 'dust', -c.vx * 0.2 + rand(-20, 20), -c.vy * 0.2 + rand(-20, 20));
      for (let i = 0; i < 8; i++) fx.spark(e.x, e.y, 3, 50);
      if (v > 0) S.boing(v);
      if (mine) fx.text(e.x, e.y, 'AIR!', '#f6d93b');
      return;
    }
    const k = w.critters[e.critter]!;
    const D = k.def.critter!;
    const tones = this.tonesOf(art, k.def.id);
    const c = e.car >= 0 ? w.cars[e.car]! : null;
    switch (e.what) {
      case 'flung': {
        // the bigger the animal, the more of its coat is left in the air
        const n = 16 + Math.min(40, k.def.radius * k.def.radius * 3);
        this.fluff(fx, tones, n, e.x, e.y, 2, c?.vx ?? 0, c?.vy ?? 0, 70);
        for (let i = 0; i < 5; i++) fx.puff(e.x, e.y, 2, 'dust');
        const heard = this.cry(S, D.cry, v);
        if (c === w.player) {
          if (heard) fx.text(e.x, e.y - 9, CRIES[D.cry], '#ffffff');
          fx.shake = Math.max(fx.shake, 1.5 + D.mass * 6);
        }
        break;
      }
      case 'bump':
        for (let i = 0; i < 12; i++) {
          const a = rand(0, TAU);
          fx.puff(e.x, e.y, 2, 'dust', Math.cos(a) * 40, Math.sin(a) * 40);
        }
        this.fluff(fx, tones, 8, e.x, e.y, 4, 0, 0, 40);
        this.cry(S, D.cry, Math.max(v, c === w.player ? 1 : 0));
        if (v > 0) {
          S.thud(v);
          fx.text(e.x, e.y - 6, CRIES[D.cry], '#ffffff', c === w.player);
        }
        if (c === w.player) fx.shake = Math.max(fx.shake, 7);
        break;
      case 'up':
        this.fluff(fx, tones, 3, e.x, e.y, 2, 0, 0, 25);
        this.cry(S, D.cry, v * 0.8);
        if (v > 0) S.flap(v);
        break;
      case 'down':
        break;
    }
  }

  step(fx: Effects, w: World): void {
    this.hush -= DT;
    for (const c of w.cars) {
      if (c.surge > 0 && !c.wrecked) this.surging(fx, c);
      if (this.flying.has(c.index) && c.z <= c.deck + 0.01) {
        this.flying.delete(c.index);
        this.touchdown(fx, w, c);
      }
    }
    // an animal knocked flying sheds a little of its coat all the way down
    for (const k of w.critters)
      if (k.state === 'air' && Math.random() < 0.25 * fx.quality) {
        const t = this.tonesOf(fx.artOf, k.def.id);
        fx.cells.add(
          CKind.Leaf,
          k.x,
          k.y,
          k.z + 1,
          rand(-8, 8),
          rand(-8, 8),
          0,
          rand(3, 5),
          pick(t),
        );
      }
  }

  /** A car on a boost: fire out of both pipes and streaks of the tile's colour down its wake. */
  private surging(fx: Effects, c: Car): void {
    const col = this.trail.get(c.index) ?? AMBER;
    const cs = Math.cos(c.h);
    const sn = Math.sin(c.h);
    const back = c.def.body.halfLength * c.size + 1;
    for (const side of [-1, 1]) {
      const x = c.x - cs * back - sn * side * 3;
      const y = c.y - sn * back + cs * side * 3;
      fx.flame(x, y, c.z + 2.5, rand(2, 3.6), -cs * 40, -sn * 40, rand(0, 12));
      if (Math.random() < 0.6 * fx.quality + 0.2)
        fx.emit(
          'glitter',
          x + rand(-1, 1),
          y + rand(-1, 1),
          c.z + rand(1, 4),
          -cs * rand(20, 70),
          -sn * rand(20, 70),
          rand(-5, 15),
          rand(0.25, 0.5),
          1,
          pick(col),
        );
    }
  }

  /** Down off a ramp: a ring of dust thrown out along the ground, and the screen jolts. */
  private touchdown(fx: Effects, w: World, c: Car): void {
    const n = Math.round(18 * fx.quality) + 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rand(-0.2, 0.2);
      const sp = rand(30, 65);
      fx.puff(
        c.x + Math.cos(a) * 7,
        c.y + Math.sin(a) * 5,
        0.5,
        'dust',
        Math.cos(a) * sp + c.vx * 0.3,
        Math.sin(a) * sp + c.vy * 0.3,
      );
    }
    for (let i = 0; i < 6; i++) fx.spark(c.x, c.y, 1, 60);
    const v = fx.vol(c.x, c.y);
    if (v > 0) fx.thump(v);
    if (c === w.player) fx.shake = Math.max(fx.shake, 5);
    // two short black marks where the tyres bit
    const cs = Math.cos(c.h);
    const sn = Math.sin(c.h);
    fx.paintGround(c.x, c.y, 14, (g) => {
      g.fillStyle = 'rgba(18,16,14,0.45)';
      for (const side of [-1, 1])
        for (let d = -8; d <= 6; d++)
          g.fillRect(
            Math.round(c.x + cs * d - sn * side * 5),
            Math.round(c.y + sn * d + cs * side * 5),
            2,
            2,
          );
    });
  }
}
