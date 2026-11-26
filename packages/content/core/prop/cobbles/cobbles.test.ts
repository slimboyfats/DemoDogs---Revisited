import { describe, expect, it } from 'vitest';
import { stand } from '@demodogs/sim';
import { loadContent } from '../../../src/index';
import { bench, put } from '../../../src/testing';

describe('prop.cobbles', () => {
  const lay = () => {
    const w = bench();
    const T = w.track!;
    // a spot well off the road, beside its start
    const a = T.a[40]!;
    const x = T.x[40]! - Math.sin(a) * (w.road / 2 + 120);
    const y = T.y[40]! + Math.cos(a) * (w.road / 2 + 120);
    return { w, x, y, a };
  };
  it('makes the ground under it road: a car on it is not off the road and keeps its speed', () => {
    const { w, x, y, a } = lay();
    expect(w.offroad(x, y)).toBe(true);
    const def = loadContent().prop.get('prop.cobbles')!;
    for (let k = -3; k <= 3; k++)
      stand(w, def, x + Math.cos(a) * k * 42, y + Math.sin(a) * k * 42, a, 0);
    expect(w.paths.length).toBe(7);
    expect(w.pads.length).toBe(0);
    expect(w.offroad(x, y)).toBe(false);
    expect(w.offness(x, y)).toBe(0);
    // beside the path it is still rough ground
    expect(w.offroad(x - Math.sin(a) * 40, y + Math.cos(a) * 40)).toBe(true);
  });
  it('is part of the course: no count starts on it, as one does on the grass beside it', () => {
    const run = (path: boolean) => {
      const { w, x, y, a } = lay();
      const def = loadContent().prop.get('prop.cobbles')!;
      if (path) stand(w, def, x, y, a, 0);
      const c = w.player;
      put(c, x, y, a, 0);
      for (let i = 0; i < 60 * 3; i++) {
        w.step({ steer: 0, throttle: 0, brake: true, boost: false, fire: false });
        c.x = x;
        c.y = y;
      }
      return c.downT;
    };
    expect(run(false)).toBeGreaterThan(1);
    expect(run(true)).toBe(0);
  });
});
