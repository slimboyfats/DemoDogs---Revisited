import type { LookModule } from '@demodogs/shared';

/**
 * A biplane, facing +x, towing a banner: a red body, two yellow wings one over the other, a tail,
 * a spinning propeller drawn as a disc, and a long striped banner out behind on a line.
 */
const look: LookModule = {
  id: 'prop.biplane',
  look: {
    kind: 'prop',
    part: {
      w: 36,
      h: 20,
      layers: 8,
      smooth: true,
      fn: (x0, y, z) => {
        // (the plane is at the front of the cell, the banner fills the rest)
        const x = x0 - 11;
        const ay = Math.abs(y);
        // the banner: a long cloth on edge, red and white, and the line to it
        if (x < -9) {
          if (x > -13) return ay < 0.3 && Math.abs(z - 3.4) < 0.4 ? 'black' : null;
          if (ay > 0.5 || z < 1.2 || z > 5.6) return null;
          return Math.floor((x + 40) / 3) % 2 ? 'paintr' : 'paintw';
        }
        // wings: the lower at the body's belly, the upper over it, struts between at the tips
        if (x > -1 && x < 3) {
          if (ay < 9 && (Math.abs(z - 2.2) < 0.5 || Math.abs(z - 6) < 0.5))
            return ay > 7.6 ? 'paintr' : 'wingy';
          if (Math.abs(ay - 6) < 0.4 && Math.abs(x - 1) < 0.4 && z > 2.2 && z < 6) return 'black';
        }
        // the body: a barrel that tapers to the tail
        const fat = x > 0 ? 1.8 : 1.8 - (-x / 8) * 1.1;
        if (x > -8 && x < 5 && Math.hypot(y, z - 3.4) < fat)
          return x > 4 ? 'chrome' : Math.abs(x - 0.5) < 1 && z > 4 ? 'black' : 'paintr';
        // tail: a fin and two tailplanes
        if (x > -8.4 && x < -6) {
          if (ay < 0.4 && z > 3 && z < 6.6) return 'wingy';
          if (ay < 3.2 && Math.abs(z - 3.6) < 0.4) return 'wingy';
        }
        // the propeller, a blur
        if (x >= 5 && x < 5.8 && Math.hypot(y, z - 3.4) < 2.8) return 'glasshi';
        return null;
      },
    },
    materials: { wingy: ['#e0a400', '#ffcf2a', '#fff0a0'] },
  },
};
export default look;
