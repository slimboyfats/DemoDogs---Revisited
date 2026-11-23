import { describe, expect, it } from 'vitest';
import { NO_CONTROLS } from '@demodogs/shared';
import { armed, put } from '../../../src/testing';

describe('weapon.hot-paws', () => {
  it('lays a line of fire behind the moving car that burns whoever follows', () => {
    const { w, me, rivals, def, x, y, run } = armed('weapon.hot-paws');
    const t = rivals[0]!;
    put(me, x - 150, y, 0, 150);
    put(t, x + 200, y + 150, 0);
    const events = run(1, { ...NO_CONTROLS, throttle: 1, fire: true });
    expect(w.arsenal.trails.length).toBe(1);
    events.push(...run(90, { ...NO_CONTROLS, throttle: 1 }));
    const fires = events.filter((e) => e.t === 'blaze');
    expect(fires.length).toBeGreaterThan(8);
    for (const b of w.blazes) expect(b.x).toBeLessThan(me.x);
    expect(me.hp).toBe(100);
    // a car standing in it burns, and the fire is the layer's
    const b = w.blazes[w.blazes.length - 1]!;
    put(t, b.x, b.y, 0);
    events.length = 0;
    events.push(...run(40, { ...NO_CONTROLS, throttle: 1 }));
    expect(t.hp).toBeLessThan(100);
    expect(events.find((e) => e.t === 'hit')).toMatchObject({ car: t.index, by: me.index });
    run(Math.ceil(def.life! * 60));
    expect(w.arsenal.trails.length).toBe(0);
  });

  it('a parked car lays nothing', () => {
    const { w, me, x, y, run } = armed('weapon.hot-paws', 0);
    put(me, x, y, 0);
    run(30, { ...NO_CONTROLS, fire: true });
    expect(w.blazes.length).toBe(0);
  });
});
