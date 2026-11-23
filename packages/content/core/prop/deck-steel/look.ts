import type { LookModule } from '@demodogs/shared';

/** A square of steel deck lying flat: chequer plate with a rusty seam along each edge. */
const look: LookModule = {
  id: 'prop.deck-steel',
  look: {
    kind: 'prop',
    part: {
      w: 7,
      h: 7,
      layers: 1,
      fn: (x, y) => {
        const ax = Math.abs(x);
        const ay = Math.abs(y);
        if (ax > 3.5 || ay > 3.5) return null;
        if (ax > 3.1 || ay > 3.1) return (x * 7 + y * 3) % 5 < 1.4 ? 'rust' : 'engine';
        const cx = ((x + 40) % 1.4) - 0.7;
        const cy = ((y + 40) % 1.4) - 0.7;
        return Math.abs(cx + cy) < 0.25 || Math.abs(cx - cy) < 0.25 ? 'cage' : 'band';
      },
    },
  },
};
export default look;
