import { describe, expect, it } from 'vitest';
import { tricked } from '../../../src/testing';

describe('pickup.belly-flop', () => {
  it('leaps onto the nearest rival and comes down as a blast it walks away from', () => {
    const { me, rivals, give, run, said } = tricked('pickup.belly-flop', 1);
    const o = rivals[0]!;
    o.x = me.x + 110;
    expect(give()).toBe('BELLY FLOP');
    let top = 0;
    const ev = [];
    for (let i = 0; i < 100; i++) {
      ev.push(...run(1));
      top = Math.max(top, me.z);
      if (said(ev).includes('use')) break;
    }
    expect(top).toBeGreaterThan(50);
    expect(said(ev)).toEqual(['on', 'use']);
    const boom = ev.find((e) => e.t === 'explode') as { x: number; y: number };
    expect(Math.hypot(boom.x - o.x, boom.y - o.y)).toBeLessThan(30);
    expect(o.hp).toBeLessThan(100);
    expect(me.hp).toBe(100);
    expect(me.tricks.flop).toBeUndefined();
    run(120);
    expect(me.z).toBeLessThan(1);
    expect(me.wrecked).toBe(false);
  });

  it('lands where the car was going when nobody is near', () => {
    const { w, me, rivals, give, run } = tricked('pickup.belly-flop', 1);
    rivals[0]!.x += 2000;
    const x = me.x;
    give();
    const ev = run(100);
    expect(ev.some((e) => e.t === 'explode' && Math.abs(e.x - x) < 5)).toBe(true);
    expect(w.craters.length).toBeGreaterThan(0);
  });
});
