import type { LookModule } from '@demodogs/shared';
import { hash3 } from '../../../src/shapes';

/** A pothole: a ragged black hole with broken road round its rim. */
const look: LookModule = {
  id: 'prop.pothole',
  look: {
    kind: 'prop',
    part: {
      w: 14,
      h: 14,
      layers: 1,
      fn: (x, y) => {
        const a = Math.atan2(y, x);
        // a ragged edge: the hole is wider some ways than others
        const r = Math.hypot(x, y) / (4.6 + Math.sin(a * 3 + 1) * 0.7 + Math.sin(a * 5) * 0.5);
        const n = hash3(Math.floor(x * 3), Math.floor(y * 3), 9);
        if (r < 0.62) return n < 0.12 ? 'stone2' : 'black';
        if (r < 1) return n < 0.3 ? 'black' : 'padbase';
        // crumbs of broken road lying round it
        if (r < 1.22) return n < 0.5 ? 'stone' : n < 0.7 ? 'concrete' : null;
        return r < 1.45 && n < 0.12 ? 'stone2' : null;
      },
    },
  },
};
export default look;
