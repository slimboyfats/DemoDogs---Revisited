import type { Part } from '@demodogs/shared';

/**
 * Shapes for animals, so each animal's look is a few numbers. A beast is a barrel on four legs
 * with a head out in front; a fowl is a round body on two legs; a bird has wings. Each comes in
 * poses: the other step of a walk, wings up and wings down.
 */
export interface Beast {
  /** Body length, width and depth, and leg length, art px. */
  len: number;
  wid: number;
  deep: number;
  leg: number;
  /** Head radius, and how far it is carried above the back. */
  head: number;
  neck: number;
  coat: string;
  /** A second coat colour in patches, if any. */
  patch?: string;
  face: string;
  legs: string;
  /** Ears or horns of this material, a tail of this one. */
  ears?: string;
  tail?: string;
  /** Horns or antlers that stand this far out to each side, art px (with `ears` as their material). */
  horn?: number;
  /** Woolly: the coat is lumpy. */
  woolly?: boolean;
}

const sq = (v: number) => v * v;

/** A four-legged animal, facing +x. `pose` 1 is the other step of its walk. */
export function beast(B: Beast, pose: 0 | 1): Part {
  const top = B.leg + B.deep;
  const hx = B.len / 2 + B.head * 0.55;
  const hz = B.leg + B.deep * 0.62 + B.neck - (pose ? 0.35 : 0);
  const layers = Math.ceil(Math.max(top, hz + B.head) + (B.ears ? 1.4 + (B.horn ?? 0) * 0.5 : 0.4));
  const w = Math.ceil(B.len + B.head * 2.4 + 3);
  const horn = B.horn ?? 0;
  const h = Math.ceil(Math.max(B.wid, (B.head * 0.8 + horn) * 2) + 3);
  return {
    w,
    h,
    layers,
    smooth: true,
    fn: (x, y, z) => {
      // legs: diagonal pairs swing together
      if (z < B.leg + 0.4)
        for (const [lx, ly] of [
          [1, 1],
          [1, -1],
          [-1, 1],
          [-1, -1],
        ] as const) {
          const swing = (lx * ly > 0 ? 1 : -1) * (pose ? 0.9 : -0.3);
          const px = lx * B.len * 0.3 + swing * (1 - z / (B.leg + 0.4));
          if (sq(x - px) + sq(y - ly * B.wid * 0.27) < 0.42) return z < 0.7 ? 'black' : B.legs;
        }
      // the head, with an eye each side and ears or horns on top
      const hd = sq((x - hx) / 1.15) + sq(y) + sq(z - hz);
      if (hd < sq(B.head)) {
        if (x > hx + B.head * 0.35 && Math.abs(Math.abs(y) - B.head * 0.55) < 0.4 && z > hz)
          return 'black';
        return B.face;
      }
      if (
        B.ears &&
        z > hz + B.head * 0.5 &&
        z < hz + B.head + 1.3 &&
        Math.abs(x - hx + 0.5) < 0.55 &&
        Math.abs(Math.abs(y) - B.head * 0.8) < 0.5
      )
        return B.ears;
      // horns: out to the side from the top of the head and curving up at the tips
      if (B.ears && horn > 0) {
        const out = Math.abs(y) - B.head * 0.7;
        if (
          out > 0 &&
          out < horn &&
          Math.abs(x - hx + 0.3) < 0.7 &&
          Math.abs(z - (hz + B.head * 0.6 + sq(out / horn) * horn * 0.5)) < 0.65
        )
          return B.ears;
      }
      // neck
      const t = (x - B.len * 0.3) / (hx - B.len * 0.3);
      if (t > 0 && t < 1 && Math.abs(y) < B.head * 0.6) {
        const nz = B.leg + B.deep * 0.6 + (hz - B.leg - B.deep * 0.6) * t;
        if (Math.abs(z - nz) < B.head * 0.7) return B.coat;
      }
      // the barrel
      const lump = B.woolly ? Math.sin(x * 2.3) * Math.sin(y * 2.7 + z) * 0.35 : 0;
      const d =
        sq(x / (B.len / 2)) + sq(y / (B.wid / 2)) + sq((z - B.leg - B.deep / 2) / (B.deep / 2));
      if (d < 1 + lump) {
        if (B.patch && Math.sin(x * 0.9 + 1) * Math.cos(y * 1.3 - 0.5) + (z - top) * 0.1 > 0.25)
          return B.patch;
        return B.coat;
      }
      if (
        B.tail &&
        x < -B.len / 2 + 0.3 &&
        x > -B.len / 2 - 1.2 &&
        Math.abs(y) < 0.5 &&
        Math.abs(z - (top - 1 - (pose ? 0.4 : 0))) < 0.6
      )
        return B.tail;
      return null;
    },
  };
}

export interface Fowl {
  /** Body radius; it stands this far off the ground on its legs. */
  r: number;
  leg: number;
  /** How tall it stands compared with how wide: 1 a ball, 2 a penguin. */
  tall: number;
  coat: string;
  /** Its front, if another colour (a penguin's belly). */
  belly?: string;
  beak: string;
  comb?: string;
  legs: string;
}

