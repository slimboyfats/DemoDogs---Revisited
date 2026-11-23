import { describe, expect, it } from 'vitest';
import { explode } from '@demodogs/sim';
import { propTest } from '../../../src/testing';

describe('prop.gas-pump', () => {
  it('knocked down by a blast it goes up and throws burning fuel', () => {
    const r = propTest('prop.gas-pump', 5);
    const w = r.world;
    const s = r.piece!;
    w.takeEvents();
    explode(w, s.x + 10, s.y, 1, null);
    expect(s.down).toBe(true);
    const seen: string[] = [];
    for (let i = 0; i < 300; i++) {
      w.step();
      for (const e of w.takeEvents()) seen.push(e.t);
    }
    expect(w.blazes.length + seen.filter((t) => t === 'blaze').length).toBeGreaterThan(3);
  });
});
