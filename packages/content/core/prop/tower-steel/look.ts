import type { LookModule } from '@demodogs/shared';
import { towerColumn } from '../shopfront/look';

/** One column of a dark steel block, seven floors of smoked glass with a lit band on each. */
const look: LookModule = {
  id: 'prop.tower-steel',
  look: {
    kind: 'prop',
    part: {
      w: 11,
      h: 11,
      layers: 29,
      fn: towerColumn({
        floors: 7,
        pane: 'smoke',
        shine: 'smokehi',
        frame: 'gunmetal',
        band: 'light',
      }),
    },
    materials: {
      smoke: ['#14181c', '#22292f', '#4a5560'],
      smokehi: ['#2a333b', '#46525d', '#8c9aa6'],
      gunmetal: ['#25282c', '#3b3f45', '#6b7078'],
    },
  },
};
export default look;
