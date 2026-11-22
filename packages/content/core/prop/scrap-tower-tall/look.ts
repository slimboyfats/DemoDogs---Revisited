import type { LookModule } from '@demodogs/shared';
import { tower } from '../scrap-tower/look';

const look: LookModule = {
  id: 'prop.scrap-tower-tall',
  look: { kind: 'prop', part: { w: 20, h: 18, layers: 25, smooth: true, fn: tower(5, 1) } },
};
export default look;
