import type { LookModule, Part, Tones } from '@demodogs/shared';

/** The greens of a toy tree's crown and the browns of its trunk. */
export const TOY_LEAVES: Record<string, Tones> = {
  toyleaf: ['#23803a', '#2c9a46', '#44b85a'],
  toyleaf2: ['#2c9446', '#38ac52', '#58c868'],
  toyleaf3: ['#1c6c32', '#24843c', '#38a04e'],
  toybark: ['#4e3018', '#6e4622', '#8a5a2c'],
  toybark2: ['#3a220c', '#523216', '#6a4420'],
};

/** A block of a crown: its middle (x, y), from z0 up to z1, half as wide as `half`. */
export type Block = readonly [x: number, y: number, z0: number, z1: number, half: number];

/**
 * A tree built of blocks, as a toy is: a thin square trunk (`trunk` half across, `bole` tall, with
 * a square foot `foot` wider), and a crown of square blocks, each with its edges cut off by a
 * voxel. Nothing in it is round. `step` > 0 makes each block a stepped pyramid instead, drawing in
 * by `step` every `rise` it goes up: a fir.
 */
export function blockTree(
  size: number,
  layers: number,
  trunk: number,
  bole: number,
  foot: number,
  blocks: readonly Block[],
  step = 0,
  rise = 1,
): Part {
  return {
    w: size,
    h: size,
    layers,
    smooth: true,
    fn: (x, y, z) => {
      const ax = Math.abs(x);
      const ay = Math.abs(y);
      if (z < bole) {
        const t = z < 1 ? trunk + foot : trunk;
        if (ax < t && ay < t) return z < 1 ? 'toybark2' : 'toybark';
      }
      for (const [bx, by, z0, z1, half] of blocks) {
        if (z < z0 || z > z1) continue;
        const h = half - Math.floor((z - z0) / rise) * step;
        const dx = h - Math.abs(x - bx);
        const dy = h - Math.abs(y - by);
        if (dx < 0 || dy < 0) continue;
        // (the edges of a block are cut off, so each face is its own clean panel)
        const dz = Math.min(z - z0, z1 - z);
        if (!step && Number(dx < 0.4) + Number(dy < 0.4) + Number(dz < 0.4) >= 2) continue;
        // a lighter cap, a deeper foot
        return z1 - z < 0.7 ? 'toyleaf2' : z - z0 < 0.7 ? 'toyleaf3' : 'toyleaf';
      }
      return null;
    },
  };
}

/** A small park tree: a cube of leaves on a thin square trunk. */
const look: LookModule = {
  id: 'prop.toy-tree',
  look: {
    kind: 'prop',
    materials: TOY_LEAVES,
    scale: 2,
    part: blockTree(18, 20, 0.9, 8, 0.7, [[0, 0, 7, 16, 5]]),
  },
};
export default look;
