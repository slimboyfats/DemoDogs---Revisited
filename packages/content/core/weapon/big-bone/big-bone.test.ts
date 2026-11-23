import { describe, expect, it } from 'vitest';
import { NO_CONTROLS } from '@demodogs/shared';
import { armed, put } from '../../../src/testing';

describe('weapon.big-bone', () => {
  it('follows the soundest car, then lands on it: a great blast and a ring of pits', () => {
    const { w, me, rivals, def, x, y, run } = armed('weapon.big-bone');
    const t = rivals[0]!;
    put(me, x - 150, y, 0);
    put(t, x + 60, y, 0);
    const events = run(1, { ...NO_CONTROLS, fire: true });
    expect(events.find((e) => e.t === 'incoming')).toBeTruthy();
    const b = w.wild.bones[0]!;
    expect(b.target).toBe(t.index);
    // the car moves: the mark goes with it
    put(t, x + 90, y + 30, 0);
    events.push(...run(60));
    expect(Math.hypot(b.x - t.x, b.y - t.y)).toBeLessThan(4);
    expect(events.some((e) => e.t === 'explode')).toBe(false);
    events.push(...run(Math.ceil(def.arm! * 60) - 55));
    expect(w.wild.bones.length).toBe(0);
    expect(events.find((e) => e.t === 'explode')).toMatchObject({ power: def.power });
    expect(w.craters.length).toBeGreaterThan(3);
    expect(t.hp).toBeLessThan(60);
    expect(me.hp).toBe(100);
  });

  it('can be dodged once the mark has locked', () => {
    const { w, me, rivals, def, x, y, run } = armed('weapon.big-bone');
    const t = rivals[0]!;
    put(me, x - 150, y - 100, 0);
    put(t, x, y, 0);
    run(1, { ...NO_CONTROLS, fire: true });
    run(Math.ceil((def.arm! - def.fuse!) * 60) + 2);
    put(t, x + 200, y + 120, 0);
    run(60);
    expect(w.wild.bones.length).toBe(0);
    expect(t.hp).toBe(100);
  });
});
