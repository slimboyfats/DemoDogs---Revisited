import { describe, expect, it } from 'vitest';
import { NO_CONTROLS } from '@demodogs/shared';
import { stand } from '@demodogs/sim';
import { loadContent } from '../../../src/index';
import { flatBench, put } from '../../../src/testing';

const litter = () => loadContent().weapon.get('weapon.litter')!;

function arena() {
  const w = flatBench();
  const me = w.player;
  const them = w.cars.find((c) => c !== me)!;
  const x = w.oval!.cx - 150;
  const y = w.oval!.cy;
  put(me, x, y, 0);
  me.weapon = litter();
  me.ammo = litter().ammo;
  return { w, me, them, x, y };
}

describe('weapon.litter', () => {
  it('bursts into a fan of pups after its fuse', () => {
    const { w } = arena();
    w.step({ ...NO_CONTROLS, fire: true });
    expect(w.rockets.map((r) => r.def.id)).toEqual(['weapon.litter']);
    for (let i = 0; i < 40 && w.rockets[0]?.def.id === 'weapon.litter'; i++) w.step();
    const pups = w.rockets.filter((r) => r.def.id === 'weapon.pup');
    expect(pups.length).toBe(litter().cluster!.count);
    // they fan out: headings spread across most of the fan
    const hs = pups.map((p) => p.h);
    expect(Math.max(...hs) - Math.min(...hs)).toBeGreaterThan(litter().cluster!.spread * 0.7);
  });

  it('each pup digs its own small crater', () => {
    const { w } = arena();
    const before = w.craters.length;
    w.step({ ...NO_CONTROLS, fire: true });
    for (let i = 0; i < 120 && w.rockets.length; i++) w.step();
    expect(w.rockets.length).toBe(0);
    const made = w.craters.slice(before);
    expect(made.length).toBeGreaterThanOrEqual(4);
    for (const c of made) expect(c.r).toBeLessThan(10);
  });

  it('peppers a car in the fan, crediting the shooter', () => {
    const { w, me, them, x, y } = arena();
    put(them, x + 175, y, 0);
    them.ai = null;
    w.step({ ...NO_CONTROLS, fire: true });
    for (let i = 0; i < 120 && w.rockets.length; i++) w.step();
    expect(them.hp).toBeLessThan(100);
    expect(them.wrecked).toBe(false);
    expect(me.score).toBeGreaterThan(0);
  });

  it('takes bites out of a wall it bursts against', () => {
    const { w, x, y } = arena();
    const wall = loadContent().prop.get('prop.brick-wall')!;
    const s = stand(w, wall, x + 120, y, Math.PI / 2, 0);
    const hp = s.hp!;
    w.step({ ...NO_CONTROLS, fire: true });
    for (let i = 0; i < 120 && w.rockets.length; i++) w.step();
    expect(s.hp ?? 0).toBeLessThan(hp);
  });

  it('comes out of arms crates', () => {
    expect(loadContent().pickup.get('pickup.arms')!.weapons).toContain('weapon.litter');
  });
});
