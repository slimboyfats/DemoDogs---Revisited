import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import { bench, put } from '../../../src/testing';

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

  it('is in every venue', () => {
    for (const v of loadContent().venue.values()) expect(v.pickups).toContain('pickup.cash');
  });
});
