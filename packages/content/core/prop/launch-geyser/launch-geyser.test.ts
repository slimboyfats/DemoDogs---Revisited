import { describe, expect, it } from 'vitest';
import { stand, ventOpen } from '@demodogs/sim';
import { loadContent } from '../../../src/index';
import { flatBench, put } from '../../../src/testing';

describe('prop.launch-geyser', () => {
  const def = loadContent().prop.get('prop.launch-geyser')!;
  /** Drive over it at racing speed while it blows, or while it is quiet: how high and how far in the air. */
  const run = (blowing: boolean) => {
    const w = flatBench();
    const x = w.oval!.cx;
    const y = w.oval!.cy;
    const s = stand(w, def, x, y, 0, 0);
    for (let i = 0; i < 600 && ventOpen(w, s) === blowing; i++) w.step();
    for (let i = 0; i < 600 && ventOpen(w, s) !== blowing; i++) w.step();
    const c = w.player;
    put(c, x - 30, y, 0, 170);
    let maxZ = 0;
    let far = 0;
    for (let i = 0; i < 90; i++) {
      w.step({ steer: 0, throttle: 1, brake: false, boost: false, fire: false });
      maxZ = Math.max(maxZ, c.z);
      if (c.z > 1) far = c.x - x;
    }
    return { maxZ, far };
  };
  it('throws a car far enough to clear a jump of 150 px while it blows', () => {
    const r = run(true);
    expect(r.maxZ).toBeGreaterThan(40);
    expect(r.far).toBeGreaterThan(170);
  });
  it('lets a car drive on while it is quiet', () => {
    expect(run(false).maxZ).toBeLessThan(1);
  });
  it('blows for nearly half of its beat', () => {
    const w = flatBench();
    const s = stand(w, def, w.oval!.cx, w.oval!.cy, 0, 3);
    let on = 0;
    const pad = def.pad!;
    const n = Math.round(pad.kind === 'vent' ? pad.period * 60 : 0);
    for (let i = 0; i < n; i++) {
      w.step();
      if (ventOpen(w, s)) on++;
    }
    expect(on / n).toBeGreaterThan(0.4);
    expect(on / n).toBeLessThan(0.5);
  });
});
