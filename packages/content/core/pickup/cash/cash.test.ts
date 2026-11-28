import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import { bench, makeWorld, put, startRace } from '../../../src/testing';

describe('pickup.cash', () => {
  it('does its job when it is the only pickup on offer', () => {
    const w = bench();
    (w.venue as { pickups: string[] }).pickups = ['pickup.cash'];
    const c = w.player;
    const before = c.cash;
    w.pickups[0]!.on = true;
    put(c, w.pickups[0]!.x, w.pickups[0]!.y, 0);
    w.step();
    expect(c.cash).toBe(before + 150);
    expect(w.pickups[0]!.on).toBe(false);
  });

  it('is in no crate where money counts for nothing', () => {
    const w = startRace(makeWorld({ cashless: true }));
    (w.venue as { pickups: string[] }).pickups = ['pickup.cash', 'pickup.ammo', 'pickup.nitro'];
    const c = w.player;
    const labels: string[] = [];
    for (let i = 0; i < 400; i++) {
      const p = w.pickups[0]!;
      p.on = true;
      put(c, p.x, p.y, 0);
      w.step();
      for (const e of w.takeEvents())
        if (e.t === 'pickup' && e.car === c.index) labels.push(e.kind);
    }
    expect(labels.length).toBeGreaterThan(100);
    expect(labels).not.toContain('cash');
    expect(c.cash).toBe(0);
  });

  it('is in every venue', () => {
    for (const v of loadContent().venue.values()) expect(v.pickups).toContain('pickup.cash');
  });
});
