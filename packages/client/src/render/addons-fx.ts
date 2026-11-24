import type { SimEvent } from '@demodogs/shared';
import { isAddon, type Car, type World } from '@demodogs/sim';
import type { Art } from './art';
import { fitted, mounts, place, type Mount } from './addon-mounts';
import type { FxKind } from './pixel/particles';
import type { Strip } from './stack';

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;

/** What the add-on effects need from the rest of the effects. */
export interface AddonHost {
  readonly w: World;
  readonly art: Art;
  readonly quality: number;
  readonly flashes: { x: number; y: number; r: number; life: number; max: number; rgb: number }[];
  /** The car's bodywork as it was built. */
  freshBody(c: Car): Strip;
  /** Break a piece of art standing at (x, y, z) into its pixels, thrown away from (ox, oy). */
  shatter(
    art: Strip,
    at: readonly [number, number, number, number],
    ox: number,
    oy: number,
    speed: number,
    vx: number,
    vy: number,
  ): void;
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
  spark(x: number, y: number, z: number, sp?: number): void;
  flame(x: number, y: number, z: number, size: number, vx: number, vy: number, vz: number): void;
  plume(x: number, y: number, z: number, size: number): void;
  text(x: number, y: number, text: string, col?: string): void;
  msg(text: string, t: number): void;
  vol(x: number, y: number): number;
  shake(k: number): void;
  sound(what: 'clang' | 'whoosh' | 'pickup' | 'scrape' | 'boom' | 'repair', v: number): void;
}

/**
 * Add-ons, shown: the clang and sparks as one is bolted on, its pixels flying when it comes off, a
 * plate blowing off its flank, the rocket bottle's fire, the air a scoop feeds on, a magnet's
 * catch flying in and the scrap a pair of jaws tears loose. Everything here is single cells and
 * the add-on's own pixels; the sim only says what happened.
 */
export class AddonFx {
  constructor(private readonly h: AddonHost) {}

  private kindOf(id: string) {
    const k = this.h.w.content.pickup.get(id)?.kind;
    return k && isAddon(k) ? k : null;
  }

  /** Break every piece of add-on `id` on car `c` into its pixels, as if `n` plates were on. */
  private scatter(c: Car, id: string, list: Mount[], speed: number): void {
    const art = this.h.art.prop(id);
    for (const m of list) this.h.shatter(art, place(c, m), c.x, c.y, speed, c.vx, c.vy);
  }

