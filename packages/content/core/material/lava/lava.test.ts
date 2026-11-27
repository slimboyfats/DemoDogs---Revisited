import { describe, expect, it } from 'vitest';
import { HELD, NO_CONTROLS } from '@demodogs/shared';
import { footing, scalding, spill } from '@demodogs/sim';
import { loadContent } from '../../../src/index';
import { bench, openSpot, put } from '../../../src/testing';

const def = loadContent().material.get('material.lava')!;

describe('material.lava', () => {
  it('holds a car back hard', () => {
    const w = bench();
    const [x, y] = openSpot(w, 80);
    spill(w, def, x, y, 14, -1, true);
    const [grip, drag] = footing(w, x, y);
    expect(grip).toBeLessThan(0.7);
    expect(drag).toBeGreaterThan(2);
  });

  it('burns the armour off a car that stands in it, says so, and stops when it is out', () => {
    const w = bench();
    const c = w.player;
    const [x, y] = openSpot(w, 80);
    spill(w, def, x, y, 30, -1, true);
    put(c, x, y, 0, 0);
    c.invuln = 0;
    const hp = c.hp;
    const seen: string[] = [];
    for (let k = 0; k < 60; k++) {
      w.step(NO_CONTROLS);
      for (const e of w.takeEvents()) if (e.t === 'scald') seen.push(e.out ? 'out' : 'in');
    }
    expect(scalding(w, c)).toBe(def.scalds);
    // about a second of it: the material's `scalds`, give or take a bite and the car's own armour
    expect(hp - c.hp).toBeGreaterThan(def.scalds! * 0.5);
    expect(hp - c.hp).toBeLessThan(def.scalds! * 1.6);
    expect(c.held & HELD.hot).toBe(HELD.hot);
    expect(c.held & HELD.sticky).toBe(0);
    expect(seen).toEqual(['in']);
    // out of it, the burning stops
    put(c, x + 80, y, 0, 0);
    w.step(NO_CONTROLS);
    for (const e of w.takeEvents()) if (e.t === 'scald') seen.push(e.out ? 'out' : 'in');
    const left = c.hp;
    for (let k = 0; k < 30; k++) w.step(NO_CONTROLS);
    expect(seen).toEqual(['in', 'out']);
    expect(c.hp).toBe(left);
    expect(c.held & HELD.hot).toBe(0);
  });

  it('does not burn a car that flies over it', () => {
    const w = bench();
    const c = w.player;
    const [x, y] = openSpot(w, 80);
    spill(w, def, x, y, 30, -1, true);
    put(c, x, y, 0, 0);
    c.z = 20;
    expect(scalding(w, c)).toBe(0);
  });
});
