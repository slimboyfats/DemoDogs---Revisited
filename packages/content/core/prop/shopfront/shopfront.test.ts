import { describe, expect, it } from 'vitest';
import { explode, stand } from '@demodogs/sim';
import { flatBench } from '../../../src/testing';

describe('prop.shopfront', () => {
  it('is three floors that come down a floor at a time, then topple', () => {
    const w = flatBench();
    const def = w.content.prop.get('prop.shopfront')!;
    const s = stand(w, def, w.oval!.cx, w.oval!.cy, 0, 0);
    expect(s.storeys).toBe(3);
    const ev: string[] = [];
    for (let k = 0; k < 30 && !s.down; k++) {
      explode(w, s.x + 7, s.y, 1, null);
      for (const e of w.takeEvents()) ev.push(e.t);
    }
    expect(s.down).toBe(true);
    expect(ev.filter((t) => t === 'storey').length).toBeGreaterThanOrEqual(1);
  });
});
