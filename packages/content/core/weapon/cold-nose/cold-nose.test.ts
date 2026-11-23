import { describe, expect, it } from 'vitest';
import { NO_CONTROLS } from '@demodogs/shared';
import { stand } from '@demodogs/sim';
import { loadContent } from '../../../src/index';
import { armed, put } from '../../../src/testing';

describe('weapon.cold-nose', () => {
  it('kills the engines round the car, puts fires out and freezes the road behind', () => {
    const C = loadContent();
    const { w, me, rivals, def, x, y, run } = armed('weapon.cold-nose');
    const t = rivals[0]!;
    put(me, x, y, 0);
    put(t, x + 30, y + 20, 0);
    w.blazes.push({ x: x + 20, y: y - 20, r: 8, t: 9, bite: 0.3, owner: -1 });
    const tree = stand(w, C.prop.get('prop.tree')!, x - 10, y + 40, 0, 0);
    const leaves = tree.leaves!;
    const events = run(1, { ...NO_CONTROLS, fire: true });
    expect(events.find((e) => e.t === 'frost')).toMatchObject({ car: me.index, r: def.radius });
    expect(t.stall).toBeGreaterThan(1);
    expect(me.stall ?? 0).toBe(0);
    expect(events.find((e) => e.t === 'stall')).toMatchObject({ car: t.index, by: me.index });
    expect(w.blazes.length).toBe(0);
    expect(events.map((e) => e.t)).toContain('quench');
    expect(tree.leaves).toBeLessThan(leaves);
    const ice = w.spills.filter((s) => s.def.id === 'material.ice');
    expect(ice.length).toBe(def.count! + 1);
    for (const s of ice) expect(s.x).toBeLessThan(me.x);
  });

  it('leaves a car far off alone', () => {
    const { me, rivals, x, y, run } = armed('weapon.cold-nose');
    put(me, x, y, 0);
    put(rivals[0]!, x + 150, y, 0);
    run(1, { ...NO_CONTROLS, fire: true });
    expect(rivals[0]!.stall ?? 0).toBe(0);
  });
});
