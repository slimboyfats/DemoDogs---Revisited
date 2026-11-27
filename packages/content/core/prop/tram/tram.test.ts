import { describe, expect, it } from 'vitest';
import { newSlot, slotAt, trekNear } from '@demodogs/sim';
import { trekBench } from '../../../src/testing';

const LINE = {
  prop: 'prop.tram',
  count: 2,
  gap: 14,
  points: [
    [-200, 0],
    [200, 0],
  ],
  speed: 70,
  every: 10,
};

describe('prop.tram', () => {
  it('can be read ahead: a lamp by the line knows when it is coming', () => {
    const w = trekBench(LINE);
    const x = w.w / 2;
    const y = w.h / 2 + 20;
    // some time in every round of its timetable it is at the lamp, and most of it it is not
    let busy = 0;
    for (let t = 0; t < 10; t += 0.1) if (trekNear(w, x, y, 60, 50, t)) busy++;
    expect(busy).toBeGreaterThan(5);
    expect(busy).toBeLessThan(40);
    // and what the lamp is told is where the tram then is
    const K = w.treks[0]!;
    const S = slotAt(K, 0, 0, w.time + 2, newSlot());
    for (let i = 0; i < 120; i++) w.step();
    expect(w.critters[0]!.x).toBeCloseTo(S.x, 0);
  });
});
