import { finished, type LookModule } from '@demodogs/shared';

/**
 * A dog door big enough for a car, standing across the road: a red wooden frame with a brass
 * plate over the lintel and, where the flap should be, a sheet of light. One stands where the car
 * went in and one where it comes out. +x is the way through.
 */
const look: LookModule = {
  id: 'pickup.dog-door',
  look: {
    kind: 'prop',
    materials: {
      doorglow: ['#b01cc8', '#f048ff', '#ffc8ff'],
      doorglow2: ['#7a10a0', '#c030e8', '#f090ff'],
    },
    part: {
      w: 6,
      h: 20,
      layers: 15,
      smooth: true,
      fn: (x, y, z) => {
        const ay = Math.abs(y);
        if (ay > 9.6 || z > 14.6) return null;
        const post = ay > 7.8;
        const lintel = z > 12.6;
        if (post || lintel) {
          if (Math.abs(x) > 2.8) return null;
          // the brass plate over the door
          if (lintel && ay < 3 && z > 13 && z < 14.2 && x > 2) return finished('beak', 'metal');
          // a pale stripe down each post
          if (post && Math.abs(ay - 8.7) < 0.3 && Math.abs(x) > 2.3) return 'paintw';
          return finished('paintr', 'paint');
        }
        // the way through: a thin sheet of light, in rings
        if (Math.abs(x) > 1.2) return null;
        const ring = Math.hypot(ay, z - 6.3);
        return Math.floor(ring / 1.6) % 2 ? 'doorglow2' : 'doorglow';
      },
    },
  },
};
export default look;
