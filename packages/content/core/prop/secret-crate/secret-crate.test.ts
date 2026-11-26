import { describe, expect, it } from 'vitest';
import { stand } from '@demodogs/sim';
import { loadContent } from '../../../src/index';
import { bench, openSpot, put } from '../../../src/testing';

describe('prop.secret-crate', () => {
  it('lays a crate that hands a car a full boost tank and rockets, every time', () => {
    const w = bench();
    const [x, y] = openSpot(w, 100);
    stand(w, loadContent().prop.get('prop.secret-crate')!, x, y, 0, 0);
    // (the world lays the crates of the props it stands itself: here, by hand)
    w.pickups.push({ x, y, z: 0, on: true, t: 0, gives: ['pickup.nitro', 'pickup.rockets'] });
    const c = w.player;
    c.nitro = 0;
    put(c, x, y, 0, 0);
    w.step();
    expect(c.nitro).toBe(1);
    expect(c.weapon?.id).toBe('weapon.rocket');
    expect(w.pickups[w.pickups.length - 1]!.on).toBe(false);
  });
});