  handle(e: SimEvent): void {
    const H = this.h;
    const w = H.w;
    switch (e.t) {
      case 'addon': {
        const c = w.cars[e.car]!;
        const kind = this.kindOf(e.id);
        if (!kind) return;
        const v = H.vol(c.x, c.y);
        const body = H.freshBody(c);
        if (e.on) {
          if (v > 0) H.sound('clang', v);
          for (const m of mounts(c, kind, body)) {
            const [x, y, z] = place(c, m);
            for (let i = 0; i < 5; i++) H.spark(x, y, z + 2, 40);
          }
          if (kind === 'jet' && v > 0) H.sound('whoosh', v);
          return;
        }
        // it comes off in its pixels: gently when it has run out, hard when it was struck off
        this.scatter(c, e.id, mounts(c, kind, body, 1), e.spent ? 110 : 45);
        if (kind === 'cage' && e.spent && !c.wrecked) {
          if (v > 0) H.sound('clang', v);
          H.shake(5);
          for (let i = 0; i < 24; i++) H.spark(c.x, c.y, 8, 90);
          if (c === w.player) H.msg('THE CAGE TOOK IT!', 1.6);
          else H.text(c.x, c.y, 'CAGE!', '#ffd84a');
        }
        return;
      }
      case 'plate': {
        const c = w.cars[e.car]!;
        // the slab that went is the last of those that were on
        const slot = mounts(c, 'plates', H.freshBody(c), e.left + 1)[e.left];
        if (!slot) return;
        const at = place(c, slot);
        H.shatter(H.art.prop(e.id), at, c.x, c.y, 150, c.vx, c.vy);
        H.flashes.push({ x: at[0], y: at[1], r: 34, life: 0.18, max: 0.18, rgb: 0xffd070 });
        for (let i = 0; i < 16; i++) H.spark(at[0], at[1], at[2] + 2, 110);
        H.flame(at[0], at[1], at[2] + 1, 3, (at[0] - c.x) * 6, (at[1] - c.y) * 6, 20);
        const v = H.vol(c.x, c.y);
        if (v > 0) {
          H.sound('boom', v * 0.5);
          H.sound('clang', v);
        }
        if (c === w.player) H.shake(3);
        return;
      }
      case 'fetch': {
        // the catch flies in along a line of bright cells
        const c = w.cars[e.car]!;
        const dx = c.x - e.x;
        const dy = c.y - e.y;
        for (let i = 0; i < 14; i++) {
          const t = i / 14;
          H.particle(
            'spark',
            e.x + dx * t + rand(-1.5, 1.5),
            e.y + dy * t + rand(-1.5, 1.5),
            rand(3, 8),
            dx * 2.5 + c.vx,
            dy * 2.5 + c.vy,
            rand(-10, 20),
            0.18 + 0.2 * (1 - t),
            1,
            i % 2 ? 0xa6fbff : 0xff7466,
          );
        }
        return;
      }
      case 'chew': {
        const c = w.cars[e.car]!;
        const dx = c.x - e.x;
        const dy = c.y - e.y;
        // scrap flies from the bite back to the biter
        for (let i = 0; i < 8; i++)
          H.particle(
            'spark',
            e.x + rand(-2, 2),
            e.y + rand(-2, 2),
            rand(2, 6),
            dx * 3 + c.vx + rand(-25, 25),
            dy * 3 + c.vy + rand(-25, 25),
            rand(30, 80),
            rand(0.25, 0.45),
            1,
            i % 3 ? 0xc4c7cd : 0xffd84a,
          );
        if (c === w.player) {
          if (e.cash > 0) H.text(c.x, c.y, `+$${e.cash}`, '#ffd84a');
          H.sound('repair', 0.6);
        }
        return;
      }
      case 'grind': {
        for (let i = 0; i < 7; i++) H.spark(e.x, e.y, 2.5, 90);
        const v = H.vol(e.x, e.y);
        if (v > 0.2) H.sound('scrape', v);
        return;
      }
      case 'wreck': {
        // a wreck's bolted-on gear goes with the bodywork
        const c = w.cars[e.car]!;
        const body = H.freshBody(c);
        for (const k of fitted(c)) this.scatter(c, c.fit[k]!.def.id, mounts(c, k, body), 120);
        return;
      }
    }
  }

  /** Once a tick: what burns, blows and crackles while an add-on is at work. */
  afterStep(): void {
    const H = this.h;
    const q = H.quality;
    for (const c of H.w.cars) {
      if (c.wrecked) continue;
      // (laid out at the size the car is just now)
      const cs = Math.cos(c.h) * c.size;
      const sn = Math.sin(c.h) * c.size;
      const body = H.freshBody(c);
      if (c.fit.jet) {
        // fire out of the nozzle, and a tail of smoke left behind
        const [x, y, z] = place(c, mounts(c, 'jet', body)[0]!);
        const nx = x - cs * 5.5;
        const ny = y - sn * 5.5;
        H.flame(nx, ny, z + 1, 3.2, c.vx * 0.3 - cs * 90, c.vy * 0.3 - sn * 90, rand(-4, 14));
        if (Math.random() < 0.6 * q) H.plume(nx - cs * 6, ny - sn * 6, z, 2.4);
        for (let i = 0; i < 2; i++) H.spark(nx, ny, z + 1.5, 70);
        if (c === H.w.player) H.shake(1.6);
      }
      if (c.draft && Math.random() < 0.8) {
        // the wake pours into the scoop: pale streaks along the bonnet
        const [x, y, z] = place(c, mounts(c, 'scoop', body)[0]!);
        const off = rand(-2.2, 2.2);
        H.particle(
          'spark',
          x + cs * 9 - sn * off,
          y + sn * 9 + cs * off,
          z + rand(1, 2.5),
          c.vx - cs * 70,
          c.vy - sn * 70,
          0,
          0.14,
          1,
          0xdff2ff,
        );
      }
      if (c.fit.magnet && Math.random() < 0.25 * q) {
        // a crackle between the poles
        const [x, y, z] = place(c, mounts(c, 'magnet', body)[0]!);
        const a = rand(0, TAU);
        H.particle(
          'spark',
          x + cs * 3 + Math.cos(a) * 2,
          y + sn * 3 + Math.sin(a) * 2,
          z + 4.5,
          c.vx,
          c.vy,
          rand(-10, 25),
          0.15,
          1,
          0xa6fbff,
        );
      }
    }
  }
}
