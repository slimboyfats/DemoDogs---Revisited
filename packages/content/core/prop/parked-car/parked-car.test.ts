import { describe, expect, it } from 'vitest';
import { explode, stand } from '@demodogs/sim';
import { flatBench, propTest } from '../../../src/testing';

describe('prop.parked-car', () => {
  it('is solid: a car driving into it bounces off', () => {
    expect(propTest('prop.parked-car', 90).blocked).toBe(true);
  });

  it('goes up in a blast of its own once it is wrecked', () => {
    const w = flatBench();
    const s = stand(w, w.content.prop.get('prop.parked-car')!, w.oval!.cx, w.oval!.cy, 0, 0);
    const own: number[] = [];
    for (let k = 0; k < 20 && !s.down; k++) {
      explode(w, s.x + 12, s.y, 1.2, null);
      for (const e of w.takeEvents()) if (e.t === 'explode' && e.x === s.x) own.push(e.power);
    }
    expect(s.down).toBe(true);
    expect(own).toEqual([0.9]);
  });
});
