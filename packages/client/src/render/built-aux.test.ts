import { describe, expect, it } from 'vitest';
import { loadLooks, PALETTE, GLOWS, GLOSS } from '@demodogs/content';
import type { Part } from '@demodogs/shared';
import { AuxBake, bakeAux } from './pixel/aux';
import { build, CAR_DETAIL, dent, tones } from './strips';

// a strip's image is a canvas the pixel engine never draws on: a plain object will do here
(globalThis as { document?: unknown }).document ??= {
  createElement: () => ({ width: 0, height: 0 }),
};

const hash = (a: ArrayLike<number>): number => {
  let h = 2166136261;
  for (let i = 0; i < a.length; i++) h = Math.imul(h ^ a[i]!, 16777619);
  return h >>> 0;
};

describe('a strip is built with its lighting bytes', () => {
  const looks = loadLooks();
  const parts: [string, Part, number][] = [];
  for (const [id, m] of looks) {
    if (m.look.kind === 'car' && parts.filter((p) => p[2] === CAR_DETAIL).length < 2)
      parts.push([id, m.look.body, CAR_DETAIL]);
    if (m.look.kind === 'prop' && parts.filter((p) => p[2] === 3).length < 6)
      parts.push([id, m.look.part, 3]);
  }
  const mats = {
    ...PALETTE,
    paint: tones('#c03030'),
    trim: tones('#f1ede2'),
    gap: tones('#501010'),
    paint2: tones('#802020'),
  };
  for (const [id, part, res] of parts)
    it(`${id}: the same bytes the bake works out from its pixels`, () => {
      const looksOf = looks.get(id)!.look;
      const m = looksOf.kind === 'prop' ? { ...mats, ...looksOf.materials } : mats;
      const s = build(part, m, res, GLOWS, GLOSS);
      const W = s.cw * s.cols;
      const H = s.ch * Math.ceil(s.n / s.cols);
      expect(s.aux).toBeDefined();
      expect(hash(s.aux!)).toBe(hash(bakeAux(s.px!, W, H, s, s.glow, s.gloss)));
    });

  it('a dent says which part of the slices it changed, and baking that part alone is enough', () => {
    const [, part, res] = parts.find((p) => p[2] === CAR_DETAIL)!;
    const s = build(part, mats, res, GLOWS, GLOSS);
    const W = s.cw * s.cols;
    const H = s.ch * Math.ceil(s.n / s.cols);
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    let aux = s.aux!;
    for (const [lx, ly] of [
      [4, 2],
      [-6, -3],
      [9, 0],
    ] as const) {
      const before = s.px!.slice();
      s.touched = undefined;
      dent(s, lx, ly, 3, 0.5, rand);
      expect(s.aux).toBeUndefined();
      const box = s.touched!;
      expect(box).toBeTruthy();
      // nothing outside the box changed, in any slice
      let changed = 0;
      for (let z = 0; z < s.n; z++)
        for (let y = 0; y < s.ch; y++)
          for (let x = 0; x < s.cw; x++) {
            const j = ((Math.floor(z / s.cols) * s.ch + y) * W + (z % s.cols) * s.cw + x) * 4;
            if (
              s.px![j] === before[j] &&
              s.px![j + 1] === before[j + 1] &&
              s.px![j + 2] === before[j + 2] &&
              s.px![j + 3] === before[j + 3]
            )
              continue;
            changed++;
            expect(x >= box[0] && x < box[2] && y >= box[1] && y < box[3]).toBe(true);
          }
      expect(changed).toBeGreaterThan(0);
      expect((box[2] - box[0]) * (box[3] - box[1])).toBeLessThan(s.cw * s.ch);
      const part2 = new AuxBake(s.px!, W, H, s, s.glow, s.gloss, box, aux);
      part2.step();
      aux = part2.out;
      expect(hash(aux)).toBe(hash(bakeAux(s.px!, W, H, s, s.glow, s.gloss)));
    }
  });
});
