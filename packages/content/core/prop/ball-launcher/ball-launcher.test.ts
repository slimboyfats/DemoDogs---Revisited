import { describe, expect, it } from 'vitest';
import { putProp } from '@demodogs/sim';
import { flatBench, propTest, runUntil } from '../../../src/testing';

describe('prop.ball-launcher', () => {
  it('stops a car dead and stands', () => {
    const r = propTest('prop.ball-launcher', 170);
    expect(r.blocked).toBe(true);
    expect(r.piece!.down).toBeFalsy();
  });

  it('lobs tennis balls the way it faces, to land where it said, and keeps only so many out', () => {
    const w = flatBench();
    const def = w.content.prop.get('prop.ball-launcher')!;
    const s = putProp(w, def, w.w / 2, w.h / 2, 0, w.rng)!;
    const before = w.props.length;
    const throws: { tx: number; ty: number; time: number; prop: number }[] = [];
    runUntil(
      w,
      () => {
        for (const e of w.takeEvents()) if (e.t === 'throw') throws.push(e);
        return throws.length >= 1;
      },
      60 * 6,
    );
    const first = throws[0]!;
    expect(first.tx - s.x).toBeGreaterThan(80);
    const ball = w.props[first.prop]!;
    expect(ball.z).toBeGreaterThan(8);
    // it comes down where the throw said it would, give or take
    runUntil(w, () => ball.z <= 0, 60 * 4);
    expect(Math.hypot(ball.x - first.tx, ball.y - first.ty)).toBeLessThan(12);
    // a minute on, it has thrown many times but only its pool of balls is out
    runUntil(w, () => false, 60 * 60);
    expect(w.props.length - before).toBe(def.thrower!.pool);
  });
});
