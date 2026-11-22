import { describe, expect, it } from 'vitest';
import { makeWorld, runUntil } from '../../../src/testing';

describe('venue.splinter-ridge', () => {
  it('an all-AI race runs to the finish', () => {
    const w = makeWorld({ venue: 'venue.splinter-ridge', car: 'car.mutt', autopilot: true });
    runUntil(w, (w) => w.phase === 'over', 60 * 300);
    expect(w.phase).toBe('over');
    expect(w.finishers.length).toBeGreaterThanOrEqual(1);
  });

  it('is made of wood: a fire takes a fence and the trees by it', () => {
    const w = makeWorld({ venue: 'venue.splinter-ridge' });
    const wood = w.statics.filter((s) => s.made?.id === 'material.wood');
    expect(wood.length).toBeGreaterThan(w.statics.length * 0.4);
    const s = wood.find((p) => p.def.id === 'prop.plank-fence')!;
    w.blazes.push({ x: s.x, y: s.y, r: 9, t: 6, bite: 0, owner: -1 });
    runUntil(w, () => false, 300);
    expect(s.down).toBe(true);
  });
});
