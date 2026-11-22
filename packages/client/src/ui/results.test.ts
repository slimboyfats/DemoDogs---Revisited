import { describe, expect, it } from 'vitest';
import { makeWorld, runUntil } from '@demodogs/content/testing';
import { fmtTime, placeName } from '../render/hud';
import { results } from './results';

describe('results', () => {
  it('formats places and times', () => {
    expect([1, 2, 3, 4, 11].map(placeName)).toEqual(['1ST', '2ND', '3RD', '4TH', '11TH']);
    expect(fmtTime(65.25)).toBe('1:05.3');
  });

  it('lists every car after a derby, the player marked', () => {
    const w = makeWorld({ venue: 'venue.the-pit', car: 'car.pug', seed: 3, autopilot: true });
    runUntil(w, (x) => x.phase === 'over', 60 * 200);
    const r = results(w);
    expect(r.rows).toHaveLength(w.cars.length);
    expect(r.rows.filter((x) => x.me)).toHaveLength(1);
    expect(r.head[2]).toBe('Status');
    expect(r.title).toMatch(/LAST DOG STANDING|SCRAPPED|SURVIVED/);
  });
});
