import { describe, expect, it } from 'vitest';
import { NO_CONTROLS } from '@demodogs/shared';
import { stand } from '@demodogs/sim';
import { loadContent } from '../../../src/index';
import { armed, put } from '../../../src/testing';

describe('weapon.choke-chain', () => {
  it('swings round the car and knocks the car beside it away', () => {
    const { w, me, rivals, def, x, y, run } = armed('weapon.choke-chain');
    const t = rivals[0]!;
    put(me, x, y, 0);
    put(t, x + 4, y + 27, 0);
    const events = run(1, { ...NO_CONTROLS, fire: true });
    const f = w.wild.flails[0]!;
    const a = f.a;
    events.push(...run(60));
    expect(f.a - a).toBeGreaterThan(6);
    expect(t.hp).toBeLessThan(100);
    expect(Math.hypot(t.x - (x + 4), t.y - (y + 22))).toBeGreaterThan(3);
    expect(events.find((e) => e.t === 'hit')).toMatchObject({ car: t.index, by: me.index });
    expect(me.hp).toBe(100);
    run(Math.ceil(def.life! * 60));
    expect(w.wild.flails.length).toBe(0);
  });

  it('smashes a crate and beats a fence down', () => {
    const C = loadContent();
    const { w, me, x, y, run } = armed('weapon.choke-chain', 0);
    put(me, x, y, 0);
    const fence = stand(w, C.prop.get('prop.plank-fence')!, x + 22, y, 0, 0);
    w.props.push({
      index: 0,
      def: loadContent().prop.get('prop.crate')!,
      x: x - 22,
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
    const events = run(1, { ...NO_CONTROLS, fire: true });
    events.push(...run(150));
    expect(w.props[0]!.alive).toBe(false);
    expect(fence.down).toBe(true);
    expect(events.map((e) => e.t)).toContain('crash');
  });
});
