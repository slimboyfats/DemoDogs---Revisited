import type { LookModule } from '@demodogs/shared';

/** A concrete road barrier: a wide foot, a waisted wall, hazard chevrons along both faces. */
export const blockPart: Extract<LookModule['look'], { kind: 'prop' }>['part'] = {
  w: 12,
  h: 6,
  layers: 5,
  smooth: true,
  fn: (x, y, z) => {
    const ay = Math.abs(y);
    const ax = Math.abs(x);
    // the profile across the wall: foot, slope, upright
    const half = z < 0.9 ? 2.9 : z < 2.2 ? 2.9 - (z - 0.9) * 0.95 : 1.65 - (z - 2.2) * 0.12;
    if (ay > half || ax > 5.8 - Math.max(0, z - 4.4) * 0.5 || z > 4.85) return null;
    // lifting slots through the foot
    if (z < 0.7 && Math.abs(ax - 3) < 0.7) return null;
    if (z > 2.5 && z < 4.2 && half - ay < 0.34)
      return ((((x + z * 0.9 + 12) / 1.5) | 0) & 1) === 0 ? 'hazard' : 'black';
    // a seam and weathering
    if (Math.abs(x) < 0.14 && half - ay < 0.3) return 'stone';
    return 'concrete';
  },
};

const look: LookModule = { id: 'prop.block', look: { kind: 'prop', part: blockPart } };
export default look;
