import { describe, expect, it } from 'vitest';
import { NO_CONTROLS } from '@demodogs/shared';
import { stand } from '@demodogs/sim';
import { loadContent } from '../../../src/index';
import { armed, put } from '../../../src/testing';

describe('weapon.dig', () => {
  it('splits the ground in a line of pits and throws the car on it into the air', () => {
    const { w, me, rivals, x, y, run } = armed('weapon.dig');
    const t = rivals[0]!;
    put(me, x - 120, y, 0);
    put(t, x - 30, y, 0);
    const events = run(1, { ...NO_CONTROLS, fire: true });
    let top = 0;
    for (let i = 0; i < 90; i++) {
      events.push(...run(1));
      top = Math.max(top, t.z);
    }
    expect(w.wild.cracks.length).toBe(0);
    const pits = events.filter((e) => e.t === 'crack');
    expect(pits.length).toBeGreaterThan(12);
    expect(w.craters.length).toBeGreaterThan(8);
    expect(top).toBeGreaterThan(8);
    expect(t.hp).toBeLessThan(100);
    expect(events.find((e) => e.t === 'hit')).toMatchObject({ car: t.index, by: me.index });
    expect(me.hp).toBe(100);
  });

  it('brings down the wall it runs under', () => {
    const C = loadContent();
    const { w, me, x, y, run } = armed('weapon.dig', 0);
    put(me, x - 120, y, 0);
    const walls = [0, 1, 2].map((i) =>
      stand(w, C.prop.get('prop.brick-wall')!, x - 60, y - 8 + i * 8, 0, 0),
    );
    w.props.push({
      index: 0,
      def: loadContent().prop.get('prop.crate')!,
      x: x - 90,
      y: y,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      rot: 0,
      spin: 0,
      alive: true,
      fuse: 0,
      owner: -1,
    });
    run(1, { ...NO_CONTROLS, fire: true });
    run(60);
    expect(walls.some((s) => s.down)).toBe(true);
    expect(w.props[0]!.alive).toBe(false);
  });
});
