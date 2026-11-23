import type { LookModule } from '@demodogs/shared';

/**
 * A knobbly tyre's outer ring: big tread blocks and a yellow line round the side wall. It is drawn
 * round each wheel of a car on mud paws, so the wheel still turns inside it.
 */
const look: LookModule = {
  id: 'pickup.mud-paws',
  look: {
    kind: 'prop',
    part: {
      w: 8,
      h: 4,
      layers: 7,
      smooth: true,
      fn: (x, y, z) => {
        const zc = z - 2.5;
        const r = Math.hypot(x, zc);
        const ay = Math.abs(y);
        if (r < 2.6 || ay > 1.95) return null;
        const a = Math.atan2(zc, x) / (Math.PI * 2) + 0.5;
        // knobs: nine blocks round the tyre, staggered either side of the middle
        const knob = (((a * 9 + (y > 0 ? 0.5 : 0)) % 1) + 1) % 1 < 0.55;
        if (r > (knob ? 3.75 : 3.2)) return null;
        if (ay > 1.6 && Math.abs(r - 2.95) < 0.14) return 'hazard';
        return r > 3.2 ? 'tread' : 'tire';
      },
    },
  },
};
export default look;
