import { describe, expect, it } from 'vitest';
import { loadContent } from '@demodogs/content';
import { sunny, thumbPlan } from './venue-thumb';

describe('a venue card’s little map', () => {
  const content = loadContent();

  it('fits every venue inside the picture, road or bowl', () => {
    for (const v of content.venue.values()) {
      const P = thumbPlan(v, 150, 84);
      expect(P.line.length > 0 || P.oval !== null, v.id).toBe(true);
      for (const [x, y] of P.line) {
        expect(x, v.id).toBeGreaterThanOrEqual(0);
        expect(x, v.id).toBeLessThanOrEqual(150);
        expect(y, v.id).toBeGreaterThanOrEqual(0);
        expect(y, v.id).toBeLessThanOrEqual(84);
      }
      if (P.line.length) expect(P.wide, v.id).toBeGreaterThanOrEqual(5);
    }
  });

  it('lightens a colour as the bright look does', () => {
    expect(sunny('#000000')).toBe('rgb(14,14,14)');
    expect(sunny('#ffffff')).toBe('rgb(255,255,255)');
    const [r, g, b] = sunny('#4f7a37').match(/\d+/g)!.map(Number);
    expect(g).toBeGreaterThan(0x7a);
    expect(g).toBeGreaterThan(r!);
    expect(g).toBeGreaterThan(b!);
  });
});
