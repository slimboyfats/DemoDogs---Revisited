import type { LookModule } from '@demodogs/shared';

/** A street lamp: a thin steel pole on a square foot, an arm out over the road (-y), a lamp. */
const look: LookModule = {
  id: 'prop.lamppost',
  look: {
    kind: 'prop',
    part: {
      w: 4,
      h: 12,
      layers: 22,
      fn: (x, y, z) => {
        const r = Math.hypot(x, y);
        if (z < 2) return Math.abs(x) < 1.1 && Math.abs(y) < 1.1 ? 'gunmetal' : null;
        if (z < 20) return r < 0.55 ? 'gunmetal' : null;
        // the arm, then the lamp head hanging under its end
        if (z === 20 && Math.abs(x) < 0.5 && y < 0.4 && y > -5.5) return 'gunmetal';
        if (z === 19 && Math.abs(x) < 0.9 && y < -3.6 && y > -5.8) return 'light';
        if (z === 21 && Math.abs(x) < 0.7 && y < -4 && y > -5.6) return 'gunmetal';
        return null;
      },
    },
    materials: { gunmetal: ['#25282c', '#3b3f45', '#6b7078'] },
  },
};
export default look;
