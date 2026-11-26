import { describe, expect, it } from 'vitest';
import { inWater } from '@demodogs/sim';
import { makeWorld, runUntil } from '../../../src/testing';

describe('venue.rustwater-wharf', () => {
  it('is a harbour: water across the middle, piers over it, cranes, barges and stacked boxes', () => {
    const w = makeWorld({ venue: 'venue.rustwater-wharf' });
    const count = (id: string) => w.statics.filter((s) => s.def.id === id).length;
    expect(w.spills.filter((s) => s.fixed && s.def.id === 'material.brine').length).toBeGreaterThan(
      100,
    );
    expect(inWater(w, w.oval!.cx + 160, w.oval!.cy)).toBe(true);
    expect(count('prop.pier-deck')).toBeGreaterThan(40);
    expect(count('prop.crane-leg')).toBe(8);
    expect(count('prop.fuel-barge')).toBeGreaterThanOrEqual(3);
    expect(count('prop.container-red') + count('prop.container-teal')).toBeGreaterThan(40);
    expect(count('prop.container-red-top') + count('prop.container-teal-top')).toBeGreaterThan(15);
    // nobody starts in the water, and no deck has water under it
    for (const c of w.cars) expect(inWater(w, c.x, c.y)).toBe(false);
    for (const s of w.statics)
      if (s.def.id === 'prop.pier-deck') expect(inWater(w, s.x, s.y)).toBe(false);
  });

  it('an all-AI derby runs to the end, and the yards and barges come apart', () => {
    const w = makeWorld({
      venue: 'venue.rustwater-wharf',
      car: 'car.bruiser',
      autopilot: true,
      seed: 2,
    });
    const seen = new Set<string>();
    runUntil(
      w,
      (w) => {
        for (const e of w.takeEvents()) seen.add(e.t);
        return w.phase === 'over';
      },
      60 * 200,
    );
    expect(w.phase).toBe('over');
    const alive = w.cars.filter((c) => !c.wrecked).length;
    expect(alive <= 1 || w.player.wrecked || w.timeLeft <= 0).toBe(true);
    expect(seen.has('fall')).toBe(true);
    expect(seen.has('explode')).toBe(true);
  });
});
