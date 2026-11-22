import { describe, expect, it } from 'vitest';
import { makeWorld, runUntil } from '../../../src/testing';

describe('ai.brawler', () => {
  it('goes looking for a fight: damage is done within 20 seconds', () => {
    const w = makeWorld({ venue: 'venue.the-pit', autopilot: true, rivals: 2 });
    runUntil(w, () => false, 60 * 20);
    expect(w.cars.some((c) => c.hp < 100 || c.wrecked)).toBe(true);
  });
});
