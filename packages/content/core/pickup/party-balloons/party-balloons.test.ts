import { describe, expect, it } from 'vitest';
import { grant } from '@demodogs/sim';
import { loadContent } from '../../../src/index';
import { tricked } from '../../../src/testing';

const GO = { steer: 0, throttle: 1, brake: false, boost: false, fire: false };

describe('pickup.party-balloons', () => {
  it('hangs every rival in reach in the air, then drops them, and it costs them', () => {
    const { w, me, rivals, def, run, said, give } = tricked('pickup.party-balloons');
    expect(give()).toBe('PARTY BALLOONS x2');
    const ev = run(60);
    for (const o of rivals) {
      expect(o.tricks.balloons?.by).toBe(me.index);
      expect(o.z).toBeGreaterThan(def.lift! * 0.8);
      expect(o.z).toBeLessThan(def.lift! * 1.3);
    }
    expect(me.z).toBe(0);
    ev.push(...run(60 * def.seconds!));
    for (const o of rivals) {
      expect(o.tricks.balloons).toBeUndefined();
      expect(o.z).toBeLessThan(1);
      expect(o.hp).toBeLessThan(100);
    }
    expect(said(ev)).toEqual(['on', 'on', 'off', 'off']);
    expect(w.cars.every((c) => !c.wrecked)).toBe(true);
  });

  it('leaves a car on balloons with no grip on the road', () => {
    const { w, me, def, run } = tricked('pickup.party-balloons');
    const o = w.cars.find((c) => !c.isPlayer)!;
    // a rival hands it out: the player is the one in reach
    for (const c of w.cars) if (c !== me && c !== o) c.x += 2000;
    o.x = me.x - 60;
    o.y = me.y;
    grant(w, o, def);
    expect(me.tricks.balloons).toBeDefined();
    run(20);
    const x = me.x;
    run(60, GO);
    expect(Math.abs(me.x - x)).toBeLessThan(6);
  });

  it('is stopped by a shield bubble, and does nothing with nobody in reach', () => {
    const { rivals, w, give } = tricked('pickup.party-balloons');
    grant(w, rivals[0]!, loadContent().pickup.get('pickup.dome')!);
    rivals[1]!.x += 2000;
    expect(give()).toBe('PARTY BALLOONS: NOBODY IN REACH');
    expect(rivals[0]!.tricks.balloons).toBeUndefined();
  });
});
