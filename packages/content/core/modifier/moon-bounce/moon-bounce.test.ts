import { describe, expect, it } from 'vitest';
import { flatBench, put } from '../../../src/testing';

/** Ticks a car thrown up at 120 art px a second stays off the ground. */
function hang(modifiers: string[]): number {
  const w = flatBench({ modifiers });
  const c = w.player;
  put(c, w.oval!.cx, w.oval!.cy, 0);
  c.vz = 120;
  c.z = 0.1;
  let n = 0;
  while (c.z > 0 && n < 600) {
    w.step();
    n++;
  }
  return n;
}

describe('modifier.moon-bounce', () => {
  it('hangs a car in the air about three times as long', () => {
    const moon = hang(['modifier.moon-bounce']);
    const earth = hang([]);
    expect(moon / earth).toBeGreaterThan(2.6);
    expect(moon / earth).toBeLessThan(4);
  });

  it('keeps loose scenery up longer too', () => {
    const up = (modifiers: string[]) => {
      const w = flatBench({ modifiers });
      const def = w.content.prop.get('prop.cone')!;
      const p = { index: 0, def, x: 300, y: 300, z: 1, vx: 0, vy: 0, vz: 100, rot: 0, spin: 0 };
      w.props.push({ ...p, alive: true, fuse: 0, owner: -1 });
      let n = 0;
      while (w.props[0]!.z > 0 && n < 600) {
        w.step();
        n++;
      }
      return n;
    };
    expect(up(['modifier.moon-bounce'])).toBeGreaterThan(up([]) * 2.5);
  });
});
