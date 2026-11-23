import type { LookModule } from '@demodogs/shared';

/** A wooden crate: planked faces in a frame, a brace across each, nail heads at the corners. */
const look: LookModule = {
  id: 'prop.crate',
  look: {
    kind: 'prop',
    part: {
      w: 10,
      h: 10,
      layers: 9,
      smooth: true,
      fn: (x, y, z) => {
        const ax = Math.abs(x);
        const ay = Math.abs(y);
        if (ax > 4.6 || ay > 4.6 || z > 8.8) return null;
        // which face is nearest, and where on it (u across, v up)
        const top = 8.8 - z < Math.min(4.6 - ax, 4.6 - ay);
        const u = top ? x : ax > ay ? y : x;
        const v = top ? y : z - 4.4;
        const depth = top ? 8.8 - z : Math.min(4.6 - ax, 4.6 - ay);
        const au = Math.abs(u);
        const av = Math.abs(v);
        const frame = au > 3.7 || av > (top ? 3.7 : 3.6);
        if (frame) {
          if (depth < 0.4 && Math.abs(au - 4.1) < 0.2 && Math.abs(av - 4) < 0.2) return 'band';
          return 'wood2';
        }
        // the brace stands proud; the planks sit a little back, with dark gaps between them
        if (Math.abs(u - v) < 0.7) return 'wood2';
        if (depth < 0.4) return null;
        return depth < 0.75 && Math.abs(((((u + 8) % 1.9) + 1.9) % 1.9) - 0.95) > 0.8
          ? 'black'
          : 'wood';
      },
    },
  },
};
export default look;
