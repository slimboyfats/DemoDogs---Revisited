import { describe, expect, it } from 'vitest';
import { ROUND_HIGH, ROUND_LOW, carGap, carPoint, newTouch, stand } from '@demodogs/sim';
import { loadContent } from '../../../src/index';
import { bench, openSpot, put } from '../../../src/testing';

describe('weapon.gun', () => {
  const duel = (dy = 0) => {
    const w = bench({ rivals: 1 });
    const [x, y] = openSpot(w, 80);
    const me = w.player;
    const them = w.cars.find((c) => c !== me)!;
    them.ai = null;
    them.rounds = 0;
    put(me, x - 35, y, 0);
    put(them, x + 35, y + dy, 0);
    return { w, me, them };
  };

  it('fires by itself at a car in the sights, spends rounds and hurts it', () => {
    const { w, me, them } = duel();
    const had = me.rounds;
    expect(had).toBe(50);
    const shots = [];
    for (let i = 0; i < 30; i++) {
      w.step();
      shots.push(...w.takeEvents().filter((e) => e.t === 'shot'));
    }
    expect(shots.length).toBeGreaterThan(2);
    expect(me.rounds).toBe(had - shots.length);
    expect(them.hp).toBeLessThan(100);
    expect(me.score).toBeGreaterThan(0);
  });

  it('holds its fire with nobody ahead, and stops when it is empty', () => {
    const { w, me } = duel(60);
    for (let i = 0; i < 30; i++) w.step();
    expect(me.rounds).toBe(50);
    const b = duel();
    b.me.rounds = 2;
    for (let i = 0; i < 60; i++) b.w.step();
    expect(b.me.rounds).toBe(0);
    expect(b.them.hp).toBeGreaterThan(95);
  });

  it('lands its rounds on the bodywork of what it hits, not beside it', () => {
    // the target a little off the line of fire, and bigger than it was built
    const { w, me, them } = duel(6);
    them.size = 1.6;
    let hits = 0;
    for (let i = 0; i < 60; i++) {
      w.step();
      for (const e of w.takeEvents())
        if (e.t === 'shot' && e.hit === them.index) {
          hits++;
          // (its body as drawn at the height a round flies, which is nowhere outside its hull)
          expect(
            Math.abs(
              carPoint(them, e.tx, e.ty, newTouch(), them.z + ROUND_LOW, them.z + ROUND_HIGH),
            ),
          ).toBeLessThan(0.01);
          expect(carGap(them, e.tx, e.ty)).toBeLessThan(2);
          // (on the side that faces the gun)
          expect(Math.hypot(e.tx - me.x, e.ty - me.y)).toBeLessThan(
            Math.hypot(them.x - me.x, them.y - me.y),
          );
        }
    }
    expect(hits).toBeGreaterThan(2);
  });

  it('does not fire through a wall', () => {
    const { w, me, them } = duel();
    stand(
      w,
      loadContent().prop.get('prop.concrete-wall')!,
      (me.x + them.x) / 2,
      me.y,
      Math.PI / 2,
      0,
    );
    for (let i = 0; i < 30; i++) w.step();
    expect(me.rounds).toBe(50);
    expect(them.hp).toBe(100);
  });
});
