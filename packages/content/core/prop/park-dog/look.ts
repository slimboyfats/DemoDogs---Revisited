import type { LookModule } from '@demodogs/shared';

/** A dog out for a run in the park: brown and white, ears down, tail up. Built of big cubes. */
const look: LookModule = {
  id: 'prop.park-dog',
  look: {
    kind: 'prop',
    scale: 1.5,
    materials: {
      dogbrown: ['#7a4a22', '#a8672e', '#c98a48'],
      dogwhite: ['#c9c9c0', '#ecece2', '#ffffff'],
      dognose: ['#1a1410', '#2a2018', '#3a2c22'],
    },
    part: {
      w: 12,
      h: 6,
      layers: 9,
      smooth: true,
      fn: (x, y, z) => {
        const ay = Math.abs(y);
        // four legs, white socks
        if (z < 3 && Math.abs(ay - 1.4) < 0.7 && (Math.abs(x + 2.6) < 0.7 || Math.abs(x - 2) < 0.7))
          return 'dogwhite';
        // the body: brown back, white belly
        if (z >= 3 && z < 6 && x > -3.6 && x < 3 && ay < 2.2)
          return z < 4 ? 'dogwhite' : 'dogbrown';
        // the tail, up
        if (x <= -3.6 && x > -4.6 && ay < 0.6 && z > 4.6 && z < 8)
          return z > 7 ? 'dogwhite' : 'dogbrown';
        // the head, a white muzzle and a dark nose
        if (x >= 2.4 && x < 5 && ay < 1.8 && z > 5 && z < 8.4)
          return ay > 1.1 ? 'dogbrown' : z < 6.4 ? 'dogwhite' : 'dogbrown';
        if (x >= 5 && x < 6 && ay < 1 && z > 5 && z < 6.8)
          return x > 5.5 && z > 6 ? 'dognose' : 'dogwhite';
        return null;
      },
    },
  },
};
export default look;
