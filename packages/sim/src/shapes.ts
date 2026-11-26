import type { PropManifest } from '@demodogs/shared';
import type { Car } from './entities';

/**
 * Hit shapes: what of a thing can be run into, shot or driven over. Every rule that asks whether
 * two things touch asks here, and the hitbox view (client `render/hitbox-view.ts`) draws these
 * same shapes, so what is seen in it is what the rules use.
 *
 * A shape is a box lying flat with its corners rounded: `a` half its length along the way it is
 * turned and `b` half its width, both of the box inside the rounding, and `r` the rounding all
 * round it. A circle is one with no box (`a` and `b` nothing), a capsule one with no width.
 */
export interface Shape {
  x: number;
  y: number;
  /** The way it is turned: cos and sin of its heading. */
  cs: number;
  sn: number;
  a: number;
  b: number;
  r: number;
}

/** Where two shapes are nearest: how far apart (less than nothing: into each other), and the way out. */
export interface Touch {
  gap: number;
  /** A unit vector out of the thing asked about, towards what touches it. */
  nx: number;
  ny: number;
  /** The point of the thing's own edge that is nearest. */
  px: number;
  py: number;
}

export const newShape = (): Shape => ({ x: 0, y: 0, cs: 1, sn: 0, a: 0, b: 0, r: 0 });
export const newTouch = (): Touch => ({ gap: 0, nx: 1, ny: 0, px: 0, py: 0 });

/** How far a car's hull stands out past its body's half width and half length: arches, bumpers. */
const SKIN = 0.5;
/** How round the corners of a car's hull are, art px, on a car of its own size. */
const CORNER = 3;
/** How round the corners of a prop's box are, unless it says. */
const EDGE = 1;

/** Half the width of a car's hull: a swollen car's is wider, a shrunk one's narrower. */
export function hull(c: Car): number {
  return (c.def.body.halfWidth + SKIN) * c.size;
}

/** Half the length of a car's hull. */
export function reach(c: Car): number {
  return (c.def.body.halfLength + SKIN) * c.size;
}

/** The hull of car c, into `S`. */
export function carShape(c: Car, S: Shape): Shape {
  const hw = hull(c);
  const hl = reach(c);
  const r = Math.min(CORNER * c.size, hw);
  S.x = c.x;
  S.y = c.y;
  S.cs = Math.cos(c.h);
  S.sn = Math.sin(c.h);
  S.a = hl - r;
  S.b = hw - r;
  S.r = r;
  return S;
}

/** The shape of a prop of kind `def` standing at (x, y) turned `rot`, into `S`. */
export function propShape(def: PropManifest, x: number, y: number, rot: number, S: Shape): Shape {
  S.x = x;
  S.y = y;
  const H = def.hit;
  if (!H || 'radius' in H) {
    S.cs = 1;
    S.sn = 0;
    S.a = S.b = 0;
    S.r = H ? H.radius : def.radius;
    return S;
  }
  const r = Math.min(H.round ?? EDGE, H.halfLength, H.halfWidth);
  S.cs = Math.cos(rot);
  S.sn = Math.sin(rot);
  S.a = H.halfLength - r;
  S.b = H.halfWidth - r;
  S.r = r;
  return S;
}

/** The radius of a circle about a prop's middle that holds all of its shape. */
export function bound(def: PropManifest): number {
  const H = def.hit;
  if (!H) return def.radius;
  return 'radius' in H ? H.radius : Math.hypot(H.halfLength, H.halfWidth);
}

/** The radius of a prop taken as a ball: a loose one rolling against scenery, or the map's edge. */
export function girth(def: PropManifest): number {
  const H = def.hit;
  if (!H) return def.radius;
  return 'radius' in H ? H.radius : Math.min(H.halfLength, H.halfWidth);
}

/**
 * How far point (x, y) is from the edge of shape S (less than nothing inside it), with the way
 * out of S towards the point and the nearest point of S's edge in `T`.
 */
