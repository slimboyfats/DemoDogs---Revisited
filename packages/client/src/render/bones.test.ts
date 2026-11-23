import { describe, expect, it } from 'vitest';
import type { Bone } from '@demodogs/shared';
import { around, queueRig, rigTall, rollPose, tickBones, type RigArt } from './bones';
import type { Strip } from './stack';

const strip = (n: number, tag = 0): Strip => ({ n, res: 3, cw: 3, ch: 3, cols: n, tag }) as never;
const part = { w: 1, h: 1, layers: 1, fn: () => 'wood' };

/** Queue a rig and say where each stack went. */
function drawn(A: RigArt, rot: number, time: number, cars: { x: number; y: number }[] | null) {
  const out: { s: Strip; x: number; y: number; z: number; rot: number }[] = [];
  const key = {};
  const R = {
    stack: (s: Strip, x: number, y: number, z: number, r: number) =>
      out.push({ s, x, y, z, rot: r }),
  };
  // twice, a moment apart: what eases has had time to move
  queueRig(R, A, 100, 50, 0, rot, 1, time, 0, key, cars);
  out.length = 0;
  for (let k = 1; k <= 60; k++) {
    out.length = 0;
    queueRig(R, A, 100, 50, 0, rot, 1, time + k / 60, 0, key, cars);
  }
  return out;
}
const rig = (...bones: Bone[]): RigArt => ({
  size: 1,
  bare: [strip(30)],
  bones: bones.map((bone) => ({
    bone,
    poses:
      bone.move?.kind === 'roll'
        ? Array.from({ length: bone.move.steps }, (_, k) => strip(6, k))
        : [strip(6)],
  })),
});

describe('bones', () => {
  it('finds the shortest way round between two angles', () => {
    expect(around(0.1, -0.1)).toBeCloseTo(-0.2);
    expect(around(3, -3)).toBeCloseTo(Math.PI * 2 - 6);
  });

  it('shows each pose of a roll in turn, as often in a turn as it has folds', () => {
    expect(rollPose(0, 4, 12)).toBe(0);
    expect(rollPose(0.124, 4, 12)).toBe(5);
    expect(rollPose(0.25, 4, 12)).toBe(0);
    expect(rollPose(-0.01, 4, 12)).toBe(11);
  });

  it('draws the bare part, then each bone on its pivot turned with the thing', () => {
    const A = rig({ part, at: [4, 0, 10] }, { part, at: [2, 0, 1], on: 0 });
    const d = drawn(A, Math.PI / 2, 0, null);
    expect(d[0]).toMatchObject({ s: A.bare[0], x: 100, y: 50, z: 0 });
    // forward is +y for a thing turned a quarter round
    expect(d[1]!.x).toBeCloseTo(100);
    expect(d[1]!.y).toBeCloseTo(54);
    expect(d[1]!.z).toBe(10);
    expect(d[2]!.y).toBeCloseTo(56);
    expect(d[2]!.z).toBe(11);
    expect(rigTall(A)).toBe(13);
  });

  it('stands the bones of a thing drawn twice its size twice as far out', () => {
    const A = { ...rig({ part, at: [4, 0, 10] }), size: 2 };
    const d = drawn(A, 0, 0, null);
    expect(d[1]).toMatchObject({ x: 108, y: 50, z: 20 });
    expect(rigTall(A)).toBe(22);
  });

  it('turns a turning bone with the clock, and what rides on it goes round with it', () => {
    const A = rig(
      { part, at: [0, 0, 5], move: { kind: 'turn', rate: Math.PI } },
      {
        part,
        at: [3, 0, 0],
        on: 0,
      },
    );
    // after one more second at half a turn a second
    const d = drawn(A, 0, 0, null);
    expect(Math.cos(d[1]!.rot)).toBeCloseTo(-1);
    expect(d[2]!.x).toBeCloseTo(97);
  });

  it('turns a watching bone to the nearest car in reach, no further than its arc', () => {
    const A = rig({ part, at: [0, 0, 5], move: { kind: 'watch', reach: 80, arc: 1 } });
    // a car off to the side at +y: it would be a quarter turn, the arc stops it at 1
    expect(drawn(A, 0, 0, [{ x: 100, y: 90 }])[1]!.rot).toBeCloseTo(1, 1);
    expect(drawn(A, 0, 0, [{ x: 140, y: 70 }])[1]!.rot).toBeCloseTo(Math.atan2(20, 40), 1);
    // nothing in reach, or nothing to watch: straight ahead
    expect(drawn(A, 0, 0, [{ x: 400, y: 50 }])[1]!.rot).toBeCloseTo(0);
    expect(drawn(A, 0.5, 0, null)[1]!.rot).toBeCloseTo(0.5);
  });

  it('rolls through its poses as time goes by', () => {
    const A = rig({ part, at: [0, 0, 5], move: { kind: 'roll', rate: 1, steps: 4 } });
    tickBones(0);
    const seen = new Set<number>();
    for (let t = 0; t < 1; t += 0.05) {
      const out: Strip[] = [];
      queueRig({ stack: (s) => out.push(s) }, A, 0, 0, 0, 0, 1, t, 0, A, null);
      seen.add((out[1] as unknown as { tag: number }).tag);
    }
    expect([...seen].sort()).toEqual([0, 1, 2, 3]);
  });
});
