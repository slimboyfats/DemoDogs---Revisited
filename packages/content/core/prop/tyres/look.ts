import type { LookModule } from '@demodogs/shared';

/** Three black tyres stacked, hole in the middle. */
export const tyreRing = (x: number, y: number): boolean => {
  const d = x * x + y * y;
  return d < 4.7 * 4.7 && d > 1.8 * 1.8;
};

const look: LookModule = {
  id: 'prop.tyres',
  look: {
    kind: 'prop',
    part: { w: 10, h: 10, layers: 6, fn: (x, y) => (tyreRing(x, y) ? 'rubber' : null) },
  },
};
export default look;
