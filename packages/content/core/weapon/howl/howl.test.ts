import { describe, expect, it } from 'vitest';
import { NO_CONTROLS } from '@demodogs/shared';
import { howlWants, rangeHowl, rangeProp, type Car, type World } from '@demodogs/sim';
import { loadContent } from '../../../src/index';
import { bench, put } from '../../../src/testing';

const C = loadContent();
const def = C.weapon.get('weapon.howl')!;

/** The player on bare ground with two parked rivals, everything still. */
function scene(): { w: World; me: Car; near: Car; far: Car; x: number; y: number } {
  const w = bench({ rivals: 2 });
  w.statics.length = 0;
  const x = w.w / 2;
  const y = w.h / 2;
  const me = w.player;
  const [near, far] = w.cars.filter((c) => c !== me) as [Car, Car];
  near.ai = far.ai = null;
  put(me, x, y, 0);
  put(near, x + 50, y, 0);
  put(far, x, y + 300, 0);
  return { w, me, near, far, x, y };
}

/** Run until every front has run out. */
function settle(w: World, ticks = 40): void {
  for (let i = 0; i < ticks; i++) w.step();
}

describe('weapon.howl', () => {
  it('throws a rival inside the wave up and away, and leaves the howler and a far car be', () => {
    const { w, me, near, far, x, y } = scene();
    me.weapon = def;
    me.ammo = 1;
    w.step({ ...NO_CONTROLS, fire: true });
    expect(w.howls.length).toBe(1);
    expect(me.weapon).toBe(null);
    let top = 0;
    for (let i = 0; i < 30; i++) {
      w.step();
      top = Math.max(top, near.z);
    }
    expect(top).toBeGreaterThan(8);
    expect(near.x - x).toBeGreaterThan(90);
    expect(near.hp).toBeLessThan(100);
    expect(Math.hypot(me.x - x, me.y - y)).toBeLessThan(2);
    expect(me.hp).toBe(100);
    expect(Math.hypot(far.x - x, far.y - (y + 300))).toBeLessThan(2);
    expect(w.howls.length).toBe(0);
    expect(w.craters.length).toBe(0);
    expect(w.blazes.length).toBe(0);
  });

  it('reports the wave and each thing it throws', () => {
    const { w, me, near, x, y } = scene();
    w.takeEvents();
    rangeHowl(w, def, me, x, y);
    settle(w);
    const ev = w.takeEvents();
    expect(ev.find((e) => e.t === 'howl')).toMatchObject({ car: me.index, r: def.radius });
    expect(ev.filter((e) => e.t === 'hurl' && e.what === 'car')).toEqual([
      expect.objectContaining({ car: near.index }),
    ]);
  });

  it('throws loose props away from the middle', () => {
    const { w, me, x, y } = scene();
    rangeProp(w, C.prop.get('prop.barrel')!, x - 30, y, 0);
    rangeProp(w, C.prop.get('prop.barrel')!, x, y + 40, 0);
    const [a, b] = w.props;
    rangeHowl(w, def, me, x, y);
    settle(w, 60);
    expect(a!.x).toBeLessThan(x - 80);
    expect(b!.y).toBeGreaterThan(y + 80);
    // thrown, not set off
    expect(a!.alive && b!.alive).toBe(true);
    expect(a!.fuse).toBe(0);
  });

  it("turns a rocket coming in round and makes it the howler's own", () => {
    const { w, me, near, x, y } = scene();
    put(near, x + 400, y, 0);
    const rocket = C.weapon.get('weapon.rocket')!;
    w.rockets.push({
      x: x + 60,
      y,
      z: 0,
      h: Math.PI,
      v: 340,
      owner: near.index,
      life: 2,
      def: rocket,
    });
    rangeHowl(w, def, me, x, y);
    for (let i = 0; i < 12; i++) w.step();
    const r = w.rockets[0]!;
    expect(r.owner).toBe(me.index);
    expect(Math.cos(r.h)).toBeGreaterThan(0.9);
    expect(r.x).toBeGreaterThan(x + 60);
    expect(me.hp).toBe(100);
  });

  it('sweeps mines and spikes out to its rim', () => {
    const { w, me, near, x, y } = scene();
    put(near, x + 400, y, 0);
    const mine = C.weapon.get('weapon.mine')!;
    const tacks = C.weapon.get('weapon.tacks')!;
    w.mines.push({ x: x + 20, y, z: 0, owner: near.index, t: 0, def: mine });
    w.spikes.push({ x, y: y - 25, t: 0, life: 20, owner: near.index, def: tacks });
    rangeHowl(w, def, me, x, y);
    settle(w);
    expect(w.mines[0]!.x - x).toBeCloseTo(def.radius!, 0);
    expect(y - w.spikes[0]!.y).toBeCloseTo(def.radius!, 0);
  });

  it('turns a lobbed shell and a wrecking ball away', () => {
    const { w, me, near, x, y } = scene();
    put(near, x + 400, y, 0);
    const lob = C.weapon.get('weapon.lobster')!;
    const ball = C.weapon.get('weapon.bowler')!;
    w.arms.shells.push({
      x: x + 40,
      y,
      z: 30,
      vx: -120,
      vy: 0,
      vz: 0,
      owner: near.index,
      def: lob,
    });
    w.arms.balls.push({
      x,
      y: y + 50,
      vx: 0,
      vy: -200,
      roll: 0,
      t: 3,
      owner: near.index,
      def: ball,
    });
    rangeHowl(w, def, me, x, y);
    for (let i = 0; i < 10; i++) w.step();
    expect(w.arms.shells[0]!.vx).toBeGreaterThan(100);
    expect(w.arms.balls[0]!.vy).toBeGreaterThan(150);
    expect(w.arms.balls[0]!.owner).toBe(me.index);
  });

  it('an AI driver howls at a rival close by, and not at an empty road', () => {
    const { w, me, near, x, y } = scene();
    me.weapon = def;
    me.ammo = 1;
    expect(howlWants(w, me)).toBe(true);
    put(near, x + 400, y, 0);
    expect(howlWants(w, me)).toBe(false);
    // a rocket coming straight at it
    const rocket = C.weapon.get('weapon.rocket')!;
    w.rockets.push({
      x: x + 60,
      y,
      z: 0,
      h: Math.PI,
      v: 340,
      owner: near.index,
      life: 2,
      def: rocket,
    });
    expect(howlWants(w, me)).toBe(true);
  });

  it('runs the same way twice', () => {
    const run = () => {
      const { w, me, near, x, y } = scene();
      rangeHowl(w, def, me, x, y);
      settle(w, 80);
      return [near.x, near.y, near.h, near.hp];
    };
    expect(run()).toEqual(run());
  });
});
