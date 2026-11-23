import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import { DT } from '@demodogs/shared';
import { rangeGive } from '@demodogs/sim';
import { bench, put } from '../../../src/testing';

const magnet = () => loadContent().pickup.get('pickup.fetch-magnet')!;

describe('pickup.fetch-magnet', () => {
  it('pulls in a pickup the car only passes near', () => {
    const pass = (fitted: boolean) => {
      const w = bench();
      const c = w.player;
      const p = w.pickups[0]!;
      const V = w.venue as { pickups: string[] };
      const all = V.pickups;
      V.pickups = ['pickup.nitro'];
      if (fitted) rangeGive(w, c, magnet());
      put(c, p.x + 50, p.y, 0);
      w.takeEvents();
      w.step();
      V.pickups = all;
      return { taken: !p.on, events: w.takeEvents() };
    };
    expect(pass(false).taken).toBe(false);
    const got = pass(true);
    expect(got.taken).toBe(true);
    expect(got.events.some((e) => e.t === 'fetch')).toBe(true);
    expect(got.events.some((e) => e.t === 'pickup')).toBe(true);
  });

  it('runs out', () => {
    const w = bench();
    const c = w.player;
    w.pickups.length = 0;
    rangeGive(w, c, magnet());
    for (let t = 0; t < magnet().seconds! + 0.2; t += DT) w.step();
    expect(c.fit.magnet).toBeUndefined();
    expect(w.takeEvents().some((e) => e.t === 'addon' && !e.on && !e.spent)).toBe(true);
  });

  it('is in every venue', () => {
    for (const v of loadContent().venue.values())
      expect(v.pickups).toContain('pickup.fetch-magnet');
  });
});
