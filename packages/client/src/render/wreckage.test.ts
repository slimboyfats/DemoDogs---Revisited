import { describe, expect, it } from 'vitest';
import type { Strip } from './stack';
import { at, type Voxels } from './strips';
import { blank } from './rubble';
import { stepVoxel, type Voxel } from './voxels';
import { PLAIN, Wreckage, type Breaks, type Owner, type WreckHost } from './wreckage';

function seeded(seed = 11): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** A strip without a canvas: all the wreckage reads of one is its size and its pixels. */
function stripOf(v: Voxels): Strip {
  return {
    img: { width: v.W, height: v.px.length / 4 / v.W } as HTMLCanvasElement,
    cw: v.cw,
    ch: v.ch,
    n: v.n,
    res: v.res,
    cols: v.cols,
    px: v.px,
  };
}

/** A solid slab of road, 9 by 40 art px and 8 tall, at res 3. */
function road(): Strip {
  const v = blank(27, 120, 24, 3);
  for (let z = 0; z < 24; z++)
    for (let y = 0; y < 120; y++)
      for (let x = 0; x < 27; x++) v.px.set([90, 90, 96, 255], at(v, x, y, z));
  return stripOf(v);
}

function rig(max = 4000) {
  const voxels: Voxel[] = [];
  const log = { dropped: 0, changed: 0, dust: 0, sparks: 0, thuds: 0, soaked: 0 };
  const host: WreckHost = {
    voxels,
    room: () => Math.max(0, max - voxels.length),
    strip: stripOf,
    changed: () => log.changed++,
    dropped: () => log.dropped++,
    dust: () => log.dust++,
    spark: () => log.sparks++,
    thud: () => log.thuds++,
    soak: () => log.soaked++,
  };
  const W = new Wreckage(host, seeded());
  /** Run the world on: the wreckage, and the loose grit the way effects.ts moves it. */
  const run = (steps: number, shovers: Parameters<Wreckage['step']>[1] = []) => {
    for (let k = 0; k < steps; k++) {
      W.step(1 / 60, shovers);
      for (let i = voxels.length - 1; i >= 0; i--) {
        const v = voxels[i]!;
        const fate = stepVoxel(v, 1 / 60, v.pile ? W.floor(v.x, v.y) : 0);
        if (fate !== 'rest') continue;
        if (!W.settle(v)) log.soaked++;
        voxels[i] = voxels[voxels.length - 1]!;
        voxels.pop();
      }
    }
  };
  return { W, voxels, log, run };
}

const deck = (): Owner => ({ x: 100, y: 100, rot: 0.4, lift: 20 });
const drop = (W: Wreckage, o: Owner, mat: Breaks = PLAIN, rebuilds = true) =>
  W.fall({ o, strip: road(), own: false, mat, rebuilds, ox: o.x - 30, oy: o.y });

