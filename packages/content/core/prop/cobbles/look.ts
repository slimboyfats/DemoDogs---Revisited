import type { LookModule } from '@demodogs/shared';

/** The grey of each stone, and the dark between them. */
const STONES = ['#a8a49a', '#9a968c', '#b6b2a6', '#8e8a80'];

/**
 * A length of cobbled path, +x along it: rough stone setts in rows across it, each row set half a
 * stone over from the last, dark joints between, and a ragged edge either side. Its ends are
 * square so that lengths join.
 */
const look: LookModule = {
  id: 'prop.cobbles',
  look: {
    kind: 'prop',
    materials: {
      sett0: [STONES[0]!, STONES[0]!, STONES[0]!],
      sett1: [STONES[1]!, STONES[1]!, STONES[1]!],
      sett2: [STONES[2]!, STONES[2]!, STONES[2]!],
      sett3: [STONES[3]!, STONES[3]!, STONES[3]!],
      joint: ['#5e5a52', '#6a665e', '#76726a'],
    },
    part: {
      w: 44,
      h: 60,
      layers: 1,
      fn: (x, y) => {
        const ay = Math.abs(y);
        if (ay > 29) return null;
        const row = Math.floor((x + 66) / 6);
        const sv = y + 66 + (row % 2) * 3.5;
        if ((x + 66) % 6 < 1 || sv % 7 < 1 || ay > 27.5) return 'joint';
        const k = (row * 7 + Math.floor(sv / 7) * 13) % 4;
        return (['sett0', 'sett1', 'sett2', 'sett3'] as const)[k]!;
      },
    },
  },
};
export default look;
