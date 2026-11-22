import type { LookModule } from '@demodogs/shared';

/** A lattice mast: four legs leaning in, cross braces, and two arms with insulators. */
const look: LookModule = {
  id: 'prop.pylon',
  look: {
    kind: 'prop',
    part: {
      w: 18,
      h: 12,
      layers: 40,
      smooth: true,
      fn: (x, y, z) => {
        if (z > 39) return Math.hypot(x, y) < 0.7 ? 'tail' : null;
        const out = Math.max(0.6, 5 - z * 0.115);
        const ax = Math.abs(x);
        const ay = Math.abs(y);
        // the two arms and what hangs off them
        for (const az of [27, 34]) {
          if (Math.abs(z - az) < 0.5 && ay < 0.6 && ax < 8.2) return 'band';
          if (z < az && z > az - 2.4 && ay < 0.6 && Math.abs(ax - 7.4) < 0.6) return 'glasshi';
        }
        if (ax > out + 0.5 || ay > out + 0.5) return null;
        if (Math.abs(ax - out) < 0.55 && Math.abs(ay - out) < 0.55) return 'bumper';
        // a ring of braces every few layers, and diagonals between them
        const edge = Math.abs(ax - out) < 0.4 || Math.abs(ay - out) < 0.4;
        if (!edge) return null;
        const k = z % 6;
        if (k < 0.5) return 'band';
        const t = (k / 6) * 2 * out - out;
        return Math.abs(x - t) < 0.5 || Math.abs(y + t) < 0.5 ? 'band' : null;
      },
    },
  },
};
export default look;
