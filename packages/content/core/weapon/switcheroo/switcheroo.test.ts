import { describe, expect, it } from 'vitest';
import { NO_CONTROLS } from '@demodogs/shared';
import { armed, put } from '../../../src/testing';

describe('weapon.switcheroo', () => {
  it('changes places with the car it strikes, speed and heading and all', () => {
    const { w, me, rivals, x, y, run } = armed('weapon.switcheroo');
    const t = rivals[0]!;
    put(me, x - 60, y, 0);
    put(t, x + 60, y + 25, 1.2);
    const events = run(1, { ...NO_CONTROLS, fire: true });
    expect(w.arsenal.bolts.length).toBe(1);
    for (let i = 0; i < 60 && w.arsenal.bolts.length; i++) events.push(...run(1));
    const e = events.find((e) => e.t === 'swap');
    expect(e).toMatchObject({ a: me.index, b: t.index });
    expect(Math.hypot(me.x - (x + 60), me.y - (y + 25))).toBeLessThan(6);
    expect(Math.hypot(t.x - (x - 60), t.y - y)).toBeLessThan(6);
    expect(me.h).toBeCloseTo(1.2, 1);
    expect(t.h).toBeCloseTo(0, 1);
    expect(me.hp).toBe(100);
    expect(t.hp).toBe(100);
  });

  it('fizzles out with nobody to strike', () => {
    const { w, me, x, y, run } = armed('weapon.switcheroo', 0);
    put(me, x - 100, y, 0);
    const events = run(1, { ...NO_CONTROLS, fire: true });
    events.push(...run(60));
    expect(w.arsenal.bolts.length).toBe(0);
    expect(events.map((e) => e.t)).toContain('fizz');
    expect(events.map((e) => e.t)).not.toContain('swap');
  });
});
