import { describe, expect, it } from 'vitest';
import { stand } from '@demodogs/sim';
import { loadContent } from '../../../src/index';
import { flatBench, put } from '../../../src/testing';

describe('prop.boardwalk', () => {
  it('carries a car over water that bogs down one beside it', () => {
    const run = (planks: boolean) => {
      const w = flatBench();
      const x = w.oval!.cx - 60;
      const y = w.oval!.cy;
      const water = loadContent().material.get('material.water')!;
      for (let k = 0; k < 5; k++)
        w.spills.push({ x: x + k * 30, y, r: 34, def: water, owner: -1, fixed: true });
      if (planks) {
        const def = loadContent().prop.get('prop.boardwalk')!;
        for (let k = 0; k < 5; k++) stand(w, def, x + k * 38, y, 0, 0);
      }
      put(w.player, x - 20, y, 0, 150);
      for (let i = 0; i < 60; i++)
        w.step({ steer: 0, throttle: 1, brake: false, boost: false, fire: false });
      return w.player.vx;
    };
    expect(run(true)).toBeGreaterThan(run(false) + 25);
  });
});