export function pointGap(S: Shape, x: number, y: number, T: Touch): number {
  const dx = x - S.x;
  const dy = y - S.y;
  const u = dx * S.cs + dy * S.sn;
  const v = -dx * S.sn + dy * S.cs;
  const su = u < 0 ? -1 : 1;
  const sv = v < 0 ? -1 : 1;
  const qx = u * su - S.a;
  const qy = v * sv - S.b;
  let lx: number;
  let ly: number;
  let gap: number;
  if (qx > 0 || qy > 0) {
    // outside the box inside the rounding: the nearest of its corners or sides
    const ox = qx > 0 ? qx : 0;
    const oy = qy > 0 ? qy : 0;
    const d = Math.hypot(ox, oy);
    lx = (su * ox) / d;
    ly = (sv * oy) / d;
    gap = d - S.r;
  } else if (S.a === 0 && S.b === 0) {
    // the very middle of a circle: any way is the way out
    lx = 1;
    ly = 0;
    gap = -S.r;
  } else if (qx > qy) {
    lx = su;
    ly = 0;
    gap = qx - S.r;
  } else {
    lx = 0;
    ly = sv;
    gap = qy - S.r;
  }
  T.gap = gap;
  T.nx = lx * S.cs - ly * S.sn;
  T.ny = lx * S.sn + ly * S.cs;
  T.px = x - T.nx * gap;
  T.py = y - T.ny * gap;
  return gap;
}

/** How far shape S reaches from its middle along the unit direction (dx, dy). */
export function extent(S: Shape, dx: number, dy: number): number {
  const u = dx * S.cs + dy * S.sn;
  const v = -dx * S.sn + dy * S.cs;
  return (u < 0 ? -u : u) * S.a + (v < 0 ? -v : v) * S.b + S.r;
}

const SCRATCH = newTouch();

/** The corners of the box inside S's rounding, by number: one for a circle, two for a capsule. */
function corners(S: Shape): number {
  return S.a === 0 && S.b === 0 ? 1 : S.a === 0 || S.b === 0 ? 2 : 4;
}
function cornerX(S: Shape, k: number): number {
  const u = k & 1 ? -S.a : S.a;
  const v = S.a === 0 ? (k & 1 ? -S.b : S.b) : k & 2 ? -S.b : S.b;
  return S.x + (S.a === 0 ? 0 : u) * S.cs - v * S.sn;
}
function cornerY(S: Shape, k: number): number {
  const u = k & 1 ? -S.a : S.a;
  const v = S.a === 0 ? (k & 1 ? -S.b : S.b) : k & 2 ? -S.b : S.b;
  return S.y + (S.a === 0 ? 0 : u) * S.sn + v * S.cs;
}

/**
 * The capsule that lies inside a shape along its longer side: `n` points along it, each the
 * middle of a circle of radius `w` that is all inside the shape. Read off these after `spine`.
 */
let spineN = 0;
let spineW = 0;
let spineX = 0;
let spineY = 0;
let spineDx = 0;
let spineDy = 0;
function spine(S: Shape): void {
  const long = S.a >= S.b;
  const half = long ? S.a - S.b : S.b - S.a;
  spineW = (long ? S.b : S.a) + S.r;
  // (a step apart at most the circle's own radius: nothing as thick as a wall gets between two)
  const steps = half > 0 ? Math.ceil((2 * half) / spineW) : 0;
  spineN = steps + 1;
  const ux = long ? S.cs : -S.sn;
  const uy = long ? S.sn : S.cs;
  spineX = S.x - ux * half;
  spineY = S.y - uy * half;
  spineDx = steps ? (ux * 2 * half) / steps : 0;
  spineDy = steps ? (uy * 2 * half) / steps : 0;
}

/**
 * How far apart shapes A and B are (less than nothing: that far into each other). In `T`: the way
 * out of B towards A (the way to push A), and the point of B's edge where they are nearest.
 *
 * Each one's corners are measured against the other, and the nearest taken: exact for anything
 * against a circle, and for two boxes whenever a corner of one is what touches the other. Two
 * boxes can also lie across each other with no corner of either inside the other (a fast car
 * half way through a thin wall), so the middle of each is measured too, as the row of circles
 * that fits inside it.
 */
