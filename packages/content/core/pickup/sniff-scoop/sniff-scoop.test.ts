import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import { rangeGive } from '@demodogs/sim';
import { flatBench, put } from '../../../src/testing';

const GO = { steer: 0, throttle: 1, brake: false, boost: false, fire: false };
const scoop = () => loadContent().pickup.get('pickup.sniff-scoop')!;

/** The player's speed after two seconds flat out, with a rival held 50 px ahead or abeam. */
function chase(fitted: boolean, ahead: boolean) {
  const w = flatBench();
  const c = w.player;
  const o = w.cars[1]!;
  put(c, 120, 300, 0, 150);
  if (fitted) rangeGive(w, c, scoop());
  let drafted = false;
  for (let i = 0; i < 120; i++) {
    put(c, 120, 300, 0, c.vf || 150);
    put(o, ahead ? 170 : 120, ahead ? 300 : 360, 0, 150);
    o.vf = 150;
    w.step(GO);
    drafted ||= c.draft;
  }
  return { v: c.vf, drafted };
}

describe('pickup.sniff-scoop', () => {
  it('is faster in a wake than out of one, and no faster without the scoop', () => {
    const tucked = chase(true, true);
    const abeam = chase(true, false);
    const bare = chase(false, true);
    expect(tucked.drafted).toBe(true);
    expect(abeam.drafted).toBe(false);
    expect(bare.drafted).toBe(false);
    expect(tucked.v).toBeGreaterThan(abeam.v * 1.08);
    expect(bare.v).toBeCloseTo(abeam.v, 3);
  });

  it('is sold in the garage', () => {
    expect(scoop().sold).toBe('garage');
  });
});
