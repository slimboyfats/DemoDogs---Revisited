import { describe, expect, it } from 'vitest';
import { gateOpen, stand } from '@demodogs/sim';
import { loadContent } from '../../../src/index';
import { bench, openSpot, put } from '../../../src/testing';

describe('prop.pop-bollard', () => {
  it('keeps a beat: down two seconds in every four, every one of them together', () => {
    const w = bench();
    const def = loadContent().prop.get('prop.pop-bollard')!;
    const [x, y] = openSpot(w, 100);
    const a = stand(w, def, x, y, 0, 0);
    const b = stand(w, def, x, y + 14, 0, 7);
    let down = 0;
    for (let t = 0; t < 4; t += 0.05) {
      expect(gateOpen(w, a, t)).toBe(gateOpen(w, b, t));
      if (gateOpen(w, a, t)) down++;
    }
    expect(down).toBe(40);
  });
  it('stops a car while it stands, and lets one by while it is down', () => {
    const run = (down: boolean) => {
      const w = bench();
      const def = loadContent().prop.get('prop.pop-bollard')!;
      const [x, y] = openSpot(w, 100);
      const posts = [-2, -1, 0, 1, 2].map((k) => stand(w, def, x, y + k * 13, 0, 0));
      // wait for the beat to turn the way wanted
      let was = gateOpen(w, posts[0]!);
      for (let i = 0; i < 60 * 5; i++) {
        w.step();
        const now = gateOpen(w, posts[0]!);
        if (now === down && was !== down) break;
        was = now;
      }
      const c = w.player;
      put(c, x - 40, y, 0, 120);
      for (let i = 0; i < 40; i++)
        w.step({ steer: 0, throttle: 1, brake: false, boost: false, fire: false });
      return c.x - x;
    };
    expect(run(true)).toBeGreaterThan(20);
    expect(run(false)).toBeLessThan(0);
  });
});
