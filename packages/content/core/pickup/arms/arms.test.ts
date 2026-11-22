import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import { bench, put } from '../../../src/testing';

describe('pickup.arms', () => {
  it('does its job when it is the only pickup on offer', () => {
    const w = bench();
    // only this pickup in the venue's list
    (w.venue as { pickups: string[] }).pickups = ['pickup.arms'];
    const c = w.player;
    w.pickups[0]!.on = true;
    put(c, w.pickups[0]!.x, w.pickups[0]!.y, 0);
    w.step();
    expect(['weapon.rocket', 'weapon.mine']).toContain(c.weapon?.id);
    expect(c.ammo).toBe(3);
    expect(w.pickups[0]!.on).toBe(false);
  });

  it('is in every venue', () => {
    for (const v of loadContent().venue.values()) expect(v.pickups).toContain('pickup.arms');
  });
});
