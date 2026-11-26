import type { LookModule, Part } from '@demodogs/shared';
import { rigLook } from '../../../src/rigs';
import { FAIR } from '../../../src/themes';

/** How far the rim is from the hub, how high the hub stands, and the room the wheel turns in. */
const RIM = 18;
const HUB = 22;
const SWEEP = 44;

/** The frame: a striped deck, and an A of blue steel either side holding the axle up. */
const frame: Part = {
  w: 30,
  h: 12,
  layers: HUB + 2,
  smooth: true,
  fn: (x, y, z) => {
    const ax = Math.abs(x);
    const ay = Math.abs(y);
    if (z < 1.6)
      return ax < 14.5 && ay < 5.6 ? (Math.floor((x + 40) / 3) % 2 ? 'fairy' : 'paintw') : null;
    // the axle, through both frames
    if (Math.hypot(x, z - HUB) < 1.1 && ay < 5) return 'bumper';
    if (Math.abs(ay - 4) > 0.75) return null;
    // the legs of the A, and a tie across them half way up
    const leg = 13 * (1 - (z - 1.6) / (HUB - 1.6));
    if (z <= HUB && Math.abs(ax - leg) < 0.85) return 'fairb';
    if (Math.abs(z - 10) < 0.6 && ax < leg) return 'fairb';
    return null;
  },
};

const CARS = ['paintr', 'fairy', 'fairg', 'fairp'] as const;

/**
 * The wheel: a rim, a ring half way in, eight spokes with lit bulbs at their ends and a round
 * car at each. It is flat in the plane across the way the part faces.
 */
const wheel: Part = {
  w: 8,
  h: SWEEP,
  layers: SWEEP,
  smooth: true,
  fn: (x, y, z) => {
    const v = z - SWEEP / 2;
    const r = Math.hypot(y, v);
    const ax = Math.abs(x);
    if (r > RIM + 2.6) return null;
    const a = Math.atan2(v, y) + Math.PI * 2;
    const k = Math.round(a / (Math.PI / 4));
    const da = a - k * (Math.PI / 4);
    // the cars: balls on the rim, a colour each, the same every quarter turn
    if (Math.hypot(r - RIM, r * Math.sin(da)) < 2.5 && ax < 3.2)
      return CARS[k % 2 ? (k % 4 === 1 ? 1 : 3) : k % 4 === 0 ? 0 : 2]!;
    if (ax > 1.5) return null;
    if (r < 2) return 'bumper';
    if (Math.abs(r - RIM) < 0.9 || Math.abs(r - RIM * 0.55) < 0.6) return 'paintw';
    if (Math.abs(r * Math.sin(da)) < 0.6)
      return r > RIM * 0.55 && r % 3.2 < 0.9 ? 'bulbglow' : 'paintw';
    return null;
  },
};

/** A big wheel: the frame, and the wheel on its axle, turning with the clock. */
const look: LookModule = {
  id: 'prop.ferris-wheel',
  look: rigLook(
    frame,
    [
      {
        part: wheel,
        at: [0, 0, HUB - SWEEP / 2],
        face: Math.PI / 2,
        move: { kind: 'roll', rate: 0.035, steps: 8, fold: 4, by: 'time' },
      },
    ],
    FAIR,
  ),
};
export default look;
