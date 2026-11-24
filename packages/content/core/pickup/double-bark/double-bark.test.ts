import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import { rangeGive } from '@demodogs/sim';
import { flatBench, put } from '../../../src/testing';

const barrel = () => loadContent().pickup.get('pickup.double-bark')!;

/** Shots fired in two seconds at a rival parked dead ahead. */
function shots(fitted: boolean, gap = 60) {
  const w = flatBench();
  const c = w.player;
  const o = w.cars[1]!;
  const rounds = c.rounds;
  if (fitted) rangeGive(w, c, barrel());
  const loaded = c.rounds - rounds;
  w.takeEvents();
  let n = 0;
  for (let i = 0; i < 120; i++) {
    put(c, 300, 300, 0);
    put(o, 300 + gap, 300, 0);
    w.step();
    n += w.takeEvents().filter((e) => e.t === 'shot').length;
  }
  return { n, loaded };
}

describe('pickup.double-bark', () => {
  it('fires twice as fast, with more rounds on board', () => {
    const one = shots(false);
    const two = shots(true);
    expect(one.n).toBeGreaterThan(0);
    expect(two.n).toBeGreaterThanOrEqual(one.n * 2 - 1);
    expect(two.loaded).toBe(barrel().amount);
  });

  it('reaches a little further', () => {
    const far = (loadContent().weapon.get('weapon.nose-gun')?.range ?? 110) + 12;
    expect(shots(false, far).n).toBe(0);
    expect(shots(true, far).n).toBeGreaterThan(0);
  });

  it('is sold in the garage', () => {
    expect(barrel().sold).toBe('garage');
  });
});
