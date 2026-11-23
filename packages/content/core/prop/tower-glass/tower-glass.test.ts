import { describe, expect, it } from 'vitest';
import { explode, stand } from '@demodogs/sim';
import { flatBench } from '../../../src/testing';

describe('prop.tower-glass', () => {
  it('loses its floors from the top, one at a time, as blasts hit it', () => {
    const w = flatBench();
    const def = w.content.prop.get('prop.tower-glass')!;
    const s = stand(w, def, w.oval!.cx, w.oval!.cy, 0, 0);
    const n = def.storeys!;
    expect(s.storeys).toBe(n);
    const seen: number[] = [];
    for (let k = 0; k < 40 && !s.down; k++) {
      explode(w, s.x + 8, s.y, 1.2, null);
      for (const e of w.takeEvents()) if (e.t === 'storey' && e.prop === s.index) seen.push(e.left);
    }
    expect(seen.length).toBeGreaterThan(2);
    // each floor goes on its own, top first
    expect(seen).toEqual([...seen].sort((a, b) => b - a));
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('falls over the way it leans and lays rubble along where it lands', () => {
    const w = flatBench();
    const def = w.content.prop.get('prop.tower-glass')!;
    const s = stand(w, def, w.oval!.cx, w.oval!.cy, 0, 0);
    s.lean = 0;
    s.group = 99;
    s.bears = true;
    const before = w.statics.length;
    s.hp = 1;
    explode(w, s.x - 6, s.y, 1, null);
    expect(s.down).toBe(true);
    const rubble = w.statics.slice(before).filter((r) => r.def.id === 'prop.rubble');
    expect(rubble.length).toBeGreaterThan(4);
    expect(Math.max(...rubble.map((r) => r.x - s.x))).toBeGreaterThan(40);
    expect(rubble.every((r) => Math.abs(r.y - s.y) < 8)).toBe(true);
  });
});
