import { describe, expect, it } from 'vitest';
import { rangeEvent, stand } from '@demodogs/sim';
import { loadContent } from '../../../src/index';
import { flatBench, put } from '../../../src/testing';

const def = loadContent().modifier.get('modifier.tremors')!;
const idle = { steer: 0, throttle: 0, brake: false, boost: false, fire: false };

describe('modifier.tremors', () => {
  it('rumbles, then splits the ground in cracks of pits', () => {
    const w = flatBench();
    const c = w.player;
    put(c, w.oval!.cx, w.oval!.cy, 0);
    rangeEvent(w, def, c.x + 30, c.y);
    const seen: string[] = [];
    for (let i = 0; i < 60 * 2; i++) {
      w.step(idle);
      for (const e of w.takeEvents()) seen.push(e.t);
    }
    expect(seen.indexOf('omen')).toBeLessThan(seen.indexOf('quake'));
    expect(seen.filter((t) => t === 'split').length).toBeGreaterThanOrEqual(2);
    expect(w.craters.length).toBeGreaterThan(10);
  });

  it('throws a standing car about while it lasts, and then stops', () => {
    const w = flatBench();
    const c = w.player;
    put(c, w.oval!.cx, w.oval!.cy, 0);
    rangeEvent(w, def, c.x + 40, c.y + 10);
    let moved = 0;
    for (let i = 0; i < 60 * 3; i++) {
      w.step(idle);
      moved = Math.max(moved, Math.hypot(c.vx, c.vy));
    }
    expect(moved).toBeGreaterThan(8);
    for (let i = 0; i < 60 * 3; i++) w.step(idle);
    expect(Math.hypot(c.vx, c.vy)).toBeLessThan(1);
  });

  it('brings down scenery near the middle and leaves what is far off standing', () => {
    const w = flatBench();
    const wall = loadContent().prop.get('prop.window-wall')!;
    const near = stand(w, wall, 400, 400, 0, 0);
    const far = stand(w, wall, 400 + def.reach * 0.95, 400, 0, 0);
    rangeEvent(w, def, 404, 400);
    for (let i = 0; i < 60 * 2; i++) w.step(idle);
    expect(near.down).toBe(true);
    expect(far.down).toBeFalsy();
  });
});
