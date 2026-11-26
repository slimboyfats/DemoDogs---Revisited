import type { LookModule, Part } from '@demodogs/shared';

/** The post with its lamp lit in `lit`: a striped pole on a steel foot, a big round lamp in a hood. */
const post = (lit: string): Part => ({
  w: 11,
  h: 11,
  layers: 26,
  smooth: true,
  fn: (x, y, z) => {
    const r = Math.hypot(x, y);
    if (z < 1.5) return r < 3.6 ? 'chrome' : null;
    if (z < 16) return r < 1.7 ? (Math.floor(z / 3) % 2 ? 'black' : 'hazard') : null;
    // the lamp: a ball in a dark collar
    const b = Math.hypot(x, y, z - 21);
    if (b < 4.9) return lit;
    return z < 18 && r < 3.2 ? 'black' : null;
  },
});

/** A signal lamp: red (the first pose), amber, green. The client picks which. */
const look: LookModule = {
  id: 'prop.signal-lamp',
  look: {
    kind: 'prop',
    part: post('lampred'),
    alts: [post('lampamber'), post('lampgreen')],
    materials: {
      lampred: ['#c81e1e', '#ff3b30', '#ff8a80'],
      lampamber: ['#d98a00', '#ffb300', '#ffe082'],
      lampgreen: ['#12a150', '#2ee06f', '#a5f5c2'],
    },
  },
};
export default look;
