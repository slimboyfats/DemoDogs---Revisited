import { describe, expect, it } from 'vitest';
import { NO_CONTROLS } from '@demodogs/shared';
import { stand } from '@demodogs/sim';
import { loadContent } from '../../../src/index';
import { armed, put } from '../../../src/testing';

describe('weapon.mole', () => {
  it('runs under a wall, turns after a car and comes up underneath it', () => {
    const { w, me, rivals, x, y, run } = armed('weapon.mole');
    const t = rivals[0]!;
    put(me, x - 110, y, 0);
    put(t, x + 60, y + 30, 0);
    const wall = stand(w, loadContent().prop.get('prop.concrete-wall')!, x - 40, y, 0, 0);
    const events = run(1, { ...NO_CONTROLS, fire: true });
    expect(w.arsenal.moles.length).toBe(1);
    let top = 0;
    for (let i = 0; i < 300 && (w.arsenal.moles.length || i < 100); i++) {
      events.push(...run(1));
      top = Math.max(top, t.z);
    }
    expect(w.arsenal.moles.length).toBe(0);
    expect(wall.down).toBeFalsy();
    expect(events.map((e) => e.t)).toContain('explode');
    expect(top).toBeGreaterThan(8);
    expect(t.hp).toBeLessThan(100);
  });

  it('with no one to find it comes up when it has run its time', () => {
    const { w, me, def, x, y, run } = armed('weapon.mole', 0);
    put(me, x - 150, y, 0);
    const events = run(Math.ceil(def.life! * 60) + 5, { ...NO_CONTROLS, fire: true });
    expect(w.arsenal.moles.length).toBe(0);
    expect(events.filter((e) => e.t === 'explode').length).toBeGreaterThan(0);
  });
});
