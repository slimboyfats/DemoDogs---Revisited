import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import { rangeGive } from '@demodogs/sim';
import { flatBench, put } from '../../../src/testing';

const jaws = () => loadContent().pickup.get('pickup.scrap-jaws')!;

describe('pickup.scrap-jaws', () => {
  it('ramming a rival mends the car and pays, which it does not without them', () => {
    const ram = (fitted: boolean) => {
      const w = flatBench();
      const c = w.player;
      const o = w.cars[1]!;
      put(c, 300, 300, 0, 150);
      put(o, 326, 300, Math.PI / 2, 0);
      c.hp = 50;
      if (fitted) rangeGive(w, c, jaws());
      w.takeEvents();
      const events = [];
      for (let i = 0; i < 12; i++) {
        w.step();
        events.push(...w.takeEvents());
      }
      return { c, o, events };
    };
    const bare = ram(false);
    const fitted = ram(true);
    expect(bare.c.cash).toBe(0);
    expect(fitted.c.cash).toBeGreaterThan(0);
    expect(fitted.c.hp).toBeGreaterThan(bare.c.hp + 2);
    expect(fitted.events.find((e) => e.t === 'chew')).toMatchObject({
      car: fitted.c.index,
      from: fitted.o.index,
    });
  });

  it('is in every venue', () => {
    for (const v of loadContent().venue.values()) expect(v.pickups).toContain('pickup.scrap-jaws');
  });
});
