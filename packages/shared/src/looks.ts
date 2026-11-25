/**
 * Looks: how an item is drawn as a sprite stack. A part is a block of voxels described by a
 * function: w runs front to back (+x is forward), h side to side, layers is the height, all in art
 * pixels. fn(x, y, z) names the material at that point (x and y from the middle of the cell) or
 * returns null for empty. The client samples it several times finer than an art pixel, so shapes
 * can carry detail smaller than one. The client turns parts into slice strips; the sim never reads looks.
 */
export type ShapeFn = (x: number, y: number, z: number) => string | null;

export interface Part {
  w: number;
  h: number;
  layers: number;
  fn: ShapeFn;
  /**
   * The shape is smooth in height too: fn gets z as a real number (the middle of whatever fine
   * layer is being sampled), from 0 to `layers`. Without it fn gets whole layer numbers, as the
   * first looks were written, and only the outline of each layer is drawn finer.
   */
  smooth?: boolean;
}

/** Three tones per material: side in shade, side, top. */
export type Tones = readonly [string, string, string];

export interface CarLook {
  kind: 'car';
  body: Part;
  /** The same car as a toy truck, drawn in its place on a toy venue (render/art.ts `chunky`). */
  toy?: Part;
  /** The roof piece (light bar, rack, spoiler) that can be knocked off. */
  top: Part;
}

export interface PropLook {
  kind: 'prop';
  part: Part;
  /**
   * Other poses of the same thing, for the client to flip between: an animal's other step, a
   * bird's wings up and down.
   */
  alts?: Part[];
  /** Extra materials this look uses beyond the shared palette. */
  materials?: Record<string, Tones>;
  /**
   * Parts of it that move on their own (a mill's sails, a head that turns). `part` and `alts`
   * stay the whole thing at rest, which is what breaks and what anything that knows nothing of
   * bones draws; the rig is the same thing taken apart.
   */
  rig?: Rig;
  /**
   * How many times bigger than it is built the client draws it (absent: 1): the same voxels, each
   * drawn bigger, so a great chunky thing costs no more room than a small fine one.
   */
  scale?: number;
}

/**
 * How a bone moves. A stack is slices lying flat, so a bone turns freely about its upright axis
 * (every kind but `roll`); turning about a level axis is done by sampling the bone's shape again
 * at each step of the turn (`roll`).
 *  - turn: round and round, `rate` radians a second;
 *  - sweep: to and fro `arc` radians either side of where it rests;
 *  - wind: points the way the wind blows, at most `arc` from rest (all the way round without),
 *    shivering `flutter` radians;
 *  - watch: turns to the nearest car within `reach` art px, at most `arc` from rest;
 *  - roll: turns about the axis it faces along, `rate` turns a second (times the wind's strength
 *    with `by: 'wind'`). It looks the same `fold` times in a turn, and one such stretch is drawn
 *    in `steps` poses. The bone's part must be wide and tall enough to hold it at every angle.
 */
export type Motion =
  | { kind: 'turn'; rate: number }
  | { kind: 'sweep'; arc: number; rate: number }
  | { kind: 'wind'; arc?: number; flutter?: number }
  | { kind: 'watch'; reach: number; arc: number }
  | { kind: 'roll'; rate: number; steps: number; fold?: number; by?: 'time' | 'wind' };

/** A part that moves: a stack standing on a pivot of the look, or of another bone. */
export interface Bone {
  part: Part;
  /**
   * Where the middle of the part's foot goes: forward, sideways and up from the middle of the
   * look's foot, or of the bone it is `on`, in art px.
   */
  at: readonly [number, number, number];
  /** The bone it rides on (its place in the list, which must be before this one). */
  on?: number;
  /** Which way it faces at rest, radians from the way its parent faces. */
  face?: number;
  move?: Motion;
}

export interface Rig {
  /** What is left when the bones are taken off. */
  bare: Part;
  /** The bare part in the look's other poses, one for each of `alts`. */
  alts?: Part[];
  bones: Bone[];
}

/**
 * A part turned by `a` radians about the level axis it faces along (x), through its middle. The
 * part's own box is kept: what turns out of it is lost.
 */
export function rolled(p: Part, a: number): Part {
  if (a === 0) return p;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const mid = p.layers / 2;
  return {
    w: p.w,
    h: p.h,
    layers: p.layers,
    smooth: true,
    fn: (x, y, z) => {
      const dz = z - mid;
      const y0 = y * c + dz * s;
      const z0 = dz * c - y * s + mid;
      if (Math.abs(y0) > p.h / 2 || z0 < 0 || z0 >= p.layers) return null;
      return p.fn(x, y0, p.smooth ? z0 : Math.floor(z0));
    },
  };
}

/** Where each bone of a rig stands at rest in the look's own frame: x, y, z and which way it faces. */
export function restFrames(bones: readonly Bone[]): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  for (const b of bones) {
    const P = b.on === undefined ? ([0, 0, 0, 0] as const) : out[b.on];
    if (!P) throw new Error('a bone rides on one that comes after it');
    const c = Math.cos(P[3]);
    const s = Math.sin(P[3]);
    out.push([
      P[0] + c * b.at[0] - s * b.at[1],
      P[1] + s * b.at[0] + c * b.at[1],
      P[2] + b.at[2],
      P[3] + (b.face ?? 0),
    ]);
  }
  return out;
}

/**
 * The whole thing at rest, from its bare part and its bones: one part that holds them all, for
 * a look's `part` (or one of its `alts`, given that pose's bare part).
 */
export function assembled(bare: Part, bones: readonly Bone[]): Part {
  const F = restFrames(bones);
  let hw = bare.w / 2;
  let hh = bare.h / 2;
  let top = bare.layers;
  bones.forEach((b, i) => {
    const [x, y, z, a] = F[i]!;
    const c = Math.abs(Math.cos(a));
    const s = Math.abs(Math.sin(a));
    hw = Math.max(hw, Math.abs(x) + (c * b.part.w + s * b.part.h) / 2);
    hh = Math.max(hh, Math.abs(y) + (s * b.part.w + c * b.part.h) / 2);
    top = Math.max(top, z + b.part.layers);
  });
  return {
    w: Math.ceil(hw) * 2,
    h: Math.ceil(hh) * 2,
    layers: Math.ceil(top),
    smooth: true,
    fn: (x, y, z) => {
      for (let i = bones.length - 1; i >= 0; i--) {
        const p = bones[i]!.part;
        const [bx, by, bz, a] = F[i]!;
        const lz = z - bz;
        if (lz < 0 || lz >= p.layers) continue;
        const c = Math.cos(a);
        const s = Math.sin(a);
        const lx = (x - bx) * c + (y - by) * s;
        const ly = (y - by) * c - (x - bx) * s;
        if (Math.abs(lx) > p.w / 2 || Math.abs(ly) > p.h / 2) continue;
        const m = p.fn(lx, ly, p.smooth ? lz : Math.floor(lz));
        if (m) return m;
      }
      if (Math.abs(x) > bare.w / 2 || Math.abs(y) > bare.h / 2 || z >= bare.layers) return null;
      return bare.fn(x, y, bare.smooth ? z : Math.floor(z));
    },
  };
}

export interface BotLook {
  kind: 'bot';
  body: Part;
  aerial: Part;
  limb: Part;
  foot: Part;
  chunk: Part;
}

export type Look = CarLook | PropLook | BotLook;

/** A look module: the item id it draws, and the look. */
export interface LookModule {
  id: string;
  look: Look;
}
