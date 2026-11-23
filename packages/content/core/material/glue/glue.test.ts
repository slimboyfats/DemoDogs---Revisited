import { describe, expect, it } from 'vitest';
import { explode, footing, spill } from '@demodogs/sim';
import { loadContent } from '../../../src/index';
import { bench, openSpot, put } from '../../../src/testing';

const def = loadContent().material.get('material.glue')!;
const pool = () => {
  const w = bench();
  const [x, y] = openSpot(w, 80);
  spill(w, def, x, y, 14, -1, true);
  return { w, x, y };
};

describe('material.glue', () => {
  it('drags harder than tar but keeps the grip', () => {
    const { w, x, y } = pool();
    const [grip, drag] = footing(w, x, y);
    expect(grip).toBe(1);
    expect(drag).toBeGreaterThan(loadContent().material.get('material.tar')!.drag);
  });

  it('bogs a car down that drives into it', () => {
    const run = (glue: boolean) => {
      const { w, x, y } = pool();
      if (!glue) w.spills.length = 0;
      put(w.player, x - 20, y, 0, 120);
      for (let i = 0; i < 30; i++) w.step();
      return Math.hypot(w.player.vx, w.player.vy);
    };
    expect(run(true)).toBeLessThan(run(false) * 0.75);
  });

  it('does not burn', () => {
    const { w, x, y } = pool();
    explode(w, x + 22, y, 0.5, null);
    expect(w.blazes.length).toBe(0);
  });
});
