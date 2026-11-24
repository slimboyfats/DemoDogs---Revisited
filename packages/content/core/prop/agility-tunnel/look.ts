import type { LookModule } from '@demodogs/shared';

/** A dog-agility tunnel: a fat striped tube lying on the grass, red and white. */
const look: LookModule = {
  id: 'prop.agility-tunnel',
  look: {
    kind: 'prop',
    scale: 1.5,
    materials: {
      tunred: ['#a01c1c', '#d83030', '#f25a4a'],
      tunwhite: ['#c9c9c0', '#ecece2', '#ffffff'],
      tundark: ['#2a1414', '#3a1c1c', '#4a2424'],
    },
    part: {
      w: 16,
      h: 10,
      layers: 9,
      smooth: true,
      fn: (x, y, z) => {
        if (Math.abs(x) > 7.6) return null;
        const r = Math.hypot(y, z - 4.2);
        if (r > 4.2) return null;
        // open at both ends: dark inside
        if (r < 3.2) return Math.abs(x) > 6.4 ? null : 'tundark';
        return Math.floor((x + 20) / 2.5) % 2 ? 'tunred' : 'tunwhite';
      },
    },
  },
};
export default look;
