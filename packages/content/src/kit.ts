import type { Part } from '@demodogs/shared';
import { disc } from './shapes';

/** Looks shared by many items: wheels, bumpers, pickup boxes, splinters, car chunks. */

/** A wheel: a tyre with tread blocks and a hub on each face; `frame` (0-2) turns it. */
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
      const turn = Math.atan2(zc, x) / (Math.PI * 2) + 0.5 + frame / 30;
      if (ay > 1.0 && r < 1.6) {
        if (r < 0.5) return 'chrome';
        // five spokes
        return (((turn * 5) % 1) + 1) % 1 < 0.5 ? 'hub' : 'grille';
      }
      if (r < 2.15) return 'tire';
      return (((turn * 10) % 1) + 1) % 1 < 0.5 ? 'tread' : 'tire';
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
    // a slim bar with rounded ends and a rounded face, over-riders near each end
    if (ay > 4.6 || Math.hypot(Math.max(0, ay - 4.0), x) > 0.7) return null;
    if (Math.abs(ay - 2.9) < 0.35 && Math.abs(x) < 0.9 && z < 1.5) return 'bumper';
    return Math.hypot(x, (z - 0.7) * 0.9) < 0.65 ? 'bumper' : null;
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
