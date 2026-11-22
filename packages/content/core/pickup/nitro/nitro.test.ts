import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import { bench, put } from '../../../src/testing';

describe('pickup.nitro', () => {
  it('does its job when it is the only pickup on offer', () => {
    const w = bench();
    // only this pickup in the venue's list
    (w.venue as { pickups: string[] }).pickups = ['pickup.nitro'];
    const c = w.player;
    c.nitro = 0;
    w.pickups[0]!.on = true;
    put(c, w.pickups[0]!.x, w.pickups[0]!.y, 0);
    w.step();
    expect(c.nitro).toBe(1);
    expect(w.pickups[0]!.on).toBe(false);
  });

  it('is in every venue', () => {
    for (const v of loadContent().venue.values()) expect(v.pickups).toContain('pickup.nitro');
  });
});
