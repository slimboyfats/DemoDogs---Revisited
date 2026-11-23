import { describe, expect, it } from 'vitest';
import { flatBench } from '../../../src/testing';

/** Fires started in 20 seconds from six fires burning in the open. */
function fires(modifiers: string[]): number {
  const w = flatBench({ modifiers });
  for (let i = 0; i < 6; i++)
    w.blazes.push({ x: 380 + i * 40, y: 420, r: 9, t: 6, bite: 99, owner: -1 });
  w.takeEvents();
  let n = 0;
  for (let i = 0; i < 60 * 20; i++) {
    w.step();
    n += w.takeEvents().filter((e) => e.t === 'blaze').length;
  }
  return n;
}

describe('modifier.tinderbox', () => {
  it('spreads fire: burning ground starts new fires around it', () => {
    expect(fires([])).toBe(0);
    expect(fires(['modifier.tinderbox'])).toBeGreaterThan(4);
  });

  it('burns itself out rather than running away', () => {
    const w = flatBench({ modifiers: ['modifier.tinderbox'] });
    let most = 0;
    for (let i = 0; i < 60 * 240; i++) {
      w.step();
      most = Math.max(most, w.blazes.length);
    }
    expect(most).toBeGreaterThan(0);
    expect(most).toBeLessThan(30);
  });
});
