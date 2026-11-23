import { describe, expect, it } from 'vitest';
import { NO_CONTROLS } from '@demodogs/shared';
import { armed, put } from '../../../src/testing';

describe('weapon.dog-pile', () => {
  it('marks six shells on the car ahead, and they land one after another', () => {
    const { w, me, rivals, def, x, y, run } = armed('weapon.dog-pile');
    const t = rivals[0]!;
    put(me, x - 100, y, 0);
    put(t, x + 40, y, 0);
    const events = run(1, { ...NO_CONTROLS, fire: true });
    const marks = events.filter((e) => e.t === 'incoming');
    expect(marks.length).toBe(def.count);
    expect(w.arsenal.strikes.length).toBe(def.count);
    // nothing lands before the warning is up
    events.push(...run(Math.floor(def.arm! * 60) - 3));
    expect(events.some((e) => e.t === 'explode')).toBe(false);
    events.push(...run(140));
    expect(events.filter((e) => e.t === 'explode').length).toBeGreaterThanOrEqual(def.count!);
    expect(w.arsenal.strikes.length).toBe(0);
    expect(t.hp).toBeLessThan(100);
    expect(me.hp).toBe(100);
  });

  it('with nobody ahead the row comes down out in front', () => {
    const { me, x, y, run } = armed('weapon.dog-pile');
    put(me, x - 100, y, 0);
    const marks = run(1, { ...NO_CONTROLS, fire: true }).filter((e) => e.t === 'incoming');
    for (const m of marks) if (m.t === 'incoming') expect(m.x).toBeGreaterThan(me.x + 60);
  });
});