/** A two-legged bird that walks, facing +x. `pose` 1 is its other step. */
export function fowl(F: Fowl, pose: 0 | 1): Part {
  const cz = F.leg + F.r * F.tall * 0.55;
  const hz = F.leg + F.r * F.tall * 1.15 + (pose ? -0.3 : 0);
  const hr = F.r * 0.62;
  return {
    w: Math.ceil(F.r * 2 + 4),
    h: Math.ceil(F.r * 2 + 2),
    layers: Math.ceil(hz + hr + (F.comb ? 1.2 : 0.3)),
    smooth: true,
    fn: (x, y, z) => {
      if (z < F.leg + 0.3)
        for (const s of [-1, 1]) {
          const px = s * (pose ? 0.7 : -0.5) * (1 - z / (F.leg + 0.3));
          if (sq(x - px) + sq(y - s * F.r * 0.45) < 0.3) return F.legs;
        }
      const hxp = F.r * 0.55;
      const hd = sq(x - hxp) + sq(y) + sq(z - hz);
      if (hd < sq(hr)) {
        if (x > hxp + hr * 0.3 && Math.abs(Math.abs(y) - hr * 0.6) < 0.35 && z > hz) return 'black';
        return F.coat;
      }
      if (
        x > hxp + hr - 0.2 &&
        x < hxp + hr + 1.1 &&
        Math.abs(y) < 0.45 &&
        Math.abs(z - hz + 0.3) < 0.45
      )
        return F.beak;
      if (
        F.comb &&
        Math.abs(y) < 0.4 &&
        Math.abs(x - hxp) < hr * 0.8 &&
        z > hz + hr - 0.3 &&
        z < hz + hr + 0.9
      )
        return F.comb;
      const d = sq(x / (F.r * 1.1)) + sq(y / F.r) + sq((z - cz) / (F.r * F.tall * 0.62));
      if (d < 1) return F.belly && x > F.r * 0.25 && Math.abs(y) < F.r * 0.7 ? F.belly : F.coat;
      // a stub of tail
      if (
        x < -F.r * 0.8 &&
        x > -F.r * 1.5 &&
        Math.abs(y) < 0.6 &&
        Math.abs(z - cz - 0.6 - (pose ? 0.3 : 0)) < 0.7
      )
        return F.coat;
      return null;
    },
  };
}

export interface Wing {
  /** Body length and half the wingspan, art px. */
  len: number;
  span: number;
  coat: string;
  /** Wing tips, if another colour. */
  tip?: string;
  beak: string;
}

/**
 * A bird that flies, facing +x. Pose 'stand': wings folded, on its feet. 'up' and 'down': in
 * the air, wings raised and wings pressed down.
 */
export function bird(W: Wing, pose: 'stand' | 'up' | 'down'): Part {
  const flying = pose !== 'stand';
  const bz = flying ? 2.4 : 1.6;
  const r = W.len * 0.26;
  return {
    w: Math.ceil(W.len + 3),
    h: Math.ceil((flying ? W.span * 2 : r * 2) + 3),
    layers: 6,
    smooth: true,
    fn: (x, y, z) => {
      if (!flying && z < 1)
        return Math.abs(Math.abs(y) - 0.5) < 0.3 && Math.abs(x) < 0.3 ? W.beak : null;
      const d = sq(x / (W.len / 2)) + sq(y / r) + sq((z - bz) / r);
      if (d < 1) {
        if (x > W.len * 0.28 && Math.abs(Math.abs(y) - r * 0.5) < 0.3 && z > bz) return 'paintw';
        return W.coat;
      }
      if (x > W.len / 2 - 0.2 && x < W.len / 2 + 1 && Math.abs(y) < 0.4 && Math.abs(z - bz) < 0.4)
        return W.beak;
      if (flying) {
        // a wing each side: a thin blade, swept back, raised or pressed down toward its tip
        const ay = Math.abs(y);
        if (ay > r * 0.6 && ay < W.span) {
          const t = (ay - r * 0.6) / (W.span - r * 0.6);
          const wz = bz + (pose === 'up' ? 2.2 : -1.6) * t;
          const chord = W.len * 0.34 * (1 - t * 0.7);
          if (Math.abs(z - wz) < 0.5 && Math.abs(x + t * 1.2) < chord)
            return W.tip && t > 0.72 ? W.tip : W.coat;
        }
        // tail fan
        if (
          x < -W.len / 2 + 0.4 &&
          x > -W.len / 2 - 1.3 &&
          Math.abs(y) < 0.9 &&
          Math.abs(z - bz) < 0.4
        )
          return W.coat;
      } else if (
        Math.abs(y) < r + 0.35 &&
        Math.abs(x + 0.4) < W.len * 0.3 &&
        Math.abs(z - bz) < r * 0.8
      )
        return W.tip ?? W.coat;
      return null;
    },
  };
}
