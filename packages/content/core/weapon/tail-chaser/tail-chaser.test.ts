import { describe, expect, it } from 'vitest';
import { NO_CONTROLS } from '@demodogs/shared';
import { stand } from '@demodogs/sim';
import { loadContent } from '../../../src/index';
import { armed, put } from '../../../src/testing';

describe('weapon.tail-chaser', () => {
  it('goes after the car ahead, drags it round, lifts it and hurts it', () => {
    const { w, me, rivals, def, x, y, run } = armed('weapon.tail-chaser');
    const t = rivals[0]!;
    put(me, x - 160, y, 0);
    put(t, x - 40, y + 20, 0);
    run(1, { ...NO_CONTROLS, fire: true });
    const tw = w.wild.twisters[0]!;
    expect(tw.x).toBeGreaterThan(me.x + 20);
    let top = 0;
    let turned = 0;
    const h0 = t.h;
    for (let i = 0; i < 240; i++) {
      run(1);
      top = Math.max(top, t.z);
      turned = Math.max(turned, Math.abs(t.h - h0));
    }
    expect(top).toBeGreaterThan(5);
    expect(turned).toBeGreaterThan(1);
    expect(t.hp).toBeLessThan(100);
    run(Math.ceil(def.life! * 60));
    expect(w.wild.twisters.length).toBe(0);
  });

  it('strips a tree, tears up a fence and carries a crate off', () => {
    const C = loadContent();
    const { w, me, x, y, run } = armed('weapon.tail-chaser', 0);
    put(me, x - 60, y, 0);
    const tree = stand(w, C.prop.get('prop.tree')!, x - 10, y + 14, 0, 0);
    const fence = stand(w, C.prop.get('prop.plank-fence')!, x - 20, y - 10, 0, 0);
    w.props.push({
      index: 0,
      def: loadContent().prop.get('prop.crate')!,
      x: x - 30,
      y: y + 8,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      rot: 0,
      spin: 0,
      alive: true,
      fuse: 0,
      owner: -1,
    });
    const leaves = tree.leaves!;
    const [cx, cy] = [w.props[0]!.x, w.props[0]!.y];
    const events = run(1, { ...NO_CONTROLS, fire: true });
    events.push(...run(200));
    expect(tree.leaves).toBeLessThan(leaves);
    expect(events.map((e) => e.t)).toContain('strip');
    expect(fence.hp! < 30 || fence.down).toBeTruthy();
    const p = w.props[0]!;
    expect(!p.alive || Math.hypot(p.x - cx, p.y - cy) > 10).toBe(true);
  });
});
