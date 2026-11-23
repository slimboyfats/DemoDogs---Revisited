import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import { rangeGive } from '@demodogs/sim';
import { flatBench, put } from '../../../src/testing';

const GO = { steer: 0, throttle: 1, brake: false, boost: false, fire: false };
const rims = () => loadContent().pickup.get('pickup.spur-rims')!;

/** Two cars side by side, the player easing into the rival's flank; what the rival lost. */
function alongside(spiked: boolean) {
  const w = flatBench();
  const c = w.player;
  const o = w.cars[1]!;
  put(c, 300, 300, 0, 120);
  put(o, 300, 313.5, 0, 120);
  if (spiked) rangeGive(w, c, rims());
  w.takeEvents();
  let grinds = 0;
  for (let i = 0; i < 50; i++) {
    // lean on it
    c.vy += 2;
    o.vx = c.vx;
    w.step(GO);
    grinds += w.takeEvents().filter((e) => e.t === 'grind').length;
  }
  return { lost: 100 - o.hp, mine: 100 - c.hp, grinds };
}

describe('pickup.spur-rims', () => {
  it('grinds a car running alongside, which a car without them does not', () => {
    const bare = alongside(false);
    const spiked = alongside(true);
    expect(bare.grinds).toBe(0);
    expect(spiked.grinds).toBeGreaterThan(2);
    expect(spiked.lost).toBeGreaterThan(bare.lost + 5);
    expect(spiked.mine).toBeLessThanOrEqual(bare.mine);
  });

  it('does nothing nose to tail', () => {
    const w = flatBench();
    const c = w.player;
    const o = w.cars[1]!;
    put(c, 300, 300, 0, 60);
    put(o, 324, 300, 0, 50);
    rangeGive(w, c, rims());
    w.takeEvents();
    let grinds = 0;
    for (let i = 0; i < 40; i++) {
      w.step(GO);
      grinds += w.takeEvents().filter((e) => e.t === 'grind').length;
    }
    expect(grinds).toBe(0);
  });

  it('is sold in the garage', () => {
    expect(rims().sold).toBe('garage');
    expect(rims().price).toBeGreaterThan(0);
  });
});
