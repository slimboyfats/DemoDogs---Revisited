import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import { flatBench, put } from '../../../src/testing';
import { stand } from '@demodogs/sim';

describe('prop.hay-wall', () => {
  it('a car in the air goes over it; a slow one on the ground is stopped by it', () => {
    const def = loadContent().prop.get('prop.hay-wall')!;
    const run = (z: number, speed: number) => {
      const w = flatBench();
      const c = w.player;
      const s = stand(w, def, w.oval!.cx, w.oval!.cy, 0, 0);
      put(c, s.x - 24, s.y, 0, speed);
      c.z = z;
      c.vz = z > 0 ? 60 : 0;
      for (let i = 0; i < 20; i++) w.step();
      return { c, s };
    };
    const over = run(9, 160);
    expect(over.s.down).not.toBe(true);
    expect(over.c.x).toBeGreaterThan(over.s.x + 10);
    const into = run(0, 40);
    expect(into.c.x).toBeLessThan(into.s.x);
  });
});
