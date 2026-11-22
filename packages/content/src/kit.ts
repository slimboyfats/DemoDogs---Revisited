import type { Part } from '@demodogs/shared';
import { disc } from './shapes';

/** Looks shared by many items: wheels, bumpers, pickup boxes, splinters, car chunks. */

/** A wheel; `frame` (0-2) shifts the tread so it rolls. */
export function wheel(frame: number): Part {
  return {
    w: 6,
    h: 3,
    layers: 5,
    fn: (x, _y, z) => {
      const zc = z + 0.5 - 2.5;
      if (x * x + zc * zc > 2.75 * 2.75) return null;
      const ang = Math.atan2(zc, x) / (Math.PI * 2) + 0.5;
      return Math.floor(ang * 10 + frame / 3) % 2 ? 'tread' : 'tire';
    },
  };
}

export const BUMPER: Part = {
  w: 3,
  h: 14,
  layers: 2,
  fn: (x, y) => (Math.abs(y) < 5.6 && Math.abs(x) < 1 ? 'bumper' : null),
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
