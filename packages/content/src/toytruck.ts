import type { ShapeFn } from '@demodogs/shared';

/**
 * Cars as toy trucks: a narrow body of clean flat panels that sits between fat wheels standing out
 * at its sides, a square cab with dark glass, a bumper bar at each end, a grille and lamps, and a
 * white stripe. Every car has its own shape from the same few numbers. Pure.
 */
export interface ToyTruck {
  /** Half length and half width of the body where it is widest (between the wheels). */
  a: number;
  b: number;
  /** Half width of the body where the wheels stand beside it. */
  well: number;
  /** Where the front and the rear axle are along the car. */
  axles: readonly [number, number];
  /** Height of the bodywork at the foot of the windscreen, and at the nose. */
  hood: number;
  nose: number;
  /** Height of the bodywork behind the cab (default: as the hood). */
  rear?: number;
  /** The cab: from x0 to x1, this high, its screens leaning in this far by the roof. */
  cab: { x0: number; x1: number; roof: number; rake: number; rakeR?: number };
  /** `bed`: an open box behind the cab. `box`: the cab is solid behind this x (a van). */
  bed?: boolean;
  box?: number;
  /** Roll bars and seats instead of a roof and glass (a buggy). */
  cage?: boolean;
  /** A second colour for the stripe (default white). */
  stripe?: string;
}

/** How far round an axle the body stays narrow, and how high a wheel stands beside it. */
const WHEEL = 4.5;
const WHEEL_TOP = 6.7;

export function toyTruck(s: ToyTruck): ShapeFn {
  const [xf, xr] = s.axles;
  const rear = s.rear ?? s.hood;
  const C = s.cab;
  const stripe = s.stripe ?? 'paintw';
  return (x, y, z) => {
    const ay = Math.abs(y);
    const end = s.a - Math.abs(x);
    if (end < 0 || z < 0.5) return null;
    const byWheel = Math.min(Math.abs(x - xf), Math.abs(x - xr)) < WHEEL;
    // the corners of the nose and the tail are cut off
    const hw = (byWheel ? s.well : s.b) - Math.max(0, 1.1 - end) * 0.8;
    if (z < 1.5) {
      // the chassis, and an axle out to each wheel
      if ((Math.abs(x - xf) < 0.55 || Math.abs(x - xr) < 0.55) && ay < s.well + 1.8 && z > 0.7)
        return 'under';
      return ay < s.well - 0.5 && end > 0.7 ? 'under' : null;
    }
    // a bumper bar across each end
    if (z < 2.9 && end < 1 && ay < s.well + 0.9) return 'bumper';
    const top =
      x > C.x1
        ? s.hood + ((s.nose - s.hood) * (x - C.x1)) / Math.max(1, s.a - C.x1)
        : x < C.x0
          ? rear
          : s.hood;
    if (z <= top) {
      if (ay > hw) return null;
      // (the edge where the top meets the side is cut off, so it catches the light)
      if (hw - ay + (top - z) < 0.45) return null;
      // a step between the wheels
      if (!byWheel && z < 2.2 && ay > s.b - 0.9) return 'bumper';
      if (end < 0.7) {
        const lamp = ay > s.well - 1.5 && ay < s.well - 0.2 && z > top - 1.8 && z < top - 0.5;
        if (lamp) return x > 0 ? 'light' : 'tail';
        if (x > 0 && ay < s.well - 1.8 && z > 3.0 && z < top - 0.6)
          return ((ay * 2.2) | 0) % 2 ? 'under' : 'grille';
      }
      if (s.bed && x < C.x0 - 0.5 && end > 0.9 && ay < hw - 0.8) {
        if (z > 2.7) return null;
        if (z > 2.2) return 'grille';
      }
      if (z > 3.1 && z < 3.85 && end >= 0.7) return stripe;
      // a stripe down the bonnet
      if (x > C.x1 && ay < 0.9 && top - z < 0.5 && end >= 0.7) return stripe;
      return 'paint';
    }
    if (s.cage) {
      // a buggy: two hoops joined by rails along the top, and a pair of seats
      const cw = s.well - 0.2;
      const bar = ay > cw - 0.75 && ay <= cw;
      const hoop = Math.abs(x - C.x0) < 0.4 || Math.abs(x - C.x1) < 0.4;
      if (z <= C.roof && x >= C.x0 - 0.4 && x <= C.x1 + 0.4 && ay <= cw) {
        if (hoop && (bar || z > C.roof - 0.7)) return 'cage';
        if (bar && z > C.roof - 0.7) return 'cage';
      }
      if (ay > 0.5 && ay < cw - 1 && x > C.x0 + 0.6 && x < C.x0 + 3.4)
        if (x < C.x0 + 1.4 ? z < s.hood + 2.3 : z < s.hood + 0.7) return 'seat';
      return null;
    }
    if (z > C.roof) return null;
    const t = (z - s.hood) / (C.roof - s.hood);
    const x0 = s.box !== undefined ? C.x0 : C.x0 + (C.rakeR ?? 0.5) * t;
    const x1 = C.x1 - C.rake * t;
    if (x < x0 || x > x1) return null;
    // the cab is as wide as the body under it, and wider again once it is clear of the wheels
    const cw = (byWheel && z < WHEEL_TOP ? s.well : s.b) - 0.4;
    if (ay > cw) return null;
    const side = cw - ay;
    if (z > C.roof - 0.8) {
      if (side + (C.roof - z) < 0.4) return null;
      return ay < 0.9 ? stripe : 'paint';
    }
    if (s.box !== undefined && x < s.box) return z > 5.2 && z < 5.95 ? stripe : 'paint';
    // pillars at the corners, a sill under the glass
    const fore = Math.min(x - x0, x1 - x);
    if ((fore < 0.75 && side < 0.75) || z < s.hood + 0.35) return 'paint';
    // dark glass with a streak of sky across it
    const k = (((x + y * 0.5 + z * 1.4) % 5) + 5) % 5;
    return k < 0.6 ? 'glasshi' : 'glass';
  };
}
