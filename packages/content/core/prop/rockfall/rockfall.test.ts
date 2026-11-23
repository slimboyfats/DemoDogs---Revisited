import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';

describe('prop.rockfall', () => {
  it('stops a car that rolls into it slowly', () => {
    const r = propTest('prop.rockfall', 50);
    expect(r.blocked).toBe(true);
    expect(r.piece!.down).toBeFalsy();
  });

  it('a hard ram knocks chunks off it', () => {
    const r = propTest('prop.rockfall', 150);
    expect(r.piece!.hp!).toBeLessThan(42);
    expect(r.events).toContain('chip');
  });
});
