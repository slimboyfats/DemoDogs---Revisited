import { describe, expect, it } from 'vitest';
import { explode } from '@demodogs/sim';
import { trekBench } from '../../../src/testing';

const LINE = {
  prop: 'prop.train-wagon',
  lead: 'prop.steam-engine',
  count: 4,
  gap: 14,
  points: [
    [-220, 0],
    [220, 0],
  ],
  speed: 60,
  every: 12,
};

describe('prop.train-wagon', () => {
  it('follows the engine in line, each a wagon length behind the one in front', () => {
    const w = trekBench(LINE);
    for (let i = 0; i < 180; i++) w.step();
    const [e, a, b] = w.critters;
    expect(a!.def.id).toBe('prop.train-wagon');
    expect(e!.x - a!.x).toBeCloseTo(14, 3);
    expect(a!.x - b!.x).toBeCloseTo(14, 3);
  });
  it('is not thrown about by a blast', () => {
    const w = trekBench(LINE);
    for (let i = 0; i < 120; i++) w.step();
    const a = w.critters[1]!;
    explode(w, a.x, a.y + 6, 2, null);
    for (let i = 0; i < 30; i++) w.step();
    expect(a.z).toBe(0);
    expect(a.y).toBeCloseTo(w.h / 2, 3);
  });
});
