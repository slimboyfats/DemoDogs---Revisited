import { describe, expect, it } from 'vitest';
import { World } from '@demodogs/sim';
import { put, testContent } from '../../../src/testing';

/** A venue of the bench's with a takeoff and a landing put down by hand, 150 px apart. */
function jump() {
  const T = testContent();
  const bench = T.venue.get('venue.bench')!;
  // (on flat ground, so only the jump has height)
  const venue = {
    ...bench,
    id: 'venue.bench-jump',
    relief: undefined,
    scenery: [
      {
        rule: 'place' as const,
        items: [
          { prop: 'prop.jump-takeoff', x: -200, y: 0, rot: 0 },
          { prop: 'prop.jump-landing', x: 78, y: 0, rot: 0 },
        ],
      },
    ],
  };
  const C = { ...T, venue: new Map(T.venue).set(venue.id, venue) };
  const w = new World({ content: C, venue: venue.id, car: 'car.mutt', seed: 1, rivals: 0 });
  w.phase = 'race';
  return { w, cx: bench.size.w / 2, cy: bench.size.h / 2 };
}

describe('prop.jump-takeoff', () => {
  it('raises the ground into a ramp with a sheer lip, and drives like the road', () => {
    const { w, cx, cy } = jump();
    const R = w.relief!;
    expect(R.at(cx - 260, cy)).toBeLessThan(2);
    expect(R.at(cx - 145, cy)).toBeGreaterThan(20);
    expect(R.at(cx - 120, cy)).toBe(0);
    expect(w.leaps.length).toBe(1);
    expect(w.offroad(cx - 200, cy)).toBe(false);
  });
  it('throws a fast car off its lip across the gap onto the landing', () => {
    const { w, cx, cy } = jump();
    const c = w.player;
    put(c, cx - 330, cy, 0, 260);
    let top = 0;
    let landed = -1;
    for (let t = 0; t < 60 * 3; t++) {
      w.step({ steer: 0, throttle: 1, brake: false, boost: true, fire: false });
      top = Math.max(top, c.z);
      if (c.x > cx - 136 && c.z < 0.5 && landed < 0) landed = c.x;
    }
    expect(top).toBeGreaterThan(20);
    // it came down on the landing, not in the gap
    expect(landed).toBeGreaterThan(cx + 14);
  });
});
