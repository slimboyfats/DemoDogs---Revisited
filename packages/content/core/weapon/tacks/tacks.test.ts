import { describe, expect, it } from 'vitest';
import { NO_CONTROLS } from '@demodogs/shared';
import { loadContent } from '../../../src/index';
import { bench, openSpot, put } from '../../../src/testing';

const def = loadContent().weapon.get('weapon.tacks')!;

describe('weapon.tacks', () => {
  it('sprays tacks across the road behind', () => {
    const w = bench();
    const [x, y] = openSpot(w, 80);
    put(w.player, x, y, 0);
    w.player.weapon = def;
    w.player.ammo = 1;
    w.step({ ...NO_CONTROLS, fire: true });
    expect(w.spikes.length).toBe(def.count);
    for (const s of w.spikes) expect(s.x).toBeLessThan(x);
  });

  it('gives a car that rolls over one a flat: it hurts, slows and wobbles', () => {
    const run = (tacks: boolean) => {
      const w = bench({ rivals: 1 });
      const [x, y] = openSpot(w, 120);
      const me = w.player;
      const them = w.cars.find((c) => c !== me)!;
      them.ai = null;
      put(me, x - 300, y - 300, 0);
      put(them, x - 30, y, 0, 110);
      if (tacks) w.spikes.push({ x, y, t: 0, life: 25, owner: me.index, def });
      let popped = false;
      let spin = 0;
      for (let i = 0; i < 90; i++) {
        w.step({ ...NO_CONTROLS });
        them.vx = Math.max(them.vx, 0);
        spin = Math.max(spin, Math.abs(them.spin));
        popped ||= w.takeEvents().some((e) => e.t === 'puncture');
      }
      return { them, popped, spin, left: w.spikes.length };
    };
    const hit = run(true);
    const clean = run(false);
    expect(hit.popped).toBe(true);
    expect(hit.left).toBe(0);
    expect(hit.them.flat).toBeGreaterThan(0);
    expect(hit.them.hp).toBeLessThan(100);
    expect(hit.spin).toBeGreaterThan(clean.spin);
    expect(Math.hypot(hit.them.vx, hit.them.vy)).toBeLessThan(
      Math.hypot(clean.them.vx, clean.them.vy),
    );
  });

  it('spares the car that threw them for a moment', () => {
    const w = bench();
    const [x, y] = openSpot(w, 80);
    put(w.player, x, y, 0);
    w.spikes.push({ x, y, t: 0, life: 25, owner: w.player.index, def });
    w.step();
    expect(w.spikes.length).toBe(1);
  });
});
