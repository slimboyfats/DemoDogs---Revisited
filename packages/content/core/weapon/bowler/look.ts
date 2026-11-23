import type { LookModule } from '@demodogs/shared';

/**
 * The wrecking ball: a dark steel sphere with two welded seams crossing at the top and a lifting
 * eye, so you can see it turn as it rolls.
 */
const look: LookModule = {
  id: 'weapon.bowler',
  look: {
    kind: 'prop',
    part: {
      w: 11,
      h: 11,
      layers: 11,
      smooth: true,
      fn: (x, y, z) => {
        const zc = z - 5.5;
        const r = Math.hypot(x, y, zc);
        if (r > 5.4) return null;
        // the seams: two rings round the ball, at right angles
        if (Math.abs(x) < 0.35 || Math.abs(y) < 0.35) return r > 4.9 ? 'band' : 'mine';
        // a hazard stripe band round the middle
        if (Math.abs(zc) < 0.7 && r > 4.9)
          return ((Math.atan2(y, x) * 4) | 0) & 1 ? 'hazard' : 'black';
        return 'mine';
      },
    },
  },
};
export default look;
