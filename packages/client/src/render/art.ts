import {
  rolled,
  sizeOfId,
  type BotLook,
  type CarLook,
  type LookModule,
  type Part,
  type PropLook,
  type Tones,
} from '@demodogs/shared';
import { GLOSS, GLOWS, PALETTE, kit } from '@demodogs/content';
import type { RigArt } from './bones';
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
  private readonly rigs = new Map<string, RigArt | null>();
  private readonly cars = new Map<string, CarArt>();
  private readonly bots = new Map<string, BotArt>();
  /** How many pixels (voxels of art) have been built so far, for the loader's readout. */
  built = 0;

  private make(part: Part, mats: Record<string, Tones>, res?: number): Strip {
    const s = build(part, mats, res, GLOWS, GLOSS);
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
    // a prop at another size (a custom track's) has the look of the prop it was made from
    const m = this.looks.get(id) ?? this.looks.get(sizeOfId(id)[0]);
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
  private readonly gunMounts = new Map<string, [number, number, number]>();

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

  /**
   * Where a car's nose gun sits: how far forward, how far out each barrel is from the centre line,
   * and how high. As wide apart as the bonnet allows, so a car with a narrow nose has them side
   * by side, and clear of whatever the body has under the length of a barrel.
   */
  gunMount(id: string, body: { halfLength: number; halfWidth: number }): [number, number, number] {
    let m = this.gunMounts.get(id);
    if (!m) {
      const x = body.halfLength - 4.5;
      let y = Math.max(1.4, body.halfWidth - 2);
      while (y > 1.4 && this.carHeight(id, x, y + 0.8) < 0.5) y -= 0.4;
      y = Math.max(1.4, y);
      let top = 0;
      for (const dx of [-3.5, -1.5, 0.5, 2.5])
        for (const dy of [-0.9, 0, 0.9]) top = Math.max(top, this.carHeight(id, x + dx, y + dy));
      this.gunMounts.set(id, (m = [x, y, top]));
    }
    return m;
  }

  /** How many poses a prop's look has: 1, plus its `alts`. */
  poses(id: string): number {
    return 1 + (this.look(id, 'prop').alts?.length ?? 0);
  }

  /**
   * A prop or weapon strip. `swap` replaces materials (a mine's light switched off). `pose`
   * picks one of the look's other poses (1 is the first of `alts`); a look without it gives
   * the one it has.
   */
  prop(id: string, swap?: Record<string, string>, pose = 0): Strip {
    const key = (swap ? `${id}|${JSON.stringify(swap)}` : id) + (pose ? `#${pose}` : '');
    let s = this.props.get(key);
    if (!s) {
      const L = this.look(id, 'prop');
      const mats: Record<string, Tones> = { ...PALETTE, ...L.materials };
      for (const [from, to] of Object.entries(swap ?? {})) mats[from] = mats[to]!;
      s = this.make((pose && L.alts?.[pose - 1]) || L.part, mats);
      // at another size it is the same thing with bigger or smaller pixels
      if (!this.looks.has(id)) s.res /= sizeOfId(id)[1];
      this.props.set(key, s);
    }
    return s;
  }

  /**
   * A prop's moving parts, if its look has any: the bare part in every pose and each bone, a
   * rolling bone in every step of its turn. Null for a look with no rig.
   */
  rig(id: string): RigArt | null {
    let a = this.rigs.get(id);
    if (a === undefined) {
      const L = this.look(id, 'prop');
      const G = L.rig;
      if (!G) a = null;
      else {
        const mats: Record<string, Tones> = { ...PALETTE, ...L.materials };
        // at another size it is the same thing with bigger or smaller pixels, its bones as far apart
        const size = this.looks.has(id) ? 1 : sizeOfId(id)[1];
        a = {
          size,
          bare: [G.bare, ...(G.alts ?? [])].map((p) => this.make(p, mats)),
          bones: G.bones.map((bone) => {
            const M = bone.move;
            if (M?.kind !== 'roll') return { bone, poses: [this.make(bone.part, mats)] };
            const poses: Strip[] = [];
            for (let k = 0; k < M.steps; k++)
              poses.push(
                this.make(rolled(bone.part, (k / M.steps) * ((Math.PI * 2) / (M.fold ?? 1))), mats),
              );
            return { bone, poses };
          }),
        };
      }
      if (a && a.size !== 1)
        for (const st of [...a.bare, ...a.bones.flatMap((b) => b.poses)]) st.res /= a.size;
      this.rigs.set(id, a);
    }
    return a;
  }

  /** Build everything a prop may be drawn as before it is needed: its poses and its rig. */
  warm(id: string): void {
    this.prop(id);
    if (this.rig(id)) return;
    for (let p = 1; p < this.poses(id); p++) this.prop(id, undefined, p);
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
