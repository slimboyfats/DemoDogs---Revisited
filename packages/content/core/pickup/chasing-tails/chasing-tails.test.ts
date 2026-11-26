import { describe, expect, it } from 'vitest';
import { grant } from '@demodogs/sim';
import { put, tricked } from '../../../src/testing';

const LEFT = { steer: -1, throttle: 1, brake: false, boost: false, fire: false };

describe('pickup.chasing-tails', () => {
  it("turns a rival's steering back to front until it wears off", () => {
    const turned = (dizzy: boolean, ticks: number) => {
      const { w, me, rivals, def, run } = tricked('pickup.chasing-tails', 1);
      put(me, me.x, me.y, 0, 90);
      // a rival hands it out: the player is the one in reach
      if (dizzy) expect(grant(w, rivals[0]!, def)).toBe('CHASING TAILS x1');
      run(ticks, LEFT);
      return { h: me.h, on: me.tricks.dizzy !== undefined };
    };
    const plain = turned(false, 40);
    const dizzy = turned(true, 40);
    expect(plain.h).toBeLessThan(-0.3);
    expect(dizzy.h).toBeGreaterThan(0.3);
    expect(dizzy.on).toBe(true);
    expect(turned(true, 60 * 4 + 2).on).toBe(false);
  });

  it('says so when it lands and when it lifts', () => {
    const { rivals, def, give, run, said } = tricked('pickup.chasing-tails');
    expect(give()).toBe('CHASING TAILS x2');
    expect(said(run(60 * def.seconds! + 2))).toEqual(['on', 'on', 'off', 'off']);
    expect(rivals.every((o) => !o.tricks.dizzy)).toBe(true);
  });
});
