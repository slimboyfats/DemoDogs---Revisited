import { describe, expect, it } from 'vitest';
import { NO_CONTROLS } from '@demodogs/shared';
import { armed, put } from '../../../src/testing';

describe('weapon.fleas', () => {
  it('hop to the rival, cling on and bite; a jump shakes them off', () => {
    const { w, me, rivals, def, x, y, run } = armed('weapon.fleas');
    const t = rivals[0]!;
    put(me, x - 50, y, 0);
    put(t, x + 30, y + 20, 0);
    const events = run(1, { ...NO_CONTROLS, fire: true });
    expect(w.arsenal.fleas.length).toBe(def.count);
    events.push(...run(90));
    const on = w.arsenal.fleas.filter((f) => f.host === t.index).length;
    expect(on).toBeGreaterThan(3);
    expect(events.filter((e) => e.t === 'flea').length).toBe(on);
    events.push(...run(120));
    expect(t.hp).toBeLessThan(100);
    expect(me.hp).toBe(100);
    const hit = events.find((e) => e.t === 'hit');
    expect(hit).toMatchObject({ car: t.index, by: me.index });
    t.z = 30;
    run(1);
    expect(w.arsenal.fleas.filter((f) => f.host === t.index).length).toBe(0);
  });

  it('with no one in reach they mill about and die off', () => {
    const { w, me, def, x, y, run } = armed('weapon.fleas', 0);
    put(me, x, y, 0);
    run(1, { ...NO_CONTROLS, fire: true });
    expect(w.arsenal.fleas.length).toBe(def.count);
    run(Math.ceil(def.fuse! * 60) + 2);
    expect(w.arsenal.fleas.length).toBe(0);
  });
});
