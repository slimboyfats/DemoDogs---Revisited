import { describe, expect, it } from 'vitest';
import { FULL, gainOf, readVolume } from './volume';

describe('volume', () => {
  it('starts at full when nothing is saved, or what is saved is broken', () => {
    expect(readVolume(null)).toEqual(FULL);
    expect(readVolume('{nope')).toEqual(FULL);
    expect(readVolume('7')).toEqual(FULL);
  });

  it('reads what was saved and keeps it between nothing and full', () => {
    expect(readVolume('{"master":0.5,"music":0,"fx":3}')).toEqual({ master: 0.5, music: 0, fx: 1 });
    expect(readVolume('{"music":-2,"fx":"loud"}')).toEqual({ master: 1, music: 0, fx: 1 });
  });

  it('is silent at the bottom, untouched at the top and rises all the way', () => {
    expect(gainOf(0)).toBe(0);
    expect(gainOf(1)).toBe(1);
    expect(gainOf(0.5)).toBeLessThan(0.5);
    for (let i = 1; i <= 20; i++) expect(gainOf(i / 20)).toBeGreaterThan(gainOf((i - 1) / 20));
  });
});
