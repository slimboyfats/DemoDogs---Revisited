import { describe, expect, it } from 'vitest';
import { stand } from '@demodogs/sim';
import { loadContent } from '../../../src/index';
import { bench, openSpot, put } from '../../../src/testing';

describe('prop.switch-bollard', () => {
  it('stands until a floor switch near it is driven over, sinks, and rises once the car is by', () => {
    const w = bench();
    const C = loadContent();
    const [x, y] = openSpot(w, 100);
    const posts = [-2, -1, 0, 1, 2].map((k) =>
      stand(w, C.prop.get('prop.switch-bollard')!, x + 50, y + k * 13, 0, 0),
    );
    stand(w, C.prop.get('prop.floor-switch')!, x - 30, y, 0, 0);
    const c = w.player;
    put(c, x - 80, y, 0, 120);
    w.step({ steer: 0, throttle: 0, brake: false, boost: false, fire: false });
    expect(posts.every((s) => !s.down)).toBe(true);
    let opened = false;
    let through = false;
    for (let i = 0; i < 60 * 8; i++) {
      w.step({ steer: 0, throttle: 1, brake: false, boost: false, fire: false });
      for (const e of w.takeEvents()) if (e.t === 'pad' && e.kind === 'switch') opened = true;
      if (c.x > x + 70) through = true;
    }
    expect(opened).toBe(true);
    expect(through).toBe(true);
    // up again, long after
    expect(posts.every((s) => !s.down)).toBe(true);
  });
  it('stands in the way without a switch', () => {
    const w = bench();
    const [x, y] = openSpot(w, 100);
    for (let k = -2; k <= 2; k++)
      stand(w, loadContent().prop.get('prop.switch-bollard')!, x, y + k * 13, 0, 0);
    const c = w.player;
    put(c, x - 40, y, 0, 120);
    for (let i = 0; i < 60; i++)
      w.step({ steer: 0, throttle: 1, brake: false, boost: false, fire: false });
    expect(c.x).toBeLessThan(x);
  });
});
