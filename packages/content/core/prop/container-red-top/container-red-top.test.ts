import { describe, expect, it } from 'vitest';
import { explode, fall, stand } from '@demodogs/sim';
import { loadContent } from '../../../src/index';
import { bench, openSpot } from '../../../src/testing';

const P = loadContent().prop;

/** A box with this one stacked on it, as the container yards put them up. */
function stack() {
  const w = bench();
  const [x, y] = openSpot(w, 100);
  const b = stand(w, P.get('prop.container-red')!, x, y, 0, 0);
  const t = stand(w, P.get('prop.container-red-top')!, x, y, 0, 0);
  Object.assign(b, { group: 9999, bears: true });
  Object.assign(t, { group: 9999, bears: false });
  return { w, b, t, x, y };
}

describe('prop.container-red-top', () => {
  it('blown off the stack, it falls whole on the far side and the box under it stays', () => {
    const { w, b, t, x, y } = stack();
    for (let i = 0; i < 4 && !t.down; i++) explode(w, x - 14, y, 0.6, null);
    expect(t.down).toBe(true);
    expect(b.down).toBeFalsy();
    const p = w.props.find((p) => p.def.id === 'prop.container-red-loose')!;
    expect(p).toBeDefined();
    for (let i = 0; i < 90; i++) w.step();
    expect(p.z).toBe(0);
    expect(p.x).toBeGreaterThan(x + 8);
  });

  it('comes down with the box under it', () => {
    const { w, b, t, x, y } = stack();
    fall(w, b, x, y);
    expect(t.down).toBe(true);
    expect(w.props.some((p) => p.def.id === 'prop.container-red-loose')).toBe(true);
  });
});
