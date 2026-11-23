import type { LookModule, ShapeFn } from '@demodogs/shared';

/** Half the side of a column; columns stand 11 apart and meet. */
const H = 5.5;
const FLOOR = 4;

/**
 * A column of a block of `floors` floors, four art px each, with a roof slab on top. The outer
 * skin is panes of `pane` (here and there `shine`) between `frame` mullions, with a `band` at each
 * floor slab; inside it is hollow but for the slabs, so a bite out of it shows the floors.
 */
export function towerColumn(o: {
  floors: number;
  pane: string;
  shine: string;
  frame: string;
  band: string;
}): ShapeFn {
  const top = o.floors * FLOOR;
  return (x, y, z) => {
    const ax = Math.abs(x);
    const ay = Math.abs(y);
    const m = Math.max(ax, ay);
    if (m > H) return null;
    if (z >= top) {
      // the roof: a slab, a low parapet, plant boxes
      if (z === top) return 'concrete';
      if (m > H - 0.8) return 'concrete';
      return ax < 1.6 && ay < 1.2 ? 'black' : null;
    }
    const f = z % FLOOR;
    const skin = m > H - 0.7;
    if (f === 0) return skin ? o.band : m < H - 0.7 ? 'concrete' : null;
    if (!skin) return null;
    // mullions on each face, a column at each corner
    const along = ax > ay ? y : x;
    if (ax > H - 0.7 && ay > H - 0.7) return o.frame;
    if (Math.abs(((along + 40) % 2.75) - 1.375) < 0.3) return o.frame;
    return ((Math.floor(along * 1.3) + z * 7) & 7) === 0 ? o.shine : o.pane;
  };
}

/**
 * The street front of a block: a shop on the ground floor with its window (+x, to the road) under
 * a striped awning, two floors of brick flats with windows above, a concrete cornice.
 */
const fn: ShapeFn = (x, y, z) => {
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  const m = Math.max(ax, ay);
  // the awning sticks out over the pavement
  if (z === 4 && x > H - 0.5 && x < H + 0.5 && ay < H - 0.4)
    return Math.floor((y + 40) * 0.9) % 2 ? 'awning' : 'paintw';
  if (m > H) return null;
  if (z >= 12) return z === 12 || m > H - 0.8 ? 'concrete' : null;
  const f = z % FLOOR;
  const skin = m > H - 0.7;
  if (f === 0) return skin ? 'concrete' : m < H - 0.7 ? 'concrete' : null;
  if (!skin) return null;
  const along = ax > ay ? y : x;
  if (z < FLOOR) {
    // the shop: one big window to the road, a door in it, sign board
    if (x > H - 0.7 && ay < H - 1)
      return z === 3 ? 'sign' : Math.abs(y - 2.6) < 0.8 ? 'wood2' : 'glass';
    return 'stucco';
  }
  const win = f >= 1 && f <= 2 && Math.abs(((along + 40) % 3.6) - 1.8) < 0.9;
  return win ? (f === 2 && along > 0 ? 'glasshi' : 'glass') : 'brickflat';
};

const look: LookModule = {
  id: 'prop.shopfront',
  look: {
    kind: 'prop',
    part: { w: 13, h: 11, layers: 13, fn },
    materials: {
      awning: ['#7a1f24', '#b8343a', '#e86a6e'],
      sign: ['#1b5f66', '#2a8f99', '#7fe3ea'],
      stucco: ['#8a8170', '#b3aa98', '#d8d0bf'],
      brickflat: ['#5e2f24', '#874534', '#b06650'],
    },
  },
};
export default look;
