import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import look from './look';

describe('prop.signal-lamp', () => {
  const def = loadContent().prop.get('prop.signal-lamp')!;
  it('is a thin solid post that reads a beat a long way off', () => {
    expect(def.signal!.reach).toBeGreaterThan(300);
    expect(def.solid).not.toBe(false);
    expect(def.radius).toBeLessThan(6);
  });
  it('has a pose for red, amber and green, each a lamp that gives light', () => {
    const L = look.look;
    if (L.kind !== 'prop') throw new Error('not a prop');
    const lamps = [L.part, ...(L.alts ?? [])].map((p) => p.fn(0, 0, 21));
    expect(lamps).toEqual(['lampred', 'lampamber', 'lampgreen']);
  });
});
