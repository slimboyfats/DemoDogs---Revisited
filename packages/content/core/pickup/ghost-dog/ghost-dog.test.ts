import { describe, expect, it } from 'vitest';
import { put, tricked } from '../../../src/testing';

describe('pickup.ghost-dog', () => {
  it('lets a rival drive straight through the car without a mark on either', () => {
    const pass = (ghost: boolean) => {
      const { me, rivals, give, run } = tricked('pickup.ghost-dog', 1);
      const o = rivals[0]!;
      // (no rounds in the gun: the only marks would be from the two meeting)
      me.rounds = 0;
      if (ghost) expect(give()).toBe('GHOST DOG 6s');
      put(o, me.x + 60, me.y, Math.PI, 120);
      const ev = [];
      for (let i = 0; i < 50; i++) {
        o.vx = -120;
        o.vy = 0;
        ev.push(...run(1));
      }
      return { me, o, x: me.x, crashes: ev.filter((e) => e.t === 'crash').length };
    };
    const plain = pass(false);
    const ghost = pass(true);
    expect(plain.crashes).toBeGreaterThan(0);
    expect(ghost.crashes).toBe(0);
    // the rival came out the other side, and the ghost never moved
    expect(ghost.o.x).toBeLessThan(ghost.me.x - 20);
    expect(ghost.me.hp).toBe(100);
    expect(ghost.o.hp).toBe(100);
    expect(plain.me.hp).toBeLessThan(100);
  });

  it('cannot be hurt by a blast, and is solid again when it wears off', () => {
    const { w, me, def, give, run, said } = tricked('pickup.ghost-dog');
    give();
    run(5);
    w.takeEvents();
    const ev = run(60 * def.seconds! + 2);
    expect(me.hp).toBe(100);
    expect(said(ev)).toEqual(['off']);
    expect(me.tricks.ghost).toBeUndefined();
    run(10);
    expect(me.invuln).toBe(0);
  });
});
