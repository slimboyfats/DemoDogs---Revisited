import { describe, expect, it } from 'vitest';
import { putProp } from '@demodogs/sim';
import { flatBench, runUntil } from '@demodogs/content/testing';
import { arcDots } from './arc-fx';

describe('arcDots', () => {
  it('draws nothing until something is thrown, then its path and a ring where it lands', () => {
    const w = flatBench();
    expect(arcDots(w)).toHaveLength(0);
    putProp(w, w.content.prop.get('prop.ball-launcher')!, w.w / 2, w.h / 2, 0, w.rng);
    let tx = 0;
    runUntil(
      w,
      () => {
        for (const e of w.takeEvents()) if (e.t === 'throw') tx = e.tx;
        return tx !== 0;
      },
      60 * 6,
    );
    runUntil(w, () => false, 12);
    const dots = arcDots(w);
    expect(dots.length).toBeGreaterThan(12);
    // the ring lies on the ground round the landing spot
    const ring = dots.filter((d) => d.z > 0.3 && d.z < 1);
    expect(ring.length).toBe(18);
    for (const d of ring) expect(Math.abs(d.x - tx)).toBeLessThan(26);
    // with a dark shadow inside it
    expect(dots.filter((d) => d.z < 0.3).length).toBeGreaterThan(10);
    // and the rest hang in the air
    expect(dots.some((d) => d.z > 20)).toBe(true);
  });
});
