import type { LookModule } from '@demodogs/shared';

type P3 = readonly [number, number, number];

/** Distance from p to the segment a-b. */
function seg(p: P3, a: P3, b: P3): number {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const q = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const L = d[0]! * d[0]! + d[1]! * d[1]! + d[2]! * d[2]!;
  const t = Math.max(0, Math.min(1, (q[0]! * d[0]! + q[1]! * d[1]! + q[2]! * d[2]!) / L));
  return Math.hypot(q[0]! - d[0]! * t, q[1]! - d[1]! * t, q[2]! - d[2]! * t);
}

const X = 4.2;
const Y = 5.25;
const TOP = 9.3;
const TUBES: readonly (readonly [P3, P3])[] = [-X, X].flatMap((x) => [
  [
    [x, Y, 0],
    [x, Y, TOP - 1.1],
  ] as const,
  [
    [x, Y, TOP - 1.1],
    [x, Y - 1.1, TOP],
  ] as const,
  [
    [x, -Y, 0],
    [x, -Y, TOP - 1.1],
  ] as const,
  [
    [x, -Y, TOP - 1.1],
    [x, -Y + 1.1, TOP],
  ] as const,
  [
    [x, Y - 1.1, TOP],
    [x, -Y + 1.1, TOP],
  ] as const,
]);
const RAILS: readonly (readonly [P3, P3])[] = [
  [
    [-X, Y - 1.1, TOP],
    [X, Y - 1.1, TOP],
  ],
  [
    [-X, -Y + 1.1, TOP],
    [X, -Y + 1.1, TOP],
  ],
  [
    [-X, Y - 1.1, TOP],
    [X, -Y + 1.1, TOP],
  ],
  [
    [-X, -Y + 1.1, TOP],
    [X, Y - 1.1, TOP],
  ],
];

/**
 * A roll cage of yellow steel tube: a hoop in front of the cab and one behind, rails between them
 * and a cross brace over the roof. Drawn over the cab; what is inside the body is hidden by it.
 */
const look: LookModule = {
  id: 'pickup.roll-cage',
  look: {
    kind: 'prop',
    part: {
      w: 10,
      h: 12,
      layers: 10,
      smooth: true,
      fn: (x, y, z) => {
        const p: P3 = [x, y, z];
        for (const [a, b] of TUBES)
          if (seg(p, a, b) < 0.6)
            // welded joints at the corners
            return z > TOP - 1.4 && Math.abs(Math.abs(y) - (Y - 0.6)) < 0.7 ? 'chrome' : 'hazard';
        for (const [a, b] of RAILS) if (seg(p, a, b) < 0.5) return 'hazard';
        return null;
      },
    },
  },
};
export default look;
