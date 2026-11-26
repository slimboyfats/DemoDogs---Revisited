import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import { tricked } from '../../../src/testing';

describe('pickup.sticky-paws', () => {
  it('takes the weapon off the nearest armed rival, rounds and all', () => {
    const { me, rivals, give, run } = tricked('pickup.sticky-paws');
    const rocket = loadContent().weapon.get('weapon.rocket')!;
    // the nearer one is empty-handed: the paws go on past it
    rivals[1]!.weapon = rocket;
    rivals[1]!.ammo = 3;
    expect(give()).toBe(`STOLE ${rocket.meta.name.toUpperCase()} x3`);
    expect(me.weapon).toBe(rocket);
    expect(me.ammo).toBe(3);
    expect(rivals[1]!.weapon).toBeNull();
    const e = run(1).find((e) => e.t === 'trick');
    expect(e).toMatchObject({ kind: 'steal', what: 'use', car: me.index, to: rivals[1]!.index });
  });

  it("with nobody armed takes the nearest rival's boost and some of its rounds", () => {
    const { me, rivals, def, give } = tricked('pickup.sticky-paws');
    const o = rivals[0]!;
    me.nitro = 0.2;
    me.rounds = 0;
    o.rounds = 50;
    o.nitro = 0.6;
    expect(give()).toBe(`STOLE BOOST + AMMO ${def.amount}`);
    expect(me.rounds).toBe(def.amount);
    expect(o.rounds).toBe(50 - def.amount!);
    expect(me.nitro).toBeCloseTo(0.8, 9);
    expect(o.nitro).toBe(0);
  });

  it('finds nobody when every rival is out of reach', () => {
    const { w, me, give } = tricked('pickup.sticky-paws');
    for (const c of w.cars) if (c !== me) c.wrecked = true;
    expect(give()).toBe('STICKY PAWS: NOBODY IN REACH');
  });
});
