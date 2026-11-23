import type { BotLook, CarLook, LookModule, Part, PropLook, Tones } from '@demodogs/shared';
import { GLOWS, PALETTE, kit } from '@demodogs/content';
import type { Strip } from './stack';
import { build, CAR_DETAIL, hexRgb, tones } from './strips';

export interface CarArt {
  body: Strip;
  top: Strip;
  bumper: Strip;
  chunk: Strip;
}

export interface BotArt {
  body: Strip;
  aerial: Strip;
  limb: Strip;
  foot: Strip;
  chunk: Strip;
}

const TRIM = '#f1ede2';
const scale = (hex: string, k: number): string =>
  `#${hexRgb(hex)
    .map((v) =>
      Math.round(v * k)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;

/**
 * Every strip the game draws, built from the content looks on first use and kept. Cars and bots
 * are built per paint colour, since paint is baked into the strip.
 */
export class Art {
  readonly wheels: Strip[];
  readonly pickup: Strip;
  readonly plank: Strip;
  /** A decoy thrown out for rockets to chase. */
  readonly squeaky: Strip;
  private readonly heights = new Map<string, number>();
  private readonly roofs = new Map<string, number>();
  /** One link of a chain: a dark block a little over an art pixel across. */
  readonly link: Strip;
  private readonly props = new Map<string, Strip>();
  private readonly cars = new Map<string, CarArt>();
  private readonly bots = new Map<string, BotArt>();
  /** How many pixels (voxels of art) have been built so far, for the loader's readout. */
  built = 0;

  private make(part: Part, mats: Record<string, Tones>, res?: number): Strip {
    const s = build(part, mats, res, GLOWS);
    this.built += s.cw * s.ch * s.n;
    return s;
  }

  constructor(private readonly looks: Map<string, LookModule>) {
    this.wheels = [0, 1, 2].map((f) => this.make(kit.wheel(f), PALETTE, CAR_DETAIL));
    this.pickup = this.make(kit.PICKUP_BOX, PALETTE);
    this.plank = this.make(kit.PLANK, PALETTE);
    this.squeaky = this.make(kit.SQUEAKY, PALETTE);
    this.link = this.make({ w: 2, h: 2, layers: 1, fn: () => 'bumper' }, PALETTE);
  }

  private look<K extends 'car' | 'prop' | 'bot'>(
    id: string,
    kind: K,
  ): Extract<CarLook | PropLook | BotLook, { kind: K }> {
    const m = this.looks.get(id);
    if (!m || m.look.kind !== kind) throw new Error(`no ${kind} look for ${id}`);
    return m.look as Extract<CarLook | PropLook | BotLook, { kind: K }>;
  }

  /**
   * How high a car's body stands at (x, y) in its own frame, art px above its sill: read off the
   * body's own shape, so that what is bolted on sits on the bonnet, the roof or the boot.
   */
  carHeight(id: string, x: number, y: number): number {
    const key = `${id}|${x.toFixed(1)}|${y.toFixed(1)}`;
    let h = this.heights.get(key);
    if (h === undefined) {
      const B = this.look(id, 'car').body;
      h = 0;
      for (let z = B.layers; z > 0; z -= 0.25)
        if (B.fn(x, y, B.smooth ? z - 0.125 : Math.floor(z - 0.125))) {
          h = z;
          break;
        }
      this.heights.set(key, h);
    }
    return h;
  }

  /** Where along a car the roof is: the middle of the highest stretch of its centre line. */
  carRoof(id: string): number {
    let x = this.roofs.get(id);
    if (x === undefined) {
      const B = this.look(id, 'car').body;
      let top = 0;
      let from = 0;
      let to = 0;
      for (let q = -B.w / 2 + 1; q <= B.w / 2 - 1; q += 0.5) {
        const h = this.carHeight(id, q, 0);
        if (h > top + 0.3) {
          top = h;
          from = to = q;
        } else if (h > top - 0.3) to = q;
      }
      x = (from + to) / 2;
      this.roofs.set(id, x);
    }
    return x;
  }

  /** A prop or weapon strip. `swap` replaces materials (a mine's light switched off). */
  prop(id: string, swap?: Record<string, string>): Strip {
    const key = swap ? `${id}|${JSON.stringify(swap)}` : id;
    let s = this.props.get(key);
    if (!s) {
      const L = this.look(id, 'prop');
      const mats: Record<string, Tones> = { ...PALETTE, ...L.materials };
      for (const [from, to] of Object.entries(swap ?? {})) mats[from] = mats[to]!;
      s = this.make(L.part, mats);
      this.props.set(key, s);
    }
    return s;
  }

  car(id: string, paint: string): CarArt {
    const key = id + paint;
    let a = this.cars.get(key);
    if (!a) {
      const L = this.look(id, 'car');
      const m = {
        ...PALETTE,
        paint: tones(paint),
        trim: tones(TRIM),
        // panel gaps and arch lips: the paint, much darker
        gap: tones(scale(paint, 0.42)),
        // a second, deeper shade of the paint for two-tone bodies
        paint2: tones(scale(paint, 0.68)),
      };
      a = {
        body: this.make(L.body, m, CAR_DETAIL),
        top: this.make(L.top, m, CAR_DETAIL),
        bumper: this.make(kit.BUMPER, m, CAR_DETAIL),
        chunk: this.make(kit.CHUNK, m),
      };
      this.cars.set(key, a);
    }
    return a;
  }

  bot(id: string, paint: string): BotArt {
    const key = id + paint;
    let a = this.bots.get(key);
    if (!a) {
      const L = this.look(id, 'bot');
      const m = { ...PALETTE, paint: tones(paint) };
      const b = (p: Part) => this.make(p, m);
      a = {
        body: b(L.body),
        aerial: b(L.aerial),
        limb: b(L.limb),
        foot: b(L.foot),
        chunk: b(L.chunk),
      };
      this.bots.set(key, a);
    }
    return a;
  }
}
