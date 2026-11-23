import { describe, expect, it } from 'vitest';
import { makeWorld, runUntil } from '../../../src/testing';

describe('venue.tank-farm', () => {
  it('a derby ends with one car running, the player out, or the clock', () => {
    const w = makeWorld({ venue: 'venue.tank-farm', car: 'car.bruiser', autopilot: true });
    runUntil(w, (w) => w.phase === 'over', 60 * 200);
    expect(w.phase).toBe('over');
    const alive = w.cars.filter((c) => !c.wrecked).length;
    expect(alive <= 1 || w.player.wrecked || w.timeLeft <= 0).toBe(true);
  });

  it('is full of fuel, and it goes up during the derby', () => {
    const w = makeWorld({ venue: 'venue.tank-farm', autopilot: true });
    const tanks = w.props.filter((p) => p.def.id === 'prop.fuel-tank').length;
    expect(tanks).toBeGreaterThan(8);
    const seen = new Set<string>();
    runUntil(
      w,
      (w) => {
        for (const e of w.takeEvents()) seen.add(e.t);
        return w.phase === 'over';
      },
      60 * 120,
    );
    expect(seen.has('explode')).toBe(true);
    expect(seen.has('blaze')).toBe(true);
  });
});
