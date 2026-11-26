import { describe, expect, it } from 'vitest';
import { BASE_SPEED } from '@demodogs/shared';
import { grant } from '@demodogs/sim';
import { bench, tricked } from '../../../src/testing';
import { loadContent } from '../../../src/index';

const def = () => loadContent().pickup.get('pickup.greyhound')!;

describe('pickup.greyhound', () => {
  it('drives itself down the road, faster than the car can go, with nobody at the wheel', () => {
    const w = bench();
    const c = w.player;
    for (let i = 0; i < 20; i++) w.step();
    const p0 = c.progress;
    expect(grant(w, c, def())).toBe('GREYHOUND 4s');
    let top = 0;
    for (let i = 0; i < 60 * def().seconds!; i++) {
      w.step();
      top = Math.max(top, c.vf);
      expect(w.offroad(c.x, c.y)).toBe(false);
    }
    expect(top).toBeGreaterThan(BASE_SPEED * c.stats.speed * 1.2);
    expect(c.progress - p0).toBeGreaterThan(450);
    w.step();
    expect(c.tricks.dash).toBeUndefined();
    expect(c.pace).toBe(1);
  });

  it('throws what it strikes out of its way, and is not hurt doing it', () => {
    const { me, rivals, give, run, said } = tricked('pickup.greyhound', 1);
    const o = rivals[0]!;
    o.x = me.x + 120;
    give();
    const ev = run(90);
    expect(said(ev)).toContain('use');
    expect(o.hp).toBeLessThan(100);
    expect(me.hp).toBe(100);
    expect(Math.hypot(o.x - me.x, o.y - me.y)).toBeGreaterThan(20);
    expect(ev.some((e) => e.t === 'hit' && e.car === me.index)).toBe(false);
  });
});
