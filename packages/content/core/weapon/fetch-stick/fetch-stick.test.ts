import { describe, expect, it } from 'vitest';
import { NO_CONTROLS } from '@demodogs/shared';
import { stand } from '@demodogs/sim';
import { loadContent } from '../../../src/index';
import { armed, put } from '../../../src/testing';

describe('weapon.fetch-stick', () => {
  it('cuts the car ahead, comes back and is caught: the round is yours again', () => {
    const { w, me, rivals, x, y, run } = armed('weapon.fetch-stick');
    put(me, x - 60, y, 0);
    put(rivals[0]!, x + 30, y, 0);
    const events = run(1, { ...NO_CONTROLS, fire: true });
    expect(me.ammo).toBe(1);
    expect(w.arsenal.sticks.length).toBe(1);
    let far = 0;
    for (let i = 0; i < 300 && w.arsenal.sticks.length; i++) {
      far = Math.max(far, w.arsenal.sticks[0]!.x - me.x);
      events.push(...run(1));
    }
    expect(far).toBeGreaterThan(120);
    expect(rivals[0]!.hp).toBeLessThan(100);
    expect(events.map((e) => e.t)).toContain('catch');
    expect(me.ammo).toBe(2);
  });

  it('thrown with the last round, it is back in the rack when caught', () => {
    const { w, me, def, x, y, run } = armed('weapon.fetch-stick');
    put(me, x, y, 0);
    me.ammo = 1;
    run(1, { ...NO_CONTROLS, fire: true });
    expect(me.weapon).toBeNull();
    for (let i = 0; i < 300 && w.arsenal.sticks.length; i++) run(1);
    expect(me.weapon).toBe(def);
    expect(me.ammo).toBe(1);
  });

  it('goes through a plank fence and a crate, and clatters off a rock', () => {
    const C = loadContent();
    const { w, me, x, y, run } = armed('weapon.fetch-stick');
    put(me, x - 60, y, 0);
    const fence = stand(w, C.prop.get('prop.plank-fence')!, x - 20, y, 0, 0);
    const rock = stand(w, C.prop.get('prop.rock')!, x + 30, y, 0, 0);
    const events = run(1, { ...NO_CONTROLS, fire: true });
    for (let i = 0; i < 120 && w.arsenal.sticks.length; i++) events.push(...run(1));
    expect(fence.down).toBe(true);
    expect(rock.down).toBeFalsy();
    expect(events.map((e) => e.t)).toContain('fizz');
    expect(events.map((e) => e.t)).not.toContain('catch');
  });
});
