import { describe, expect, it } from 'vitest';
import { NO_CONTROLS } from '@demodogs/shared';
import { armed, put } from '../../../src/testing';

describe('weapon.leash', () => {
  it('hooks the car ahead and hauls the two together, then the line parts', () => {
    const { w, me, rivals, def, x, y, run } = armed('weapon.leash');
    const t = rivals[0]!;
    put(me, x - 60, y, 0);
    put(t, x + 60, y, 0);
    const events = run(1, { ...NO_CONTROLS, fire: true });
    for (let i = 0; i < 60 && !w.arsenal.tethers.length; i++) events.push(...run(1));
    expect(events.find((e) => e.t === 'leash')).toMatchObject({ from: me.index, to: t.index });
    expect(w.arsenal.tethers.length).toBe(1);
    const [mx, tx] = [me.x, t.x];
    events.push(...run(40));
    // the hooked car comes back, the thrower goes on
    expect(t.x).toBeLessThan(tx - 2);
    expect(me.x).toBeGreaterThan(mx + 2);
    events.push(...run(Math.ceil(def.life! * 60) + 10));
    expect(w.arsenal.tethers.length).toBe(0);
    expect(events.map((e) => e.t)).toContain('snap');
  });

  it('thrown at nothing, the hook runs out of line', () => {
    const { w, me, x, y, run } = armed('weapon.leash');
    put(me, x, y, 0);
    const events = run(60, { ...NO_CONTROLS, fire: true });
    expect(w.arsenal.tethers.length).toBe(0);
    expect(events.map((e) => e.t)).toContain('fizz');
  });
});
