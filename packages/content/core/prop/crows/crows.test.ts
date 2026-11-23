import { describe, expect, it } from 'vitest';
import { critterTest } from '../../../src/testing';

describe('prop.crows', () => {
  it('takes off when a car comes, and comes down again later', () => {
    const r = critterTest('prop.crows', 150, 0, false, 60 * 12);
    expect(r.events.filter((e) => e === 'up').length).toBeGreaterThan(0);
    expect(r.maxZ).toBeGreaterThan(15);
    expect(r.flung).toBe(0);
    expect(r.events).toContain('down');
    expect(r.critters.every((k) => k.z === 0)).toBe(true);
  });
});
