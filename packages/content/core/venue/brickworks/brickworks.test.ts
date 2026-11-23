import { describe, expect, it } from 'vitest';
import { makeWorld, runUntil } from '../../../src/testing';

describe('venue.brickworks', () => {
  it('an all-AI race runs to the finish', () => {
    const w = makeWorld({ venue: 'venue.brickworks', car: 'car.mutt', autopilot: true });
    runUntil(w, (w) => w.phase === 'over', 60 * 300);
    expect(w.phase).toBe('over');
    expect(w.finishers.length).toBeGreaterThanOrEqual(1);
  });

  it('is a town of buildings put up piece by piece, and every piece can be broken', () => {
    const w = makeWorld({ venue: 'venue.brickworks' });
    const pieces = w.statics.filter((s) => s.group !== undefined);
    const groups = new Set(pieces.map((s) => s.group));
    expect(groups.size).toBeGreaterThan(20);
    expect(pieces.length).toBeGreaterThan(300);
    expect(pieces.every((s) => s.hp !== undefined)).toBe(true);
    expect(pieces.some((s) => s.def.id === 'prop.roof-tile')).toBe(true);
    expect(pieces.some((s) => s.def.id === 'prop.window-wall')).toBe(true);
  });

  it('the racers smash through the barricades across the road', () => {
    const w = makeWorld({ venue: 'venue.brickworks', autopilot: true });
    const planks = w.statics.filter((s) => s.def.id === 'prop.plank-fence');
    expect(planks.length).toBeGreaterThan(20);
    runUntil(w, () => false, 60 * 60);
    expect(planks.filter((s) => s.down).length).toBeGreaterThan(5);
  });
});
