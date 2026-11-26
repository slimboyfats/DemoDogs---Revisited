import { describe, expect, it } from 'vitest';
import { World, pumpUp } from '@demodogs/sim';
import { put, testContent } from '../../../src/testing';

/** A venue of the bench's with a pumping takeoff and a landing put down by hand, 150 px apart. */
function jump() {
  const T = testContent();
  const bench = T.venue.get('venue.bench')!;
  const venue = {
    ...bench,
    id: 'venue.bench-pump',
    relief: undefined,
    scenery: [
      {
        rule: 'place' as const,
        items: [
          { prop: 'prop.pump-takeoff', x: -200, y: 0, rot: 0 },
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

/** Come up it flat out with boost, timed to reach the lip while the flap is up, or flat: how far it flew. */
function fly(up: boolean): number {
  const { w, cx, cy } = jump();
  const s = w.leaps[0]!;
  for (let t = 0; t < 600; t++) {
    if ([0.8, 1, 1.2].every((d) => pumpUp(w, s, w.time + d) === up)) break;
    w.step();
  }
  const c = w.player;
  put(c, cx - 200 - 64 - 124, cy, 0, 150);
  let far = 0;
  for (let t = 0; t < 60 * 4; t++) {
    w.step({ steer: 0, throttle: 1, brake: false, boost: c.x < cx - 136, fire: false });
    if (c.x > cx - 136 && c.z > 1) far = c.x - (cx - 136);
    if (far > 0 && c.z < 0.5) break;
  }
  return far;
}

describe('prop.pump-takeoff', () => {
  it('pumps on a beat: up for more than half of it', () => {
    const { w } = jump();
    const s = w.leaps[0]!;
    const P = s.def.leap!.pump!;
    let up = 0;
    const n = Math.round(P.period * 50);
    for (let k = 0; k < n; k++) if (pumpUp(w, s, k / 50)) up++;
    expect(up / n).toBeCloseTo(P.up / P.period, 1);
    expect(up / n).toBeGreaterThan(0.5);
  });
  it('throws a boosted car over a gap of 150 px with the flap up, and short with it flat', () => {
    expect(fly(true)).toBeGreaterThan(150);
    expect(fly(false)).toBeLessThan(140);
  });
});
