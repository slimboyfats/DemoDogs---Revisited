import { describe, expect, it } from 'vitest';
import { NO_CONTROLS } from '@demodogs/shared';
import { armed, put } from '../../../src/testing';

describe('weapon.chew-toy', () => {
  it('skips four times down an empty road, a blast at each bounce', () => {
    const { w, me, x, y, run } = armed('weapon.chew-toy');
    put(me, x - 150, y, 0);
    const events = run(1, { ...NO_CONTROLS, fire: true });
    expect(w.arsenal.toys.length).toBe(1);
    for (let i = 0; i < 300 && w.arsenal.toys.length; i++) events.push(...run(1));
    const blasts = events.filter((e) => e.t === 'explode');
    expect(blasts.length).toBe(4);
    // each one further down the road than the last
    const xs = blasts.map((e) => (e.t === 'explode' ? e.x : 0));
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    expect(xs[3]! - xs[0]!).toBeGreaterThan(120);
  });

  it('goes off on a car it meets low down', () => {
    const { w, me, rivals, x, y, run } = armed('weapon.chew-toy');
    put(me, x - 100, y, 0);
    put(rivals[0]!, x, y, 0);
    run(1, { ...NO_CONTROLS, fire: true });
    for (let i = 0; i < 300 && w.arsenal.toys.length; i++) run(1);
    expect(rivals[0]!.hp).toBeLessThan(100);
  });
});
