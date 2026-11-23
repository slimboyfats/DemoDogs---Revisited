import { describe, expect, it } from 'vitest';
import { flatBench, put } from '../../../src/testing';

const GALE = ['modifier.gale'];

describe('modifier.gale', () => {
  it('blows: the wind is never still, and gusts come and go', () => {
    const w = flatBench({ modifiers: GALE });
    let gusts = 0;
    let peak = 0;
    for (let i = 0; i < 60 * 30; i++) {
      w.step();
      peak = Math.max(peak, Math.hypot(w.wind[0], w.wind[1]));
      gusts += w.takeEvents().filter((e) => e.t === 'gust').length;
    }
    expect(gusts).toBeGreaterThan(1);
    expect(peak).toBeGreaterThan(90);
    expect(Math.hypot(w.wind[0], w.wind[1])).toBeGreaterThan(10);
  });

  it('carries a car in the air downwind, far more than one on its wheels', () => {
    const drift = (z: number) => {
      const w = flatBench({ modifiers: GALE });
      const c = w.player;
      put(c, w.oval!.cx, w.oval!.cy, 0);
      c.z = z;
      c.vz = z > 0 ? 200 : 0;
      const x0 = c.x;
      const y0 = c.y;
      const [wx, wy] = w.wind;
      for (let i = 0; i < 50; i++) w.step();
      return ((c.x - x0) * wx + (c.y - y0) * wy) / Math.hypot(wx, wy);
    };
    const flying = drift(5);
    expect(flying).toBeGreaterThan(4);
    expect(flying).toBeGreaterThan(drift(0) * 2);
  });

  it('leaves still air when there is no gale', () => {
    const w = flatBench();
    for (let i = 0; i < 120; i++) w.step();
    expect(w.wind).toEqual([0, 0]);
  });
});
