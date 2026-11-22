import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';

describe('prop.rubble', () => {
  it('a fast car ploughs straight through it', () => {
    const r = propTest('prop.rubble', 130);
    expect(r.piece!.down).toBe(true);
    expect(r.world.player.x).toBeGreaterThan(r.start);
  });

  it('a slow car is stopped by it', () => {
    const r = propTest('prop.rubble', 25);
    expect(r.piece!.down).toBeFalsy();
  });
});
