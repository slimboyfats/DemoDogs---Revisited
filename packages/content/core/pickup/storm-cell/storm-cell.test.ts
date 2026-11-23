import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import { bench, put } from '../../../src/testing';

describe('pickup.storm-cell', () => {
  it('loads a shock pulse when it is the only pickup on offer', () => {
    const w = bench();
    (w.venue as { pickups: string[] }).pickups = ['pickup.storm-cell'];
    const c = w.player;
    w.pickups[0]!.on = true;
    put(c, w.pickups[0]!.x, w.pickups[0]!.y, 0);
    const before = w.takeEvents().length;
    expect(before).toBeGreaterThanOrEqual(0);
    w.step();
    expect(c.weapon?.id).toBe('weapon.shock-pulse');
    expect(c.ammo).toBe(2);
    expect(w.takeEvents().find((e) => e.t === 'pickup')).toMatchObject({ label: 'SHOCK PULSE x2' });
  });

  it('is in every venue', () => {
    for (const v of loadContent().venue.values()) expect(v.pickups).toContain('pickup.storm-cell');
  });
});
