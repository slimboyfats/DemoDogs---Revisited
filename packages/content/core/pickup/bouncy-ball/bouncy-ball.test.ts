import { describe, expect, it } from 'vitest';
import { put, tricked } from '../../../src/testing';

describe('pickup.bouncy-ball', () => {
  it('flings off whatever touches the car, and keeps the car where it was', () => {
    const hit = (bouncy: boolean) => {
      const { me, rivals, give, run, said } = tricked('pickup.bouncy-ball', 1);
      const o = rivals[0]!;
      if (bouncy) expect(give()).toBe('BOUNCY BALL 8s');
      // the rival comes at the player from in front
      put(o, me.x + 50, me.y, Math.PI, 90);
      let away = 0;
      const ev = [];
      for (let i = 0; i < 40; i++) {
        ev.push(...run(1));
        away = Math.max(away, o.vx);
      }
      return { me, o, away, uses: said(ev).filter((s) => s === 'use').length, x: me.x };
    };
    const plain = hit(false);
    const bouncy = hit(true);
    expect(bouncy.uses).toBeGreaterThan(0);
    expect(plain.uses).toBe(0);
    expect(bouncy.away).toBeGreaterThan(150);
    expect(bouncy.away).toBeGreaterThan(plain.away * 2);
    expect(bouncy.o.hp).toBeLessThan(100);
  });

  it('wears off', () => {
    const { me, def, give, run, said } = tricked('pickup.bouncy-ball');
    give();
    expect(said(run(60 * def.seconds! + 2))).toEqual(['on', 'off']);
    expect(me.tricks.bumper).toBeUndefined();
  });
});
