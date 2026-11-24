import type { LookModule } from '@demodogs/shared';

/** A dog-agility A-frame: two yellow boards leaning together, with slats to climb by. */
const look: LookModule = {
  id: 'prop.agility-frame',
  look: {
    kind: 'prop',
    scale: 1.5,
    materials: {
      aframe: ['#b98a08', '#e8b416', '#ffd94a'],
      aslat: ['#7a5228', '#a8763c', '#cf9a56'],
    },
    part: {
      w: 20,
      h: 9,
      layers: 9,
      smooth: true,
      fn: (x, y, z) => {
        if (Math.abs(y) > 4 || Math.abs(x) > 9.5) return null;
        const h = 8.4 - Math.abs(x) * 0.88;
        if (z > h || z < h - 1.1) return null;
        return Math.abs(((Math.abs(x) + 0.6) % 2.4) - 1.2) > 0.9 ? 'aslat' : 'aframe';
      },
    },
  },
};
export default look;