export function shapeGap(A: Shape, B: Shape, T: Touch): number {
  let best = Infinity;
  const na = corners(A);
  const nb = corners(B);
  // (against a circle, the circle's middle measured against the other is the whole answer)
  for (let k = 0; k < na && (nb > 1 || na === 1); k++) {
    const g = pointGap(B, cornerX(A, k), cornerY(A, k), SCRATCH) - A.r;
    if (g < best) {
      best = g;
      T.nx = SCRATCH.nx;
      T.ny = SCRATCH.ny;
      T.px = SCRATCH.px;
      T.py = SCRATCH.py;
    }
  }
  for (let k = 0; k < nb && (na > 1 || nb === 1) && !(na === 1 && nb === 1); k++) {
    const bx = cornerX(B, k);
    const by = cornerY(B, k);
    const g = pointGap(A, bx, by, SCRATCH) - B.r;
    if (g < best) {
      best = g;
      // (the way out of A to B's corner, turned about: the way out of B)
      T.nx = -SCRATCH.nx;
      T.ny = -SCRATCH.ny;
      T.px = bx + T.nx * B.r;
      T.py = by + T.ny * B.r;
    }
  }
  // (a circle's middle is its one corner: measured already)
  if (na > 1 && nb > 1) {
    spine(A);
    for (let k = 0; k < spineN; k++) {
      const g = pointGap(B, spineX + spineDx * k, spineY + spineDy * k, SCRATCH) - spineW;
      if (g < best) {
        best = g;
        T.nx = SCRATCH.nx;
        T.ny = SCRATCH.ny;
        T.px = SCRATCH.px;
        T.py = SCRATCH.py;
      }
    }
    spine(B);
    for (let k = 0; k < spineN; k++) {
      const bx = spineX + spineDx * k;
      const by = spineY + spineDy * k;
      const g = pointGap(A, bx, by, SCRATCH) - spineW;
      if (g < best) {
        best = g;
        T.nx = -SCRATCH.nx;
        T.ny = -SCRATCH.ny;
        T.px = bx + T.nx * spineW;
        T.py = by + T.ny * spineW;
      }
    }
  }
  T.gap = best;
  return best;
}

const CAR = newShape();
const PROP = newShape();
const HIT = newTouch();

/**
 * How far point (x, y) is from car c's hull: nothing at its edge, less inside it. A round, a
 * spark, a mine, a crate: anything small asks this, so a car is hit where it is drawn, its nose
 * and its tail as much as its doors, and at whatever size it is.
 */
export function carGap(c: Car, x: number, y: number): number {
  return pointGap(carShape(c, CAR), x, y, HIT);
}

/** How far point (x, y) is from the edge of a prop standing at (sx, sy) turned `rot`. */
export function propGap(
  def: PropManifest,
  sx: number,
  sy: number,
  rot: number,
  x: number,
  y: number,
): number {
  return pointGap(propShape(def, sx, sy, rot, PROP), x, y, HIT);
}

const BODY = newShape();

/**
 * How far apart car c's hull and a prop of kind `def` at (x, y) turned `rot` are: nothing when
 * they touch, less when one is into the other.
 */
export function carPropGap(c: Car, def: PropManifest, x: number, y: number, rot: number): number {
  return shapeGap(propShape(def, x, y, rot, PROP), carShape(c, BODY), HIT);
}

/**
 * Two points on a car's centre line, towards its nose and its tail, each a hull's half width from
 * that end: for rules that want "somewhere under the front of it, or the back".
 */
export function circles(c: Car): [[number, number], [number, number]] {
  const d = Math.max(0, reach(c) - hull(c));
  const cs = Math.cos(c.h) * d;
  const sn = Math.sin(c.h) * d;
  return [
    [c.x + cs, c.y + sn],
    [c.x - cs, c.y - sn],
  ];
}
