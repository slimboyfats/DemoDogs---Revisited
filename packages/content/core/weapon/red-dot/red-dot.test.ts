import { describe, expect, it } from 'vitest';
import { NO_CONTROLS } from '@demodogs/shared';
import { stand } from '@demodogs/sim';
import { loadContent } from '../../../src/index';
import { armed, put } from '../../../src/testing';

describe('weapon.red-dot', () => {
  it('burns the car it rests on for as long as it is held', () => {
    const { w, me, rivals, def, x, y, run } = armed('weapon.red-dot');
    const t = rivals[0]!;
    put(me, x - 60, y, 0);
    put(t, x + 30, y, 0);
    const events = run(1, { ...NO_CONTROLS, fire: true });
    expect(events.find((e) => e.t === 'beam')).toMatchObject({ car: me.index, on: true });
    events.push(...run(30));
    const b = w.arsenal.beams[0]!;
    expect(b.on).toBe(t.index);
    expect(b.tx).toBeLessThan(t.x);
    events.push(...run(Math.ceil(def.life! * 60)));
    expect(w.arsenal.beams.length).toBe(0);
    expect(events.find((e) => e.t === 'beam' && !e.on)).toBeTruthy();
    expect(100 - t.hp).toBeGreaterThan(15);
    expect(me.hp).toBe(100);
  });

  it('eats through a plank fence, then reaches what was behind it', () => {
    const C = loadContent();
    const { w, me, rivals, x, y, run } = armed('weapon.red-dot');
    const t = rivals[0]!;
    put(me, x - 60, y, 0);
    put(t, x + 60, y, 0);
    const fence = stand(w, C.prop.get('prop.plank-fence')!, x - 10, y, 0, 0);
    w.props.push({
      index: 0,
      def: C.prop.get('prop.crate')!,
      x: x + 20,
      y,
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
    const events = run(1, { ...NO_CONTROLS, fire: true });
    expect(w.arsenal.beams[0]!.on).toBe(-1);
    for (let i = 0; i < 90 && !fence.down; i++) events.push(...run(1));
    expect(fence.down).toBe(true);
    expect(events.map((e) => e.t)).toContain('fall');
    events.push(...run(12));
    expect(w.props[0]!.alive).toBe(false);
    expect(w.arsenal.beams[0]!.on).toBe(t.index);
  });

  it('bites into a brick wall', () => {
    const C = loadContent();
    const { w, me, x, y, run } = armed('weapon.red-dot', 0);
    put(me, x - 60, y, 0);
    const wall = stand(w, C.prop.get('prop.brick-wall')!, x - 10, y, 0, 0);
    const hp = wall.hp!;
    const events = run(1, { ...NO_CONTROLS, fire: true });
    events.push(...run(40));
    expect(events.map((e) => e.t)).toContain('chip');
    expect(wall.hp).toBeLessThan(hp);
    expect(w.arsenal.beams[0]!.tx).toBeLessThan(wall.x);
  });
});
