import type { LookModule } from '@demodogs/shared';

/** A small bellied wooden keg with two iron hoops and a fuse. */
const look: LookModule = {
  id: 'prop.powder-keg',
  look: {
    kind: 'prop',
    part: {
      w: 8,
      h: 8,
      layers: 9,
      smooth: true,
      fn: (x, y, z) => {
        const r = Math.hypot(x, y);
        if (z > 8) return r < 0.8 ? 'amber' : null;
        if (r > 3 + 0.6 * Math.sin((Math.PI * z) / 8)) return null;
        if (Math.abs(z - 2) < 0.5 || Math.abs(z - 6) < 0.5) return 'black';
        if (z > 7.4) return 'wood2';
        return ((Math.atan2(y, x) * 4 + 20) | 0) % 2 === 0 ? 'wood' : 'wood2';
      },
    },
  },
};
export default look;
