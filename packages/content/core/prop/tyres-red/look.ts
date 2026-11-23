import type { LookModule } from '@demodogs/shared';
import { tyreStack } from '../tyres/look';

/** The tyre stack painted red and white, a tyre each. */
const look: LookModule = {
  id: 'prop.tyres-red',
  look: {
    kind: 'prop',
    part: {
      w: 10,
      h: 10,
      layers: 6,
      smooth: true,
      fn: tyreStack((n) => (n % 2 ? 'paintw' : 'paintr'), 'paintr2'),
    },
  },
};
export default look;
