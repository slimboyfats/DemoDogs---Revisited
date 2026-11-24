import { describe, expect, it } from 'vitest';
import { STEPS } from './tracker';
import { SONGS, tune, tuneFor, type Tune } from './tunes';

const names = Object.keys(SONGS) as Tune[];

describe('tunes', () => {
  it.each(names)('%s is written right and long enough not to grate', (name) => {
    const c = tune(name);
    expect(c.notes.length).toBeGreaterThan(200);
    const round = (c.steps - c.loopStep) * c.stepTime;
    expect(round).toBeGreaterThan(30);
    expect(c.steps % STEPS).toBe(0);
    expect(c.loopStep).toBeGreaterThan(0);
    for (const n of c.notes) {
      if (n.voice === 'bass') expect(n.midi).toBeGreaterThanOrEqual(26);
      if (n.voice === 'lead') {
        expect(n.midi).toBeGreaterThanOrEqual(midi.low);
        expect(n.midi).toBeLessThanOrEqual(midi.high);
      }
    }
  });

  it('picks a tune by the country a race is run in', () => {
    const o = { derby: false, terrain: 'grass', dirtRoad: false };
    expect(tuneFor(o)).toBe('green');
    expect(tuneFor({ ...o, terrain: 'snow' })).toBe('frost');
    expect(tuneFor({ ...o, terrain: 'paved' })).toBe('steel');
    expect(tuneFor({ ...o, terrain: 'sand' })).toBe('dust');
    expect(tuneFor({ ...o, dirtRoad: true })).toBe('dust');
    expect(tuneFor({ ...o, derby: true, terrain: 'snow' })).toBe('derby');
  });
});

const midi = { low: 60, high: 92 };
