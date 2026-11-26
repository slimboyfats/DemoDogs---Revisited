import { finished, type LookModule } from '@demodogs/shared';

/**
 * A thieving paw: a white glove of a paw, palm down, with four toes spread in front of it and
 * pink pads. It flies out to the car it robs and back with what it took. +x is the way it reaches.
 */
const look: LookModule = {
  id: 'pickup.sticky-paws',
  look: {
    kind: 'prop',
    materials: {
      pawpad: ['#b0304c', '#f0507a', '#ff9ab4'],
    },
    part: {
      w: 10,
      h: 9,
      layers: 3,
      smooth: true,
      fn: (x, y, z) => {
        if (z > 2.6) return null;
        const dome = (d: number, r: number) =>
          z < 0.6 + 2 * Math.sqrt(Math.max(0, 1 - (d / r) ** 2));
        // the palm, and its big pad on top
        const palm = Math.hypot((x + 1.4) * 0.9, y);
        if (palm < 3 && dome(palm, 3))
          return palm < 1.7 && z > 1.6 ? 'pawpad' : finished('paintw', 'paint');
        // four toes fanned out in front
        for (const [tx, ty] of [
          [2.2, -3],
          [3.4, -1.1],
          [3.4, 1.1],
          [2.2, 3],
        ] as const) {
          const d = Math.hypot(x - tx, y - ty);
          if (d < 1.25 && dome(d, 1.25))
            return d < 0.7 && z > 1.5 ? 'pawpad' : finished('paintw', 'paint');
        }
        return null;
      },
    },
  },
};
export default look;
