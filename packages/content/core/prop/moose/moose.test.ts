import { describe, expect, it } from 'vitest';
import { critterTest } from '../../../src/testing';

describe('prop.moose', () => {
  it('picks out a car that drives past, paws the ground, charges and hurts it', () => {
    const r = critterTest('prop.moose', 110, 45, false, 260);
    expect(r.events).toContain('wind');
    expect(r.events).toContain('charge');
    expect(r.events).toContain('gore');
    expect(r.car.hp).toBeLessThan(100);
    expect(r.flung).toBe(0);
  });
  it('leaves a car that is standing still alone', () => {
    const r = critterTest('prop.moose', 0, 30, false, 120, 30, 0);
    expect(r.events).not.toContain('wind');
    expect(r.car.hp).toBe(100);
  });
});
