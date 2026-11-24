import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import { rangeGive, rangeHit } from '@demodogs/sim';
import { bench } from '../../../src/testing';

const cage = () => loadContent().pickup.get('pickup.roll-cage')!;

describe('pickup.roll-cage', () => {
  it('takes the blow that would have wrecked the car, once', () => {
    const w = bench();
    const c = w.player;
    rangeGive(w, c, cage());
    w.takeEvents();
    rangeHit(w, c, 500, c.x + 5, c.y);
    expect(c.wrecked).toBe(false);
    expect(c.hp).toBe(cage().amount);
    expect(c.fit.cage).toBeUndefined();
    const off = w.takeEvents().find((e) => e.t === 'addon');
    expect(off).toMatchObject({ on: false, spent: true, id: 'pickup.roll-cage' });
    // it is torn off: the next one wrecks, once the car can be hit again
    for (let i = 0; i < 120; i++) w.step();
    rangeHit(w, c, 500, c.x + 5, c.y);
    expect(c.wrecked).toBe(true);
  });

  it('comes to the grid on a car that was sold one', () => {
    const w = bench({ player: { fit: ['pickup.roll-cage'] } });
    expect(w.player.fit.cage?.n).toBe(1);
  });

  it('is in every venue and in the garage', () => {
    for (const v of loadContent().venue.values()) expect(v.pickups).toContain('pickup.roll-cage');
    expect(cage().sold).toBe('garage');
  });
});
