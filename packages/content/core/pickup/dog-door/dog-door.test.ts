import { describe, expect, it } from 'vitest';
import { grant } from '@demodogs/sim';
import { loadContent } from '../../../src/index';
import { makeWorld, startRace, tricked } from '../../../src/testing';

const def = () => loadContent().pickup.get('pickup.dog-door')!;

describe('pickup.dog-door', () => {
  it('in a race puts the car up the road, further for the car at the back', () => {
    const w = startRace(makeWorld());
    for (let i = 0; i < 30; i++) w.step();
    const order = w.standings();
    const last = order[order.length - 1]!;
    const first = order[0]!;
    const jump = (c: typeof last) => {
      const p0 = c.progress;
      w.takeEvents();
      expect(grant(w, c, def())).toBe('DOG DOOR');
      w.step();
      const e = w.takeEvents().find((e) => e.t === 'trick');
      expect(e).toMatchObject({ kind: 'door', what: 'use', car: c.index });
      return c.progress - p0;
    };
    const back = jump(last);
    const front = jump(first);
    expect(back).toBeGreaterThan(def().reach! * 1.2);
    expect(front).toBeGreaterThan(def().reach! * 0.6);
    expect(back).toBeGreaterThan(front + 100);
    // it comes out on the road, moving, the right way round
    expect(w.offroad(last.x, last.y)).toBe(false);
    expect(last.vf).toBeGreaterThan(100);
  });

  it('counts the lap when the way out is over the line', () => {
    const w = startRace(makeWorld());
    const c = w.player;
    const T = w.track!;
    w.placeOnTrack(c, T.n - 2, 0);
    w.step();
    const lap = c.lap;
    grant(w, c, def());
    w.step();
    expect(c.lap).toBe(lap + 1);
    expect(c.idx).toBeLessThan(T.n / 2);
  });

  it('in a derby comes out right behind the nearest rival, pointing at it and moving', () => {
    const { me, rivals, give, run } = tricked('pickup.dog-door');
    const o = rivals[0]!;
    o.x = me.x + 200;
    rivals[1]!.x = me.x + 300;
    expect(give()).toBe('DOG DOOR');
    expect(Math.hypot(me.x - o.x, me.y - o.y)).toBeLessThan(45);
    expect(me.x).toBeLessThan(o.x);
    expect(me.h).toBeCloseTo(o.h, 5);
    const hp = o.hp;
    run(40);
    expect(o.hp).toBeLessThan(hp);
  });
});
