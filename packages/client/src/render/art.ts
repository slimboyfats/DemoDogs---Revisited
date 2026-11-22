import type { BotLook, CarLook, LookModule, Part, PropLook, Tones } from '@demodogs/shared';
import { PALETTE, kit } from '@demodogs/content';
import type { Strip } from './stack';
import { build, tones } from './strips';

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

/**
 * Every strip the game draws, built from the content looks on first use and kept. Cars and bots
 * are built per paint colour, since paint is baked into the strip.
 */
export class Art {
  readonly wheels: Strip[];
  readonly pickup: Strip;
  readonly plank: Strip;
  private readonly props = new Map<string, Strip>();
  private readonly cars = new Map<string, CarArt>();
  private readonly bots = new Map<string, BotArt>();

  constructor(private readonly looks: Map<string, LookModule>) {
    this.wheels = [0, 1, 2].map((f) => build(kit.wheel(f), PALETTE));
    this.pickup = build(kit.PICKUP_BOX, PALETTE);
    this.plank = build(kit.PLANK, PALETTE);
  }

  private look<K extends 'car' | 'prop' | 'bot'>(
    id: string,
    kind: K,
  ): Extract<CarLook | PropLook | BotLook, { kind: K }> {
    const m = this.looks.get(id);
    if (!m || m.look.kind !== kind) throw new Error(`no ${kind} look for ${id}`);
    return m.look as Extract<CarLook | PropLook | BotLook, { kind: K }>;
  }

  /** A prop or weapon strip. `swap` replaces materials (a mine's light switched off). */
  prop(id: string, swap?: Record<string, string>): Strip {
    const key = swap ? `${id}|${JSON.stringify(swap)}` : id;
    let s = this.props.get(key);
    if (!s) {
      const L = this.look(id, 'prop');
      const mats: Record<string, Tones> = { ...PALETTE, ...L.materials };
      for (const [from, to] of Object.entries(swap ?? {})) mats[from] = mats[to]!;
      s = build(L.part, mats);
      this.props.set(key, s);
    }
    return s;
  }

  car(id: string, paint: string): CarArt {
    const key = id + paint;
    let a = this.cars.get(key);
    if (!a) {
      const L = this.look(id, 'car');
      const m = { ...PALETTE, paint: tones(paint), trim: tones(TRIM) };
      a = {
        body: build(L.body, m),
        top: build(L.top, m),
        bumper: build(kit.BUMPER, m),
        chunk: build(kit.CHUNK, m),
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
      const b = (p: Part) => build(p, m);
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
