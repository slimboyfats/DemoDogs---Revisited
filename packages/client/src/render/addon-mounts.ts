import { ADDON_KINDS, type AddonKind } from '@demodogs/shared';
import type { Car } from '@demodogs/sim';
import type { Strip } from './stack';
import { at, pixels, voxels } from './strips';

/**
 * Where add-ons are bolted to a car. The sim only knows a car has one; where it sits is read off
 * the car's own shape here (the top of its bodywork, where its cab is), so the same scoop lands
 * on a van's short bonnet and a racer's long one. Shared by the drawing and by the effects, so
 * a plate blows off from where it was drawn.
 */

/** A place on a car, in its own frame: x forward, y to its right, z up from the ground under it. */
export interface Mount {
  x: number;
  y: number;
  z: number;
  /** Turned this much from the car's heading. */
  rot: number;
}

/** How far the bottom of a car's body is drawn above the ground. */
const BODY_Z = 0.6;

interface Shape {
  /** The cab: how high the body's highest stretch is, and where along the car its middle is. */
  roofZ: number;
  roofX: number;
  tops: Map<number, number>;
}
const shapes = new WeakMap<Strip, Shape>();

/** The height of a car body's skin at (x, y) in the car's frame, from the ground. */
export function topAt(body: Strip, x: number, y: number): number {
  const S = shapeOf(body);
  const tx = Math.round((x + body.cw / body.res / 2) * body.res);
  const ty = Math.round((y + body.ch / body.res / 2) * body.res);
  const key = ty * body.cw + tx;
  let top = S.tops.get(key);
  if (top === undefined) {
    top = BODY_Z;
    if (tx >= 0 && ty >= 0 && tx < body.cw && ty < body.ch) {
      const V = voxels(body, pixels(body));
      for (let i = body.n - 1; i >= 0; i--)
        if (V.px[at(V, tx, ty, i) + 3]) {
          top = BODY_Z + (i + 1) / body.res;
          break;
        }
    }
    S.tops.set(key, top);
  }
  return top;
}

function shapeOf(body: Strip): Shape {
  let S = shapes.get(body);
  if (!S) {
    S = { roofZ: 0, roofX: 0, tops: new Map() };
    shapes.set(body, S);
    const half = body.cw / body.res / 2;
    const line: [number, number][] = [];
    for (let x = -half + 2; x <= half - 2; x += 0.5) line.push([x, topAt(body, x, 0)]);
    S.roofZ = Math.max(...line.map((p) => p[1]));
    const cab = line.filter((p) => p[1] > S!.roofZ - 0.8);
    S.roofX = (cab[0]![0] + cab[cab.length - 1]![0]) / 2;
  }
  return S;
}

/** The height the top of a roll cage stands at in its look. */
const CAGE_TOP = 9.3;

/**
 * Where on car `c` each piece of add-on `kind` goes; `body` is the car's bodywork as built, not
 * as dented. Plates: `n` of them are still on.
 */
export function mounts(c: Car, kind: AddonKind, body: Strip, n = c.fit[kind]?.n ?? 0): Mount[] {
  const D = c.def;
  const hl = D.body.halfLength;
  const hw = D.body.halfWidth;
  const S = shapeOf(body);
  const each = (f: (wx: number, wy: number, sg: number) => Mount): Mount[] =>
    D.wheels.flatMap((wh) => [-1, 1].map((sg) => f(wh[0], wh[1], sg)));
  switch (kind) {
    case 'rims':
      return each((wx, wy, sg) => ({
        x: wx,
        y: sg * (wy + (c.fit.paws ? 3.1 : 2.7)),
        z: 0,
        rot: sg > 0 ? 0 : Math.PI,
      }));
    case 'paws':
      return each((wx, wy, sg) => ({ x: wx, y: sg * wy, z: 0, rot: 0 }));
    case 'tank': {
      const x = -hl + 5.5;
      const y = c.fit.jet ? -2.1 : 0;
      return [{ x, y, z: topAt(body, x, y) - 0.1, rot: 0 }];
    }
    case 'jet': {
      const x = -hl + 4.2;
      const y = c.fit.tank ? 2.1 : 0;
      return [{ x, y, z: topAt(body, x + 1.5, y) - 0.1, rot: 0 }];
    }
    case 'scoop': {
      const x = hl * 0.52;
      return [{ x, y: 0, z: topAt(body, x - 1, 0) - 0.25, rot: 0 }];
    }
    case 'barrel':
      // not a piece of its own: the nose gun is drawn with a second barrel over each of its two
      return [];
    case 'cage':
      return [{ x: S.roofX, y: 0, z: S.roofZ + 1.2 - CAGE_TOP, rot: 0 }];
    case 'magnet':
      return [{ x: S.roofX - 0.5, y: 0, z: S.roofZ - 0.4, rot: 0 }];
    case 'plates': {
      const slots: Mount[] = [];
      for (const x of [2.8, -3.2])
        for (const sg of [1, -1])
          slots.push({ x, y: sg * (hw + 0.5), z: 1.5, rot: sg > 0 ? 0 : Math.PI });
      return slots.slice(0, Math.max(0, n));
    }
    case 'jaws':
      return [{ x: hl + (c.blade ? 3.6 : 1.7), y: 0, z: 0.5, rot: 0 }];
  }
}

/**
 * A mount on car `c`, in the world: [x, y, z, rot]. A car that has grown or shrunk is laid out `k`
 * times as far from its middle and stands `up` times as tall, and its add-ons go with it.
 */
export function place(
  c: Car,
  m: Mount,
  k = c.size,
  up = k,
  base = c.z,
): [number, number, number, number] {
  const cs = Math.cos(c.h) * k;
  const sn = Math.sin(c.h) * k;
  return [c.x + cs * m.x - sn * m.y, c.y + sn * m.x + cs * m.y, base + m.z * up, c.h + m.rot];
}

/** The add-ons a car has on, in a fixed order. */
export const fitted = (c: Car): AddonKind[] => ADDON_KINDS.filter((k) => c.fit[k]);
