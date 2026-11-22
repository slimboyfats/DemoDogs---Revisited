import { describe, expect, it } from 'vitest';
import { propTest, runUntil } from '../../../src/testing';

describe('prop.log-pile', () => {
  it('stops a car that rams it', () => {
    const r = propTest('prop.log-pile', 150);
    expect(r.blocked).toBe(true);
    expect(r.piece!.down).toBeUndefined();
  });

  it('burns down', () => {
    const r = propTest('prop.log-pile', 5);
    const w = r.world;
    const s = r.piece!;
    w.blazes.push({ x: s.x, y: s.y, r: 9, t: 14, bite: 0, owner: -1 });
    runUntil(w, () => s.down === true, 60 * 14);
    expect(s.down).toBe(true);
  });
});
