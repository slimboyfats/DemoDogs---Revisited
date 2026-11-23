import type { LookModule } from '@demodogs/shared';

/** A square of plank deck lying flat: boards across the road, a dark gap and a nail row between. */
const look: LookModule = {
  id: 'prop.deck-plank',
  look: {
    kind: 'prop',
    part: {
      w: 7,
      h: 7,
      layers: 1,
      fn: (x, y) => {
        if (Math.abs(x) > 3.5 || Math.abs(y) > 3.5) return null;
        const board = Math.floor((y + 40) / 1.75);
        const v = (y + 40) % 1.75;
        if (v < 0.22) return 'bark2';
        if (Math.abs(x) > 3.1 && v > 0.6 && v < 1.1) return 'rust';
        return (board * 5 + Math.floor((x + 40) * 0.4)) % 3 === 0 ? 'wood2' : 'wood';
      },
    },
  },
};
export default look;
