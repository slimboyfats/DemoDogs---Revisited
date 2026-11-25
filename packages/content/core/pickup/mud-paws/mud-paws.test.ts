import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import { rangeGive } from '@demodogs/sim';
import { bench, flatBench, put } from '../../../src/testing';

const GO = { steer: 0, throttle: 1, brake: false, boost: false, fire: false };
const paws = () => loadContent().pickup.get('pickup.mud-paws')!;

/** A point well off the road. */
function verge(w: ReturnType<typeof bench>): [number, number] {
  for (let y = 80; y < w.h - 80; y += 20)
    for (let x = 80; x < w.w - 80; x += 20)
      if (w.offroad(x, y) && w.offroad(x + 150, y) && w.free(x, y, 40) && w.free(x + 150, y, 40))
        return [x, y];
  throw new Error('no verge');
}

describe('pickup.mud-paws', () => {
  it('keeps most of its speed off the road', () => {
    const run = (fitted: boolean) => {
      const w = bench();
      w.statics.length = 0;
      const c = w.player;
      const [x, y] = verge(w);
      if (fitted) rangeGive(w, c, paws());
      let v = 0;
      for (let i = 0; i < 120; i++) {
        put(c, x, y, 0, c.vf);
        w.step(GO);
        v = c.vf;
      }
      return v;
    };
    // (rough ground costs less than it did, so the tyres win back less of it)
    expect(run(true)).toBeGreaterThan(run(false) * 1.15);
  });

  it('is slowed far less by a slick', () => {
    const cross = (fitted: boolean) => {
      const w = flatBench();
      const c = w.player;
      const glue = loadContent().material.get('material.glue')!;
      w.spills.push({ def: glue, x: 300, y: 300, r: 40, owner: -1 });
      put(c, 250, 300, 0, 150);
      if (fitted) rangeGive(w, c, paws());
      for (let i = 0; i < 30; i++) w.step(GO);
      return c.vf;
    };
    expect(cross(true)).toBeGreaterThan(cross(false) + 15);
  });

  it('is sold in the garage', () => {
    expect(paws().sold).toBe('garage');
  });
});
