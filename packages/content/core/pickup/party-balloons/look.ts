import { finished, type LookModule } from '@demodogs/shared';

/**
 * One party balloon: a fat shiny teardrop on its knot, a white gleam high on one side. A car
 * under the trick hangs from three of them, each in a colour of its own (`balloon` is swapped
 * for `balloonb` and `balloony`).
 */
const look: LookModule = {
  id: 'pickup.party-balloons',
  look: {
    kind: 'prop',
    materials: {
      balloon: ['#a01226', '#e8263c', '#ff6a78'],
      balloonb: ['#0f4fb0', '#2a86f0', '#74bcff'],
      balloony: ['#b88a08', '#f6c818', '#ffe870'],
    },
    part: {
      w: 9,
      h: 9,
      layers: 11,
      smooth: true,
      fn: (x, y, z) => {
        // the knot, and the neck widening up into the body
        if (z < 0.9) return Math.hypot(x, y) < 0.7 ? finished('balloon', 'paint') : null;
        const up = (z - 6) / (z < 6 ? 5.1 : 4.6);
        const r = Math.hypot(x, y) / 4;
        if (r * r + up * up > 1) return null;
        // the gleam: a small bright patch up on the side the light comes from
        if (Math.hypot(x + 1.6, y + 1.6, z - 7.8) < 1.1) return finished('paintw', 'paint');
        return finished('balloon', 'paint');
      },
    },
  },
};
export default look;
