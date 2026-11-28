import type { Bone, LookModule, Part } from '@demodogs/shared';
import { rigLook } from '../../../src/rigs';
import { grown } from '../../../src/shapes';

/** How much bigger than drawn: they have to be seen from a car going by. */
const K = 1.4;

/** A length of white crowd barrier, along x: two rails on posts with a red board between. */
const barrier: Part = {
  w: 16,
  h: 2,
  layers: 5,
  smooth: true,
  fn: (x, y, z) => {
    if (Math.abs(x) > 7.6 || Math.abs(y) > 0.5) return null;
    if (Math.abs(Math.abs(x) - 7) < 0.5 || Math.abs(x) < 0.5) return z < 4.4 ? 'paintw' : null;
    if (z > 3.4 && z < 4.4) return 'paintw';
    return z > 1.2 && z < 3 ? 'paintr' : null;
  },
};

/** One spectator, arms in the air: a shirt, a head, a cap or hair. */
const fan = (shirt: string, skin: string, hat: string): Part => ({
  w: 4,
  h: 4,
  layers: 9,
  smooth: true,
  fn: (x, y, z) => {
    // legs, a body, a head
    if (z < 2) return Math.abs(Math.abs(x) - 0.5) < 0.45 && Math.abs(y) < 0.5 ? 'jeans' : null;
    if (z < 5) return Math.abs(x) < 1.1 && Math.abs(y) < 0.75 ? shirt : arm(x, y, z, shirt);
    if (z < 6.8)
      return Math.hypot(x, y, z - 5.9) < 1.05 ? (z > 6.3 ? hat : skin) : arm(x, y, z, skin);
    return arm(x, y, z, skin);
  },
});

/** Two arms straight up from the shoulders. */
function arm(x: number, y: number, z: number, m: string): string | null {
  return z > 4 && z < 8.4 && Math.abs(Math.abs(x) - 1.55) < 0.42 && Math.abs(y) < 0.42 ? m : null;
}

/** How far the rail stands in front of the middle of the thing, so that the middle is in it. */
const BACK = 2.5;
const big = grown(barrier, K);
const rail: Part = { ...big, h: 8, fn: (x, y, z) => big.fn(x, y + BACK, z) };

const CROWD: [string, string, string][] = [
  ['paintr', 'skin', 'black'],
  ['shirtb', 'skin2', 'hazard'],
  ['hazard', 'skin', 'bark'],
  ['paintw', 'skin2', 'paintr'],
  ['shirtg', 'skin', 'black'],
];

const bones: Bone[] = CROWD.map(([shirt, skin, hat], i) => ({
  part: grown(fan(shirt, skin, hat), K),
  at: [(-6 + i * 3) * K, (1.9 + (i % 2) * 0.9) * K - BACK, 0],
  move: { kind: 'cheer', reach: 110, high: 3.6 },
}));

/**
 * Fans at the barrier: five of them behind a length of white rail, who sway where they stand and
 * jump up and down with their arms in the air while a car goes by.
 */
const look: LookModule = {
  id: 'prop.fans',
  look: rigLook(rail, bones, {
    skin: ['#b8794e', '#e0a878', '#f6cfa6'],
    skin2: ['#6e4428', '#93603c', '#b98558'],
    jeans: ['#27406e', '#34558f', '#4c72b8'],
    shirtb: ['#1c6fc4', '#2f8fe8', '#7cc0ff'],
    shirtg: ['#1f8a45', '#31b45d', '#7fe09a'],
  }),
};
export default look;
