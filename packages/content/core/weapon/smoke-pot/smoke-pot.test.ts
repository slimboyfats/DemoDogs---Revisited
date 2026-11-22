import { describe, expect, it } from 'vitest';
import { NO_CONTROLS } from '@demodogs/shared';
import { cloudReach, inSmoke } from '@demodogs/sim';
import { loadContent } from '../../../src/index';
import { bench, makeWorld, openSpot, put, startRace } from '../../../src/testing';

const def = loadContent().weapon.get('weapon.smoke-pot')!;

describe('weapon.smoke-pot', () => {
  it('sets a cloud down behind that swells, hangs and goes', () => {
    const w = bench();
    const [x, y] = openSpot(w, 80);
    put(w.player, x, y, 0);
    w.player.weapon = def;
    w.player.ammo = 1;
    w.step({ ...NO_CONTROLS, fire: true });
    expect(w.clouds.length).toBe(1);
    const c = w.clouds[0]!;
    expect(c.x).toBeLessThan(x);
    const r0 = cloudReach(c);
    for (let i = 0; i < 60; i++) w.step();
    expect(cloudReach(c)).toBeGreaterThan(r0);
    expect(inSmoke(w, c.x, c.y)).toBe(true);
    for (let i = 0; i < 60 * (def.life ?? 6); i++) w.step();
    expect(w.clouds.length).toBe(0);
  });

  it('blinds a rival that drives into it: it stops following the road for a moment', () => {
    const w = startRace(makeWorld({ rivals: 1 }));
    const them = w.cars.find((c) => !c.isPlayer)!;
    for (let i = 0; i < 30; i++) w.step();
    w.clouds.push({ x: them.x, y: them.y, r: 30, t: 2, life: 6, blind: 1.2, owner: 0 });
    w.step();
    expect(them.blind).toBeGreaterThan(1);
  });

  it('hides a car from guns', () => {
    const w = bench({ rivals: 1 });
    const [x, y] = openSpot(w, 120);
    const me = w.player;
    const them = w.cars.find((c) => c !== me)!;
    them.ai = null;
    put(me, x, y, 0);
    put(them, x + 50, y, 0);
    w.clouds.push({ x: them.x, y: them.y, r: 30, t: 2, life: 6, blind: 1, owner: 1 });
    const rounds = me.rounds;
    for (let i = 0; i < 30; i++) w.step();
    expect(me.rounds).toBe(rounds);
    w.clouds.length = 0;
    for (let i = 0; i < 30; i++) w.step();
    expect(me.rounds).toBeLessThan(rounds);
  });
});
