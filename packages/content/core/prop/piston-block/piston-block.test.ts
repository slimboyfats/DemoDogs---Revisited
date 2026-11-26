import { describe, expect, it } from 'vitest';
import { gateOpen, stand } from '@demodogs/sim';
import { loadContent } from '../../../src/index';
import { bench, openSpot, put } from '../../../src/testing';

describe('prop.piston-block', () => {
  const def = loadContent().prop.get('prop.piston-block')!;
  /** A row of four across a way that runs along x, at an open spot. */
  const row = () => {
    const w = bench();
    const [x, y] = openSpot(w, 120);
    return { w, x, y, blocks: [-27, -9, 9, 27].map((v) => stand(w, def, x, y + v, 0, 0)) };
  };

  it('a row is a wave: one block stands at a time, each in turn, so there is always a gap and it moves', () => {
    const { w, blocks } = row();
    const G = def.gate!;
    const down = blocks.map(() => 0);
    let n = 0;
    let gap = 0;
    for (let t = 0; t < G.period; t += 0.02, n++) {
      const open = blocks.map((b) => gateOpen(w, b, t));
      open.forEach((o, k) => (down[k]! += o ? 1 : 0));
      // three of the four are down at any moment, so one always stands
      expect(open.filter(Boolean).length).toBe(3);
      // and there is always a way through: two side by side
      if (open.some((o, k) => k < 3 && o && open[k + 1])) gap++;
    }
    for (const d of down) expect(d / n).toBeCloseTo(G.open / G.period, 1);
    expect(gap).toBe(n);
    // the block that stands moves along the row
    const up = (t: number) => blocks.findIndex((b) => !gateOpen(w, b, t));
    expect(new Set([0, 1.2, 2.4, 3.6].map((t) => up(t + 0.1))).size).toBe(4);
  });

  it('stops a car where it stands and lets one by where it is down', () => {
    const run = (through: boolean) => {
      const { w, x, y, blocks } = row();
      for (let i = 0; i < 7; i++) w.step();
      // between two blocks that are both down now, or straight at the one that stands
      let lane = 0;
      for (let k = 0; k < 3; k++) if (blocks[k]!.down && blocks[k + 1]!.down) lane = -18 + k * 18;
      if (!through) lane = -27 + blocks.findIndex((b) => !b.down) * 18;
      const c = w.player;
      put(c, x - 34, y + lane, 0, 150);
      for (let i = 0; i < 24; i++)
        w.step({ steer: 0, throttle: 1, brake: false, boost: false, fire: false });
      return c.x - x;
    };
    expect(run(true)).toBeGreaterThan(20);
    expect(run(false)).toBeLessThan(0);
  });
});
