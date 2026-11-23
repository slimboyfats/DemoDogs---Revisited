import type { LookModule, Part } from '@demodogs/shared';
import { rigLook } from '../../../src/rigs';

/** How tall the tower stands under its cap, and how wide it is at the foot and the top. */
const TOWER = 38;
const FOOT = 8.5;
const NECK = 5.6;
/** How long a sail is from the hub. */
const SAIL = 18;
/** The sails' part is this far across and this tall: room for them at every angle. */
const SWEEP = 38;

/** A round whitewashed tower on a stone foot, narrowing as it goes up: a door and two windows. */
const tower: Part = {
  w: 18,
  h: 18,
  layers: TOWER,
  smooth: true,
  fn: (x, y, z) => {
    const r = Math.hypot(x, y);
    const wall = FOOT - ((FOOT - NECK) * z) / TOWER;
    if (r > wall) return null;
    // only what faces out is seen: the door and the windows are on the side the sails are
    if (y > 0 && r > wall - 0.8) {
      if (Math.abs(x) < 1.7 && z < 6.4 - x * x * 0.5) return 'wood2';
      if (Math.abs(x) < 1.1 && ((z > 14 && z < 17) || (z > 26 && z < 28.6))) return 'glass';
    }
    if (z < 3) return 'stone';
    // a timber gallery rail round the top
    if (z > TOWER - 1.4) return 'wood2';
    return 'paintw';
  },
};

/** The cap: a dark shingled dome that turns on the tower's top, with the windshaft out of its front. */
const cap: Part = {
  w: 16,
  h: 16,
  layers: 8,
  smooth: true,
  fn: (x, y, z) => {
    if (Math.abs(y) < 0.8 && Math.abs(z - 3.5) < 0.8 && x > 0 && x < 7.6) return 'wood';
    const d = (x * x + y * y) / (6.6 * 6.6) + (z * z) / (7.6 * 7.6);
    if (d > 1) return null;
    return Math.floor(z * 1.6 + Math.atan2(y, x) * 3) % 3 === 0 ? 'bark' : 'bark2';
  },
};

/**
 * The sails: four of them on a hub, flat in the plane across the way the part faces, so the part
 * is thin and as wide and as tall as the sails reach. Each is a timber stock with a lattice of
 * red cloth along one side of it.
 */
const sails: Part = {
  w: 2,
  h: SWEEP,
  layers: SWEEP,
  smooth: true,
  fn: (x, y, z) => {
    if (Math.abs(x) > 0.6) return null;
    const v = z - SWEEP / 2;
    if (y * y + v * v < 3.4) return 'wood2';
    // the same sail four times round
    for (let k = 0; k < 4; k++) {
      const a = k === 0 ? y : k === 1 ? v : k === 2 ? -y : -v;
      const b = k === 0 ? v : k === 1 ? -y : k === 2 ? -v : y;
      if (a < 0 || a > SAIL) continue;
      if (Math.abs(b) < 0.6) return 'wood2';
      if (b > 0 && b < 4.8 && a > 4.5) {
        const bar = (a - 4.5) % 3.4 < 0.6 || b > 4.2 || a > SAIL - 0.6;
        return bar ? 'wood2' : 'paintr';
      }
    }
    return null;
  },
};

/**
 * A windmill: a whitewashed tower, a cap that swings a little way round to the wind, and four
 * sails that turn in it: slowly in a breeze, flying round in a gale.
 */
const look: LookModule = {
  id: 'prop.windmill',
  look: rigLook(tower, [
    { part: cap, at: [0, 0, TOWER], face: Math.PI / 2, move: { kind: 'wind', arc: 0.5 } },
    {
      part: sails,
      on: 0,
      at: [7.8, 0, 3.5 - SWEEP / 2],
      move: { kind: 'roll', rate: 0.12, steps: 12, fold: 4, by: 'wind' },
    },
  ]),
};
export default look;
