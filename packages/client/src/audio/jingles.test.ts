import { describe, expect, it } from 'vitest';
import { JINGLES, hertz, jingleSeconds, type Jingle } from './jingles';

describe('jingles', () => {
  const all = Object.entries(JINGLES) as [string, Jingle][];

  it('are short, in order and in a range a phone speaker can play', () => {
    for (const [name, j] of all) {
      expect(jingleSeconds(j), name).toBeGreaterThan(0.2);
      expect(jingleSeconds(j), name).toBeLessThan(4.5);
      let at = -1;
      for (const [pitch, start, len] of j.lead) {
        expect(start, name).toBeGreaterThan(at);
        expect(len, name).toBeGreaterThan(0);
        expect(hertz(pitch), name).toBeGreaterThan(100);
        expect(hertz(pitch), name).toBeLessThan(2100);
        at = start;
      }
    }
  });

  it('a win climbs and a wreck falls', () => {
    const first = (j: Jingle) => j.lead[0]![0];
    const last = (j: Jingle) => j.lead[j.lead.length - 1]![0];
    for (const up of ['win', 'final-lap', 'cup', 'last-standing', 'unlock', 'buy'] as const)
      expect(last(JINGLES[up]), up).toBeGreaterThan(first(JINGLES[up]));
    for (const down of ['lost', 'cup-lost', 'denied', 'finish'] as const)
      expect(last(JINGLES[down]), down).toBeLessThan(first(JINGLES[down]));
  });

  it('tunes to concert pitch', () => {
    expect(hertz(69)).toBe(440);
    expect(hertz(81)).toBeCloseTo(880);
  });
});
