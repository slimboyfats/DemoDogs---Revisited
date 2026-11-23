import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import { rangeGive } from '@demodogs/sim';
import { flatBench, put } from '../../../src/testing';

const BOOST = { steer: 0, throttle: 1, brake: false, boost: true, fire: false };
const tank = () => loadContent().pickup.get('pickup.spare-tank')!;

/** Ticks a full tank of boost lasts, and how full it is again a few seconds later. */
function burn(fitted: boolean) {
  const w = flatBench();
  const c = w.player;
  put(c, 150, 300, 0, 100);
  if (fitted) rangeGive(w, c, tank());
  let ticks = 0;
  while (c.boosting || ticks === 0) {
    put(c, 150, 300, 0, 100);
    w.step(BOOST);
    if (++ticks > 2000) break;
  }
  for (let i = 0; i < 300; i++) {
    put(c, 150, 300, 0, 100);
    w.step();
  }
  return { ticks, back: c.nitro };
}

describe('pickup.spare-tank', () => {
  it('makes the boost last longer and come back faster', () => {
    const one = burn(false);
    const two = burn(true);
    expect(two.ticks).toBeGreaterThan(one.ticks * 1.5);
    expect(two.back).toBeGreaterThan(one.back * 1.5);
  });

  it('is sold in the garage', () => {
    expect(tank().sold).toBe('garage');
    expect(tank().price).toBeGreaterThan(0);
  });
});
