import type { LookModule, Part } from '@demodogs/shared';
import { rigLook } from '../../../src/rigs';
import { FAIR } from '../../../src/themes';

/** The deck and the pole in the middle. */
const deck: Part = {
  w: 20,
  h: 20,
  layers: 13,
  smooth: true,
  fn: (x, y, z) => {
    const r = Math.hypot(x, y);
    if (z < 1.6) return r < 9.6 ? (r > 8.4 ? 'fairy' : 'paintw') : null;
    return r < 1.2 ? (z % 3 < 1.5 ? 'paintr' : 'paintw') : null;
  },
};

/** What turns: six horses on brass poles, and the canopy over them with bulbs round its edge. */
const ride: Part = {
  w: 22,
  h: 22,
  layers: 15,
  smooth: true,
  fn: (x, y, z) => {
    const r = Math.hypot(x, y);
    const a = Math.atan2(y, x) + Math.PI * 2;
    if (z > 9.4) {
      // the canopy: a low cone in twelve gores, a gold ball on top
      if (z > 13.6) return r < 0.9 ? 'fairy' : null;
      const roof = 10.4 * ((13.8 - z) / 4.4);
      if (r > roof) return null;
      if (z < 10.3)
        return r > roof - 1.2 ? (Math.floor(a * 3.82) % 2 ? 'bulbglow' : 'fairy') : null;
      return Math.floor(a * (6 / Math.PI)) % 2 ? 'paintr' : 'fairy';
    }
    if (z < 1.6) return null;
    const k = Math.round(a / (Math.PI / 3));
    const ha = k * (Math.PI / 3);
    // (along the way it gallops, and across it)
    const u = -x * Math.sin(ha) + y * Math.cos(ha);
    const v = x * Math.cos(ha) + y * Math.sin(ha) - 6.4;
    const up = z - (k % 2 ? 4.4 : 5.6);
    if (Math.hypot(u, v) < 0.3) return 'fairy';
    // a horse: a body, a neck and head up at the front, legs under
    if ((u / 2.3) ** 2 + (v / 1) ** 2 + (up / 1.1) ** 2 < 1) return k % 2 ? 'pony' : 'pony2';
    if (Math.hypot(u - 2.2, v, (up - 1.3) * 0.8) < 0.95) return k % 2 ? 'pony' : 'pony2';
    if (up < -0.8 && up > -2.4 && Math.abs(v) < 0.5 && Math.abs(Math.abs(u) - 1.5) < 0.4)
      return k % 2 ? 'pony' : 'pony2';
    return null;
  },
};

/** A carousel: the deck, and the horses and canopy turning on it. */
const look: LookModule = {
  id: 'prop.carousel',
  look: rigLook(deck, [{ part: ride, at: [0, 0, 0], move: { kind: 'turn', rate: 0.7 } }], FAIR),
};
export default look;
