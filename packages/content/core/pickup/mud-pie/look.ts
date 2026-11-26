import { finished, type LookModule } from '@demodogs/shared';

/** A crimped crust's edge: how far out it reaches at angle a. */
const crimp = (a: number) => 3.9 + Math.cos(a * 12) * 0.22;

/**
 * What is left of a mud pie on the car it hit: a wet, shining heap of mud slumped over the roof,
 * lumpy, with tongues of it run out over the edges and bits of broken crust stuck in it. Its
 * other pose is the pie itself, flying: a golden crust crimped round the edge, heaped with mud.
 */
const look: LookModule = {
  id: 'pickup.mud-pie',
  look: {
    kind: 'prop',
    materials: {
      mudpie: ['#33210f', '#5a3d1e', '#85603a'],
      mudpie2: ['#24160a', '#3f2913', '#62441f'],
      mudwet: ['#7a5632', '#a37a4c', '#e6cfa8'],
      crust: ['#9a6420', '#d0912e', '#f4c66a'],
    },
    part: {
      w: 14,
      h: 12,
      layers: 5,
      smooth: true,
      fn: (x, y, z) => {
        const a = Math.atan2(y, x);
        // a ragged edge: tongues of it run out further here and there
        const edge = 4.6 + Math.sin(a * 3 + 0.6) * 1.1 + Math.sin(a * 7 + 2) * 0.6;
        const r = Math.hypot(x * 0.85, y);
        if (r > edge) return null;
        const lump = Math.sin(x * 2.2) * Math.sin(y * 2.6) * 0.45;
        const top = 3.6 * (1 - (r / edge) ** 2) + 0.4 + lump;
        if (z > top) return null;
        // a shard of crust stuck in it
        if (Math.abs(x - 1.6) < 0.9 && Math.abs(y + 1.4) < 0.5 && z > top - 0.9) return 'crust';
        // the wet shine on whatever faces up and to the light
        if (z > top - 0.45 && lump > 0.15 && x < 1) return finished('mudwet', 'glass');
        const mud = Math.sin(x * 1.7 + 1) * Math.sin(y * 2.1) > 0.35 ? 'mudpie2' : 'mudpie';
        return finished(mud, 'paint');
      },
    },
    alts: [
      {
        w: 9,
        h: 9,
        layers: 4,
        smooth: true,
        fn: (x, y, z) => {
          const r = Math.hypot(x, y);
          const a = Math.atan2(y, x);
          if (r > crimp(a)) return null;
          // the tin's crust: a dish, crimped round its rim
          if (z < 1.1) return 'crust';
          if (r > 3.2) return z < 2 ? 'crust' : null;
          // heaped with mud, a shine on it
          const top =
            1.4 + 2.2 * (1 - (r / 3.2) ** 2) + Math.sin(x * 2.4) * Math.sin(y * 2.1) * 0.3;
          if (z > top) return null;
          if (z > top - 0.4 && x < -0.5 && y < 0.5) return finished('mudwet', 'glass');
          return finished('mudpie', 'paint');
        },
      },
    ],
  },
};
export default look;
