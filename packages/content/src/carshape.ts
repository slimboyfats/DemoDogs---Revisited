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
  /** Door handles: where each one starts along the car (default: one behind the door pillar). */
  handles?: readonly number[];
  /** Exhaust pipes out of the tail, at these y (default: one, off to the right). */
  exhausts?: readonly number[];
  /** Where the engine sits under the skin, from x to x (default: under the bonnet). */
  engine?: readonly [number, number];
  /** No wing mirrors or no aerial (both are fitted unless said). */
  bare?: { mirrors?: boolean; aerial?: boolean };
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

/** What is under the skin where the engine is: a block with a bright rocker cover and dark gaps. */
function engineAt(x: number, ay: number, z: number): string {
  if (ay < 1.1 && z > SILL + 1.3) return ((x * 2.5) | 0) & 1 ? 'chrome' : 'engine';
  if (Math.abs(ay - 1.9) < 0.3) return ((x * 1.5) | 0) & 1 ? 'hub' : 'under';
  return ((x | 0) + ((z * 1.5) | 0)) & 1 ? 'engine' : 'grille';
}

export function carBody(s: CarSpec): ShapeFn {
  const [tf, tr] = s.taper ?? [0, 0];
  const cab = s.cabin;
  const belt = cab ? deckAt(s.deck, (cab.x0 + cab.x1) / 2) : 0;
  const handles = s.handles ?? (cab ? [(cab.pillar ?? (cab.x0 + cab.x1) / 2) + 0.35] : []);
  const exhausts = s.exhausts ?? [s.b * 0.5];
  const engine = s.engine ?? [cab ? cab.x1 + 0.6 : 0, s.a - 2.2];
  // the driver sits just ahead of the door pillar; a bench goes in behind if there is room
  const seatX = cab ? (cab.pillar ?? (cab.x0 + cab.x1) / 2 - 0.6) + 0.2 : 0;
  const benchX = cab && seatX - (cab.x0 + cab.rakeR) > 3.4 ? cab.x0 + cab.rakeR + 1.1 : null;
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

    // exhaust pipes: bright tubes with a dark bore, poking out under the tail
    if (x < -s.a + 0.8 && x > -s.a - 1.0 && z < 1)
      for (const ey of exhausts) {
        const r = Math.hypot(y - ey, z - 0.52);
        if (r < 0.36) return r < 0.19 && x < -s.a - 0.5 ? 'under' : 'chrome';
      }

    if (cab) {
      // wing mirrors on stalks at the foot of the windscreen: painted shells, glass facing back
      const mx = cab.x1 - 0.25;
      const out = ay - w;
      if (!s.bare?.mirrors && x > mx - 0.95 && x < mx && out > -0.75 && out < 0.75) {
        const mz = z - belt;
        const head = out > -0.2;
        if (
          head
            ? mz > -0.2 && mz < 0.8 && Math.hypot(Math.max(0, out - 0.35), mz - 0.3) < 0.52
            : mz > 0.05 && mz < 0.42
        )
          return head && x < mx - 0.7 ? 'glasshi' : mz < 0 ? 'gap' : 'paint';
      }
      // an aerial on the roof, off to one side at the back
      if (!s.bare?.aerial && z > cab.roof - 0.4) {
        const ax = cab.x0 + cab.rakeR + 1.1;
        const r = Math.hypot(x - ax, y - (s.b - cab.inset - cab.lean) * 0.55);
        if (r < 0.1 && z < cab.roof + 1.25) return 'chrome';
        if (r < 0.3 && z < cab.roof + 0.12) return 'under';
      }
    }

    if (cab && z > belt - 0.6) {
      const t = Math.min(1, Math.max(0, (z - belt) / (cab.roof - belt)));
      const x0 = cab.x0 + cab.rakeR * t;
      const x1 = cab.x1 - cab.rakeF * t;
      const half = s.b - cab.inset - cab.lean * t;
      const len = (x1 - x0) / 2;
      const mid = (x0 + x1) / 2;
      const dc = -sdRR(x - mid, y, len, half, Math.min(1.4, len, half));
      const lid = cab.roof - fillet(dc, 0.9);
      if (dc > 0 && z <= lid && z > top) {
        if (z > cab.roof - 0.55) {
          // the roof: a gutter line along each edge
          if (dc > 0.5 && dc < 0.68 && lid - z < 0.2) return 'gap';
          return s.paint?.(x, y, z, cab.roof - z) ?? 'paint';
        }
        if (dc > 0.6) {
          // inside: a floor, a dashboard and wheel, two seats and maybe a bench
          const mz = z - belt;
          if (mz < 0.15) return 'under';
          if (x > cab.x1 - 2.1 && mz < 0.75) return 'grille';
          if (
            Math.abs(x - (cab.x1 - 2.45)) < 0.14 &&
            Math.abs(Math.hypot(y + half * 0.5, mz - 1.0) - 0.5) < 0.14
          )
            return 'under';
          const inSeat = ay > 0.4 && ay < half - 0.9;
          if (inSeat && x > seatX - 0.45 && x < seatX + 1.8)
            if (x < seatX + 0.2 ? mz < 2.0 : mz < 0.55) return mz > 1.55 ? 'under' : 'seat';
          if (benchX !== null && ay < half - 0.9 && x > benchX - 0.45 && x < benchX + 1.7)
            if (x < benchX + 0.2 ? mz < 1.7 : mz < 0.5) return 'seat';
          return null;
        }
        if (cab.solidBehind !== undefined && x < cab.solidBehind) return 'paint';
        // pillars: the corners of the glasshouse and the post between the doors
        const corner = len - Math.abs(x - mid) < 0.75 && half - ay < 0.75;
        const post = cab.pillar !== undefined && Math.abs(x - cab.pillar) < 0.3 && half - ay < 0.7;
        if (corner || post || z < belt + 0.12) return 'paint';
        // rubber seals around the glass, and a brake light high in the rear screen
        if (z < belt + 0.3 || z > cab.roof - 0.72) {
          if (z > cab.roof - 0.9 && x - mid < 0.75 - len && ay < 1.1) return 'tail';
          return 'under';
        }
        if (cab.pillar !== undefined && Math.abs(x - cab.pillar) < 0.47 && half - ay < 0.7)
          return 'under';
        // wiper blades parked at the foot of the windscreen
        if (
          len - (x - mid) < 0.75 &&
          z < belt + 0.62 &&
          z > belt + 0.42 &&
          ay > 0.25 &&
          ay < half - 1.3
        )
          return 'under';
        // a streak of sky across the glass
        const k = (((x + y * 0.5 + z * 1.4) % 4.5) + 4.5) % 4.5;
        return k < 0.5 ? 'glasshi' : 'glass';
      }
    }

    // door handles stand a little proud of the skin
    if (d > -0.17 && d < 0.3 && z <= top) {
      const hz = waist + (full - waist) * 0.42;
      if (z > hz && z < hz + 0.3)
        for (const h of handles) if (x > h && x < h + 1.05) return 'chrome';
    }

    if (d <= 0 || z > top) return null;
    if (z >= SILL && d < 0.45 && Math.abs(z - waist) < 0.1 && Math.abs(x) < s.a - 2) return 'gap';
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
        if (qa < a.r + 0.3 && side < 0.6) return 'gap';
      }
    const front = x > 0;
    if (d < 0.5 && Math.abs(x) > s.a - 1.6) {
      const L = front ? s.head : s.tail;
      if (ay >= L[0] && ay <= L[1] && z >= L[2] && z <= L[3]) {
        // a lamp: a bright rim, an indicator at the outer end, the lens inside
        const rim = Math.min(ay - L[0], L[1] - ay, z - L[2], L[3] - z);
        if (rim < 0.17) return front ? 'chrome' : 'gap';
        if (L[1] - ay < 0.75) return 'amber';
        if (!front && L[0] > 0.1 && ay - L[0] < 0.7) return 'paintw';
        return front ? 'light' : (((ay * 3) | 0) & 1) === 0 ? 'tail' : 'paintr2';
      }
      if (front && s.grille !== undefined && ay < s.grille && z > SILL + 0.9 && z < s.head[3]) {
        if (ay < 0.3 && Math.abs(z - (SILL + 0.9 + s.head[3]) / 2) < 0.3) return 'chrome';
        return ((ay * 6) | 0) % 2 || ((z * 6) | 0) % 3 === 0 ? 'grille' : 'under';
      }
      if (z < SILL + 0.95) return 'bumper';
    }
    const skin = Math.min(d, top - z);
    if (skin < 0.4 && s.gaps) for (const g of s.gaps) if (Math.abs(x - g) < 0.1) return 'gap';
    // a badge on the lip of the bonnet
    if (skin < 0.25 && x > s.a - 1.5 && x < s.a - 0.9 && ay < 0.3) return 'chrome';
    if (skin > 0.6 && x > engine[0] && x < engine[1] && side > 2.0 && z > SILL + 0.2)
      return engineAt(x, ay, z);
    return s.paint?.(x, y, z, skin) ?? 'paint';
  };
}
