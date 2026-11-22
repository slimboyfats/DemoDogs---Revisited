import type { LookModule } from '@demodogs/shared';
import { towerColumn } from '../shopfront/look';

/**
 * One column of a glass office block, nine floors of four art px: blue panes between steel
 * mullions, a steel spandrel at each floor slab, hollow inside so a bite shows the floors.
 */
const look: LookModule = {
  id: 'prop.tower-glass',
  look: {
    kind: 'prop',
    part: {
      w: 11,
      h: 11,
      layers: 37,
      fn: towerColumn({
        floors: 9,
        pane: 'glass',
        shine: 'glasshi',
        frame: 'mullion',
        band: 'mullion',
      }),
    },
    materials: {
      mullion: ['#3a4048', '#5f6873', '#9aa4ae'],
    },
  },
};
export default look;
