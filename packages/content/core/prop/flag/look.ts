import type { LookModule, Part } from '@demodogs/shared';
import { rigLook } from '../../../src/rigs';

/** How high up the pole the cloth starts. */
const HOIST = 12.4;

/** A white pole with a gold knob. */
const pole: Part = {
  w: 2,
  h: 2,
  layers: 20,
  smooth: true,
  fn: (x, y, z) => {
    const r = Math.hypot(x, y);
    if (z > 18.6) return r < 0.7 && z < 19.6 ? 'hazard' : null;
    return r < 0.42 ? 'paintw' : null;
  },
};

/** The cloth: black and white squares, out from the pole along +x, rippling. */
const cloth: Part = {
  w: 17,
  h: 2,
  layers: 7,
  smooth: true,
  fn: (x, y, z) => {
    if (z > 6.2 || x < 0.3 || x > 8 || Math.abs(y - Math.sin(x * 1.1) * 0.5) > 0.4) return null;
    return (Math.floor(x / 1.5) + Math.floor(z / 1.5)) % 2 ? 'black' : 'paintw';
  },
};

/**
 * A chequered flag: a white pole with a gold knob, and a black and white cloth off the top of it
 * that streams out whichever way the wind blows.
 */
const look: LookModule = {
  id: 'prop.flag',
  look: rigLook(pole, [
    {
      part: cloth,
      at: [0, 0, HOIST],
      face: Math.PI / 2,
      move: { kind: 'wind', flutter: 0.16 },
    },
  ]),
};
export default look;
