import type { LookModule, Part } from '@demodogs/shared';
import { rigLook } from '../../../src/rigs';
import { BAY } from '../../../src/themes';

const TOWER = 40;
const wall = (z: number): number => 7.8 - (3.2 * z) / TOWER;

/** The tower: stone at the foot, then red and white hoops, a door, and a railed gallery on top. */
const tower: Part = {
  w: 18,
  h: 18,
  layers: TOWER,
  smooth: true,
  fn: (x, y, z) => {
    const r = Math.hypot(x, y);
    // the gallery stands out round the top
    if (z > TOWER - 2.2)
      return r < wall(z) + 2 ? (z > TOWER - 1 && r < wall(z) + 1.2 ? 'stone' : 'gunmetal') : null;
    if (r > wall(z)) return null;
    if (y > 0 && r > wall(z) - 0.8) {
      if (Math.abs(x) < 1.6 && z < 6.2 - x * x * 0.5) return 'wood2';
      if (Math.abs(x) < 0.9 && ((z > 15 && z < 18) || (z > 27 && z < 29.6))) return 'glass';
    }
    if (z < 3.4) return 'stone';
    return Math.floor((z - 3.4) / 7.4) % 2 ? 'paintw' : 'paintr';
  },
};

/** The lantern: a glass room with the lamp in it, a short beam out one side, and a red roof. */
const lantern: Part = {
  w: 14,
  h: 14,
  layers: 11,
  smooth: true,
  fn: (x, y, z) => {
    const r = Math.hypot(x, y);
    if (z > 6) return r < 4.6 * ((10.6 - z) / 4.6) ? 'paintr' : null;
    // the beam: a bar of light out along the way it faces
    if (x > 0 && x < 6.6 && Math.abs(y) < 0.9 + x * 0.12 && Math.abs(z - 3.2) < 1.1)
      return 'beamglow';
    if (r > 3.6) return null;
    if (r < 1.5 && z > 1) return 'beamglow';
    if (z < 0.8 || z > 5.4) return 'gunmetal';
    return r > 3 ? (Math.floor(Math.atan2(y, x) * 1.9 + 9) % 3 === 0 ? 'gunmetal' : 'glass') : null;
  },
};

/** A lighthouse: the tower, and on it the lantern, turning. */
const look: LookModule = {
  id: 'prop.lighthouse',
  look: rigLook(
    tower,
    [{ part: lantern, at: [0, 0, TOWER], move: { kind: 'turn', rate: 1.1 } }],
    BAY,
  ),
};
export default look;
