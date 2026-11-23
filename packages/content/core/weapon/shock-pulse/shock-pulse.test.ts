import { describe, expect, it } from 'vitest';
import { NO_CONTROLS } from '@demodogs/shared';
import { rangePulse, rangeProp, spill, type Car, type World } from '@demodogs/sim';
import { loadContent } from '../../../src/index';
import { bench, openSpot, put } from '../../../src/testing';

const C = loadContent();
const def = C.weapon.get('weapon.shock-pulse')!;

/** The player on bare ground with two parked rivals, everything still. */
function scene(): { w: World; me: Car; near: Car; far: Car; x: number; y: number } {
  const w = bench({ rivals: 2 });
  // bare ground: no scenery but what a test puts down
  w.statics.length = 0;
  const x = w.w / 2;
  const y = w.h / 2;
  const me = w.player;
  const [near, far] = w.cars.filter((c) => c !== me) as [Car, Car];
  near.ai = far.ai = null;
  put(me, x, y, 0);
  put(near, x + 40, y, 0);
  put(far, x, y + 300, 0);
  return { w, me, near, far, x, y };
}

/** Run until every ring has spread out. */
function settle(w: World): void {
  for (let i = 0; i < 40; i++) w.step();
}

describe('weapon.shock-pulse', () => {
  it('cuts the engine of a rival inside the ring, not one outside it', () => {
    const { w, me, near, far } = scene();
    me.weapon = def;
    me.ammo = 1;
    w.step({ ...NO_CONTROLS, fire: true });
    expect(w.pulses.length).toBe(1);
    expect(me.weapon).toBe(null);
    for (let i = 0; i < 12; i++) w.step();
    expect(near.stall).toBeGreaterThan(0);
    expect(near.hp).toBeLessThan(100);
    expect(far.stall ?? 0).toBe(0);
    expect(me.stall ?? 0).toBe(0);
    expect(far.hp).toBe(100);
  });

  it('a stalled car cannot drive, boost or fire until its engine comes back', () => {
    const { w, near } = scene();
    near.stall = 0.5;
    near.isPlayer = false;
    near.weapon = C.weapon.get('weapon.mine')!;
    near.ammo = 1;
    const v0 = 150;
    put(near, near.x, near.y, 0, v0);
    w.step();
    // coasting and dragging, not driving
    expect(Math.hypot(near.vx, near.vy)).toBeLessThan(v0);
    for (let i = 0; i < 40; i++) w.step();
    expect(near.stall).toBe(0);
    expect(w.mines.length).toBe(0);
  });

  it('arcs through a chain of pylons to a car far outside the ring', () => {
    const { w, me, far, x, y } = scene();
    const pylon = C.prop.get('prop.pylon')!;
    rangeProp(w, pylon, x, y + 60);
    rangeProp(w, pylon, x, y + 110);
    rangeProp(w, pylon, x, y + 160);
    rangeProp(w, pylon, x, y + 210);
    put(far, x, y + 250, 0);
    rangePulse(w, def, me);
    settle(w);
    expect(far.stall).toBeGreaterThan(0);
    const arcs = w.takeEvents().filter((e) => e.t === 'arc');
    expect(arcs.length).toBeGreaterThanOrEqual(5);
  });

  it('does not arc through scenery that does not conduct', () => {
    const { w, me, far, x, y } = scene();
    const wall = C.prop.get('prop.brick-post')!;
    for (let k = 60; k <= 260; k += 50) rangeProp(w, wall, x, y + k);
    rangePulse(w, def, me);
    settle(w);
    expect(far.stall ?? 0).toBe(0);
  });

  it('sets a fuel pool alight', () => {
    const { w, me, x, y } = scene();
    spill(w, C.material.get('material.fuel')!, x - 40, y, 10, -1);
    rangePulse(w, def, me);
    settle(w);
    expect(w.spills.some((s) => s.def.id === 'material.fuel')).toBe(false);
    expect(w.blazes.length).toBeGreaterThan(0);
  });

  it('runs through a chain of puddles to a car standing in the last one', () => {
    const { w, me, far, x, y } = scene();
    // a long puddle from inside the ring out to the far car
    for (let k = 50; k <= 300; k += 20)
      spill(w, C.material.get('material.water')!, x, y + k, 14, -1);
    rangePulse(w, def, me);
    settle(w);
    expect(far.stall).toBeGreaterThan(0);
  });

  it('a pylon lights the fuse of a drum beside it', () => {
    const { w, me, x, y } = scene();
    rangeProp(w, C.prop.get('prop.pylon')!, x, y - 60);
    rangeProp(w, C.prop.get('prop.barrel')!, x + 40, y - 100);
    const drum = w.props[w.props.length - 1]!;
    rangePulse(w, def, me);
    for (let i = 0; i < 20; i++) w.step();
    expect(drum.fuse > 0 || !drum.alive).toBe(true);
  });

  it('a rival AI fires it when someone is close', () => {
    const w = bench({ rivals: 1 });
    const [x, y] = openSpot(w, 120);
    const me = w.player;
    const them = w.cars.find((c) => c !== me)!;
    put(me, x, y, 0);
    put(them, x + 30, y, 0);
    them.weapon = def;
    them.ammo = 1;
    w.step();
    expect(them.ammo).toBe(0);
    expect(w.pulses.length).toBe(1);
  });
});
