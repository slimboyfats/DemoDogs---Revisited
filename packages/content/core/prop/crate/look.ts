import type { LookModule } from '@demodogs/shared';

const look: LookModule = {
  id: 'prop.crate',
  look: {
    kind: 'prop',
    part: {
      w: 10,
      h: 10,
      layers: 9,
      fn: (x, y, z) => {
        const ax = Math.abs(x);
        const ay = Math.abs(y);
        if (ax > 4.5 || ay > 4.5) return null;
        if (z === 8) return ax > 3.4 || ay > 3.4 || Math.abs(ax - ay) < 0.8 ? 'wood2' : 'wood';
        return (ax > 3.6 && ay > 3.6) || z === 0 || z === 4 ? 'wood2' : 'wood';
      },
    },
  },
};
export default look;
