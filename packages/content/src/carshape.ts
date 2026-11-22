import type { ShapeFn } from '@demodogs/shared';

/**
 * Car bodies as smooth shapes. A body is described the way a car is drawn in side and plan view:
 * an outline seen from above, a deck line (the height of the bodywork from tail to nose), wheel
 * arches cut into its sides, and a cabin of glass and pillars on top. `carBody` turns that into a
 * shape function fine enough to sample several times to the art pixel, so bodies come out with
 * rounded shoulders, raked screens, panel gaps and lights instead of stacked boxes. Pure.
 */
export interface Cabin {
  /** Rear and front of the cabin at the belt line. */
  x0: number;
  x1: number;
  /** Height of the roof. */
  roof: number;
  /** How far the glass sits in from the body side at the belt, and how much more by the roof. */
  inset: number;
  lean: number;
  /** How far the screens lean in by the roof: the windscreen and the rear screen. */
  rakeF: number;
  rakeR: number;
  /** Solid bodywork instead of glass behind this x (a van's box). */
  solidBehind?: number;
  /** Where the pillar between the doors stands, if there is one. */
  pillar?: number;
}

export interface CarSpec {
  /** Half length and half width of the body, and the radius of its corners seen from above. */
  a: number;
  b: number;
  r: number;
  /** How much narrower each side is at the nose and at the tail than amidships. */
  taper?: readonly [number, number];
  /** Height of the bodywork along the car: [x, z] points from tail to nose. */
  deck: readonly (readonly [number, number])[];
  /** Radius of the shoulder where the top rolls over into the side. */
  round: number;
  /** How much lower the deck is at the sides than down the middle (default 0.5). */
  crown?: number;
  /** How far the sides lean in between the waist and the deck (default 0.5). */
  tuck?: number;
  /** Wheel arches: where along the car, and how big. */
  arches: readonly { x: number; r: number }[];
  cabin?: Cabin;
  /** Head and tail lights: from |y| = y0 to y1, between heights z0 and z1. */
  head: readonly [number, number, number, number];
  tail: readonly [number, number, number, number];
  /** A grille between the head lights, up to this |y|. */
  grille?: number;
  /** Panel gaps across the car at these x (bonnet edge, doors, boot). */
  gaps?: readonly number[];
  /**
   * Called first: a material puts it there, null cuts a hole, undefined leaves the body as it is.
   * `top` is the height of the bodywork at (x, y), for things that sit on it.
   */
  extra?: (x: number, y: number, z: number, top: number) => string | null | undefined;
  /** Repaint a point of plain bodywork (stripes, two-tone). `skin` is how deep under the surface. */
  paint?: (x: number, y: number, z: number, skin: number) => string | undefined;
}

