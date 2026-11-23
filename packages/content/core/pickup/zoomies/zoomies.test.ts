import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import { BASE_SPEED } from '@demodogs/shared';
import { rangeGive } from '@demodogs/sim';
import { flatBench, put } from '../../../src/testing';

const jet = () => loadContent().pickup.get('pickup.zoomies')!;

describe('pickup.zoomies', () => {
  it('drives the car far past its top speed with nobody on the pedal, then burns out', () => {
    const w = flatBench();
    const c = w.player;
    put(c, 100, 300, 0, 100);
    rangeGive(w, c, jet());
    let top = 0;
    for (let i = 0; i < 60 * jet().seconds! - 2; i++) {
      // brakes do nothing while it burns
      w.step({ steer: 0, throttle: 0, brake: true, boost: false, fire: false });
      top = Math.max(top, c.vf);
      put(c, 100, 300, 0, c.vf);
    }
    expect(top).toBeGreaterThan(BASE_SPEED * c.stats.speed * 1.5);
    expect(c.fit.jet).toBeDefined();
    for (let i = 0; i < 10; i++) w.step();
    expect(c.fit.jet).toBeUndefined();
  });

  it('rams harder while it burns', () => {
    const ram = (lit: boolean) => {
      const w = flatBench();
      const c = w.player;
      const o = w.cars[1]!;
      put(c, 300, 300, 0, 150);
      put(o, 326, 300, Math.PI / 2, 0);
      if (lit) c.fit.jet = { def: jet(), t: 3, n: 0, cd: 0 };
      for (let i = 0; i < 12; i++) w.step();
      return { theirs: 100 - o.hp, mine: 100 - c.hp };
    };
    const plain = ram(false);
    const lit = ram(true);
    expect(lit.theirs).toBeGreaterThan(plain.theirs * 1.5);
    expect(lit.mine).toBeLessThan(plain.mine + lit.theirs);
  });

  it('is in every venue and on the black market', () => {
    for (const v of loadContent().venue.values()) expect(v.pickups).toContain('pickup.zoomies');
    expect(jet().sold).toBe('market');
  });
});
