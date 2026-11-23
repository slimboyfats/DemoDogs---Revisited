import { describe, expect, it } from 'vitest';
import { explode } from '@demodogs/sim';
import { propTest } from '../../../src/testing';

describe('prop.fuel-barge', () => {
  it('holed, it goes up, leaves fuel burning and throws drums', () => {
    const r = propTest('prop.fuel-barge', 0);
    const w = r.world;
    const s = r.piece!;
    w.takeEvents();
    for (let i = 0; i < 6 && !s.down; i++) explode(w, s.x + 14, s.y, 1, null);
    expect(s.down).toBe(true);
    const seen: string[] = [];
    for (let i = 0; i < 300; i++) {
      w.step();
      for (const e of w.takeEvents()) seen.push(e.t);
    }
    expect(seen).toContain('blaze');
    expect(w.props.filter((p) => p.def.id === 'prop.barrel').length).toBe(3);
  });
});
