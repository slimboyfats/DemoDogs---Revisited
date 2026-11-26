import { describe, expect, it } from 'vitest';
import { stand } from '@demodogs/sim';
import { loadContent } from '../../../src/index';
import { bench, openSpot, put } from '../../../src/testing';

describe('prop.floor-switch', () => {
  it('opens the switch bollards within its reach and not those beyond it', () => {
    const w = bench();
    const C = loadContent();
    const [x, y] = openSpot(w, 100);
    const sw = stand(w, C.prop.get('prop.floor-switch')!, x, y, 0, 0);
    const near = stand(w, C.prop.get('prop.switch-bollard')!, x + 200, y, 0, 0);
    const far = stand(w, C.prop.get('prop.switch-bollard')!, x + sw.def.pad!.long + 900, y, 0, 0);
    put(w.player, x, y, 0, 0);
    w.step();
    expect(near.down).toBe(true);
    expect(far.down).toBeFalsy();
  });
});
