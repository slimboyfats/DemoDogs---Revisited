import type { Part } from '@demodogs/shared';
import { disc } from './shapes';

/** Looks shared by many items: wheels, bumpers, pickup boxes, splinters, car chunks. */

/** A wheel: a tyre with chevron tread, a rim with five spokes and nuts; `frame` (0-2) turns it. */
export function wheel(frame: number): Part {
  return {
    w: 6,
    h: 3,
    layers: 5,
    smooth: true,
    fn: (x, y, z) => {
      const zc = z - 2.5;
      const r = Math.hypot(x, zc);
      const ay = Math.abs(y);
      // a rounded shoulder where the tread meets the sidewall
      if (r > 2.8 - Math.max(0, ay - 0.9) * 0.9) return null;
      const turn = Math.atan2(zc, x) / (Math.PI * 2) + 0.5;
      const frac = (v: number) => ((v % 1) + 1) % 1;
      if (ay > 1.0 && r < 1.75) {
        if (r > 1.55) return 'chrome';
        if (r < 0.32) return 'chrome';
        const spoke = frac((turn + frame / 15) * 5);
        // a nut at the foot of each spoke, the brake behind the gaps between them
        if (r < 0.95)
          return Math.abs(r - 0.68) < 0.14 && Math.abs(spoke - 0.25) < 0.12 ? 'chrome' : 'hub';
        return spoke < 0.5 ? 'hub' : ay > 1.25 ? null : 'grille';
      }
      if (r < 2.2) return ay > 1.0 && Math.abs(r - 1.97) < 0.09 ? 'tread' : 'tire';
      // tread blocks in a chevron, with a groove round the middle
      if (ay < 0.12) return 'tire';
      return frac((turn + frame / 42) * 14 + ay * 0.35) < 0.55 ? 'tread' : 'tire';
    },
  };
}

export const BUMPER: Part = {
  w: 3,
  h: 14,
  layers: 2,
  smooth: true,
  fn: (x, y, z) => {
    const ay = Math.abs(y);
    const ax = Math.abs(x);
    // a number plate in the middle of each face
    if (ay < 1.3 && ax > 0.42 && ax < 0.8 && z > 0.2 && z < 1.25)
      return ay < 1.1 && Math.abs(z - 0.72) < 0.28 && ((ay * 3.4 + 0.5) | 0) % 2
        ? 'under'
        : 'plate';
    // a slim bar with rounded ends and a rounded face, over-riders near each end
    if (ay > 4.6 || Math.hypot(Math.max(0, ay - 4.0), x) > 0.7) return null;
    if (Math.abs(ay - 2.9) < 0.35 && ax < 0.9 && z < 1.5) return 'bumper';
    if (Math.hypot(x, (z - 0.7) * 0.9) >= 0.65) return null;
    // a rubber strip along the face
    return ax > 0.45 && Math.abs(z - 0.7) < 0.12 ? 'under' : 'bumper';
  },
};

/** The glowing box every pickup sits in. */
export const PICKUP_BOX: Part = {
  w: 8,
  h: 8,
  layers: 8,
  fn: (x, y, z) => {
    const ax = Math.abs(x);
    const ay = Math.abs(y);
    if (ax > 3.6 || ay > 3.6) return null;
    const edge = Number(ax > 2.6) + Number(ay > 2.6) + Number(z === 0 || z === 7);
    return edge >= 2 ? 'glow' : 'crate';
  },
};

export const PLANK: Part = {
  w: 8,
  h: 3,
  layers: 1,
  fn: (_x, y) => (Math.abs(y) < 1.2 ? 'wood' : null),
};

/** A lump of a car's paint, thrown off when it is wrecked. */
export const CHUNK: Part = {
  w: 5,
  h: 5,
  layers: 3,
  fn: (x, y, z) => (disc(x, y, 2.2 - z * 0.4) ? (z === 0 ? 'under' : 'paint') : null),
};