/** Signed distance to a rounded rectangle of half extents a, b and corner radius r (inside < 0). */
export function sdRR(x: number, y: number, a: number, b: number, r: number): number {
  const qx = Math.abs(x) - (a - r);
  const qy = Math.abs(y) - (b - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

/** How far a surface drops `d` in from an edge rounded with radius r: a quarter circle. */
export function fillet(d: number, r: number): number {
  if (d >= r) return 0;
  if (d <= 0) return r;
  return r - Math.sqrt(r * r - (r - d) * (r - d));
}

/** The height of a deck line at x (straight lines between the points). */
export function deckAt(deck: CarSpec['deck'], x: number): number {
  const first = deck[0]!;
  if (x <= first[0]) return first[1];
  for (let i = 1; i < deck.length; i++) {
    const p = deck[i - 1]!;
    const q = deck[i]!;
    if (x <= q[0]) return p[1] + ((q[1] - p[1]) * (x - p[0])) / (q[0] - p[0] || 1);
  }
  return deck[deck.length - 1]![1];
}

/** Wheel centres sit this high in body coordinates, and the body's floor this high. */
const AXLE = 1.9;
const SILL = 1.1;

export function carBody(s: CarSpec): ShapeFn {
  const [tf, tr] = s.taper ?? [0, 0];
  const cab = s.cabin;
  const belt = cab ? deckAt(s.deck, (cab.x0 + cab.x1) / 2) : 0;
  return (x, y, z) => {
    const ay = Math.abs(y);
    // the outline from above, narrower towards the nose and the tail
    const fx = Math.max(0, (x - s.a * 0.25) / (s.a * 0.75));
    const rx = Math.max(0, (-x - s.a * 0.25) / (s.a * 0.75));
    const w = s.b - tf * fx * fx - tr * rx * rx;
    const d0 = -sdRR(x, y, s.a, w, Math.min(s.r, w));
    const q = ay / w;
    const full = deckAt(s.deck, x) - (s.crown ?? 0.5) * q * q;
    // the sides lean in above the waist and tuck under below it
    const waist = SILL + (full - SILL) * 0.45;
    const lean = z > waist ? (z - waist) / (full - waist) : ((waist - z) / (waist - SILL)) * 0.6;
    const d = d0 - (s.tuck ?? 0.5) * lean * lean;
    const top = d0 > 0 ? full - fillet(d0, s.round) : -1;
    const own = s.extra?.(x, y, z, top);
    if (own !== undefined) return own;

    if (cab && z > belt - 0.6) {
      const t = Math.min(1, Math.max(0, (z - belt) / (cab.roof - belt)));
      const x0 = cab.x0 + cab.rakeR * t;
      const x1 = cab.x1 - cab.rakeF * t;
      const half = s.b - cab.inset - cab.lean * t;
      const len = (x1 - x0) / 2;
      const dc = -sdRR(x - (x0 + x1) / 2, y, len, half, Math.min(1.4, len, half));
      if (dc > 0 && z <= cab.roof - fillet(dc, 0.9) && z > top) {
        if (z > cab.roof - 0.55) return s.paint?.(x, y, z, cab.roof - z) ?? 'paint';
        if (dc > 0.6) return z < belt + 1.2 ? 'seat' : null;
        if (cab.solidBehind !== undefined && x < cab.solidBehind) return 'paint';
        // pillars: the corners of the glasshouse and the post between the doors
        const corner = len - Math.abs(x - (x0 + x1) / 2) < 0.75 && half - ay < 0.75;
        const post = cab.pillar !== undefined && Math.abs(x - cab.pillar) < 0.3 && half - ay < 0.7;
        if (corner || post || z < belt + 0.25) return 'paint';
        // a streak of sky across the glass
        const k = (((x + y * 0.5 + z * 1.4) % 4.5) + 4.5) % 4.5;
        return k < 0.5 ? 'glasshi' : 'glass';
      }
    }

    if (d <= 0 || z > top) return null;
    if (z >= SILL && d < 0.45 && Math.abs(z - waist) < 0.17 && Math.abs(x) < s.a - 2) return 'gap';
    if (z < SILL) {
      // the undertray, tucked in from the sides
      return z > 0.3 && d > 1.3 + (SILL - z) * 0.6 ? 'under' : null;
    }
    // wheel arches, cut in from each side, with a dark lip
    const side = w - ay;
    if (side < 3.5)
      for (const a of s.arches) {
        const qa = Math.hypot(x - a.x, z - AXLE);
        if (qa < a.r) return side < 3.1 ? null : 'under';
        if (qa < a.r + 0.4 && side < 0.6) return 'gap';
      }
    const front = x > 0;
    if (d < 0.5 && Math.abs(x) > s.a - 1.6) {
      const L = front ? s.head : s.tail;
      if (ay >= L[0] && ay <= L[1] && z >= L[2] && z <= L[3]) return front ? 'light' : 'tail';
      if (front && s.grille !== undefined && ay < s.grille && z > SILL + 0.9 && z < s.head[3])
        return ((ay * 3) | 0) % 2 ? 'grille' : 'under';
      if (z < SILL + 0.95) return 'bumper';
    }
    const skin = Math.min(d, top - z);
    if (skin < 0.4 && s.gaps) for (const g of s.gaps) if (Math.abs(x - g) < 0.17) return 'gap';
    return s.paint?.(x, y, z, skin) ?? 'paint';
  };
}
