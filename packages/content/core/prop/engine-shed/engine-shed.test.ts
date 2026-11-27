import { describe, expect, it } from 'vitest';
import { trekBench } from '../../../src/testing';

describe('prop.engine-shed', () => {
  it('stands at each end of a line that asks for one, its doorway facing down the line', () => {
    const w = trekBench({
      prop: 'prop.train-wagon',
      count: 2,
      points: [
        [-200, 0],
        [200, 0],
      ],
      speed: 60,
      every: 12,
      ends: 'prop.engine-shed',
    });
    const sheds = w.statics.filter((s) => s.def.id === 'prop.engine-shed');
    expect(sheds).toHaveLength(2);
    const [a, b] = sheds.sort((p, q) => p.x - q.x);
    expect(a!.x).toBeCloseTo(w.w / 2 - 200, 3);
    expect(Math.cos(a!.rot)).toBeCloseTo(1, 3);
    expect(Math.cos(b!.rot)).toBeCloseTo(-1, 3);
  });
});