describe('wreckage', () => {
  it('only cracks things big enough to make pieces of', () => {
    expect(Wreckage.cracks(road())).toBe(true);
    expect(Wreckage.cracks(stripOf(blank(6, 6, 6, 3)))).toBe(false);
  });

  it('something that falls cracks into pieces and grit, and ends as rubble lying still', () => {
    const { W, voxels, log, run } = rig();
    drop(W, deck());
    expect(W.falling.length).toBe(1);
    run(1);
    expect(W.falling.length).toBe(0);
    expect(W.pieces.length).toBeGreaterThanOrEqual(3);
    expect(voxels.length).toBeGreaterThan(50);
    for (const p of W.pieces) expect(p.z).toBeGreaterThan(10);
    run(600);
    expect(voxels.length).toBe(0);
    for (const p of W.pieces) {
      expect(p.still).toBe(true);
      // on the ground or on top of another piece, never left hanging where it stood
      expect(p.z).toBeLessThan(18);
    }
    expect(W.grains.length).toBeGreaterThan(50);
    expect(W.heap.size).toBeGreaterThan(20);
    expect(log.thuds).toBeGreaterThan(0);
    expect(log.dust).toBeGreaterThan(0);
  });

  it('what it is made of decides how: brittle stuff ends in more, smaller pieces than tough', () => {
    const brittle = rig();
    const tough = rig();
    drop(brittle.W, deck(), { ...PLAIN, piece: 5, brittle: 1, grit: 0.8 });
    drop(tough.W, deck(), { ...PLAIN, piece: 14, brittle: 0, grit: 0.1, sparks: true });
    brittle.run(600);
    tough.run(600);
    expect(brittle.W.pieces.length).toBeGreaterThan(tough.W.pieces.length);
    expect(brittle.W.grains.length).toBeGreaterThan(tough.W.grains.length);
    expect(tough.log.sparks).toBeGreaterThan(0);
    expect(brittle.log.sparks).toBe(0);
  });

  it('grit that lands on a lying piece rests on top of it', () => {
    const { W, run } = rig();
    drop(W, deck());
    run(600);
    const p = W.pieces[0]!;
    expect(W.floor(p.x, p.y)).toBeGreaterThanOrEqual(p.z + p.tall * Math.cos(p.tilt) - 1e-6);
  });

  it('a car ploughing through shoves pieces aside and kicks the grit up', () => {
    const { W, voxels, run } = rig();
    drop(W, deck());
    run(600);
    const p = W.pieces[0]!;
    const before = [p.x, p.y];
    const grains = W.grains.length;
    run(1, [{ x: p.x - 2, y: p.y, vx: 90, vy: 0, deck: 0 }]);
    expect(p.still).toBe(false);
    expect(voxels.length).toBeGreaterThan(0);
    expect(W.grains.length).toBeLessThan(grains);
    run(600);
    expect(p.still).toBe(true);
    expect(p.x).toBeGreaterThan(before[0]!);
    // a car up on the deck, or a slow one, moves nothing
    const q = W.pieces[1]!;
    run(1, [{ x: q.x, y: q.y, vx: 90, vy: 0, deck: 20 }]);
    run(1, [{ x: q.x, y: q.y, vx: 5, vy: 0, deck: 0 }]);
    expect(q.still).toBe(true);
  });

  it('rebuilding flies every piece and grain back to exactly where it came from', () => {
    const { W, voxels, log, run } = rig();
    const o = deck();
    drop(W, o);
    run(600);
    const pieces = W.pieces.length;
    const grains = W.grains.length;
    W.mend([{ o, dur: 2.4, tall: 8 }]);
    expect(W.grains.length).toBe(0);
    expect(W.homing.length).toBe(grains);
    expect(W.pieces.every((p) => p.fly)).toBe(true);
    run(72);
    // part way: some have landed, some are still on the heap or in the air
    const placed = W.pieces.filter((p) => p.placed).length;
    const landed = W.homing.filter((h) => h.done).length;
    expect(landed).toBeGreaterThan(0);
    expect(landed).toBeLessThan(grains);
    expect(placed).toBeLessThanOrEqual(pieces);
    run(80);
    expect(W.pieces.every((p) => p.placed)).toBe(true);
    expect(W.homing.every((h) => h.done)).toBe(true);
    const cs = Math.cos(o.rot);
    const sn = Math.sin(o.rot);
    for (const p of W.pieces) {
      const h = p.home!;
      expect(p.x).toBeCloseTo(o.x + h.x * cs - h.y * sn, 6);
      expect(p.y).toBeCloseTo(o.y + h.x * sn + h.y * cs, 6);
      expect(p.z).toBeCloseTo(20 + h.z, 6);
      expect(p.rot).toBeCloseTo(o.rot, 6);
      expect(p.tilt).toBe(0);
    }
    // back inside the footprint of the thing, up where it stood
    for (const h of W.homing) {
      expect(Math.hypot(h.x - o.x, h.y - o.y)).toBeLessThan(25);
      expect(h.z).toBeGreaterThanOrEqual(20 - 1e-6);
    }
    const dropped = log.dropped;
    W.stand(o);
    expect(W.pieces.length).toBe(0);
    expect(W.homing.length).toBe(0);
    expect(voxels.length).toBe(0);
    expect(log.dropped).toBe(dropped + pieces);
    expect(W.heap.size).toBe(0);
  });

  it('the rebuild sweeps left to right', () => {
    const { W, run } = rig();
    const o: Owner = { x: 100, y: 100, rot: Math.PI / 2, lift: 20 };
    drop(W, o);
    run(600);
    W.mend([{ o, dur: 2.4, tall: 8 }]);
    const byX = [...W.pieces].sort((a, b) => a.fly!.to[0] - b.fly!.to[0]);
    expect(byX[0]!.fly!.dur).toBeLessThan(byX[byX.length - 1]!.fly!.dur);
  });

  it('rubble of something that is never rebuilt stays, and old pieces crumble to make room', () => {
    const { W, run } = rig();
    for (let i = 0; i < 40; i++) {
      drop(W, { x: 100 + i * 60, y: 100, rot: 0 }, PLAIN, false);
      run(120);
    }
    expect(W.pieces.length).toBeGreaterThan(20);
    expect(W.pieces.length).toBeLessThanOrEqual(160);
    expect(W.grains.length).toBeLessThanOrEqual(3600);
    W.mend([]);
    expect(W.pieces.every((p) => !p.fly)).toBe(true);
  });
});
