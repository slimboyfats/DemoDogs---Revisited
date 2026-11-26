import { describe, expect, it } from 'vitest';
import { tricked } from '../../../src/testing';

describe('pickup.best-friends', () => {
  it('hauls the nearest rival and the car nearest to it together', () => {
    const { rivals, def, give, run, said } = tricked('pickup.best-friends');
    const [a, b] = rivals as [(typeof rivals)[0], (typeof rivals)[0]];
    b.x = a.x + 150;
    const far = () => Math.hypot(a.x - b.x, a.y - b.y);
    const d0 = far();
    expect(give()).toBe(`BEST FRIENDS: ${a.name} + ${b.name}`);
    expect(a.tricks.pair?.to).toBe(b.index);
    expect(b.tricks.pair?.to).toBe(a.index);
    const ev = run(90);
    expect(far()).toBeLessThan(d0 * 0.4);
    // they came together hard enough to hurt
    expect(a.hp + b.hp).toBeLessThan(200);
    ev.push(...run(60 * def.seconds!));
    expect(a.tricks.pair).toBeUndefined();
    expect(b.tricks.pair).toBeUndefined();
    expect(said(ev)).toEqual(['on', 'off']);
  });

  it('ties a lone rival to the car that threw it', () => {
    const { me, rivals, give } = tricked('pickup.best-friends', 1);
    expect(give()).toBe(`BEST FRIENDS: ${rivals[0]!.name} + YOU`);
    expect(me.tricks.pair?.to).toBe(rivals[0]!.index);
  });

  it('lets go when one of the two is wrecked', () => {
    const { w, rivals, give, run } = tricked('pickup.best-friends');
    rivals[1]!.x = rivals[0]!.x + 150;
    give();
    run(5);
    rivals[0]!.wrecked = true;
    run(2);
    expect(rivals[1]!.tricks.pair).toBeUndefined();
    expect(w.cars.every((c) => !c.tricks.pair)).toBe(true);
  });
});
