import type { LookModule } from '@demodogs/shared';

/**
 * One barrel of the nose gun: a dark breech with a warning stripe and a bright steel barrel. Every car carries
 * a pair of them on its bonnet, and the client kicks each one back as it fires.
 */
const look: LookModule = {
  id: 'weapon.gun',
  look: {
    kind: 'prop',
    part: {
      w: 9,
      h: 4,
      layers: 3,
      smooth: true,
      fn: (x, y, z) => {
        // the breech: a dark block with a warning stripe across it
        if (x < -1) {
          if (Math.abs(y) > 1.5 || z > 2.4) return null;
          return Math.abs(x + 2.4) < 0.5 ? 'hazard' : 'black';
        }
        // the barrel: bright steel, a dark band half way and a black mouth
        const r = Math.hypot(y, z - 1.3);
        if (r > 0.95) return null;
        if (x > 3.9) return r < 0.5 ? 'black' : 'chrome';
        return Math.abs(x - 1.4) < 0.4 ? 'black' : 'chrome';
      },
    },
  },
};
export default look;
