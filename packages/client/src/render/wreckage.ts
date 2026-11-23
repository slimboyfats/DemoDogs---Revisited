/**
 * What is left of scenery that came down, kept the way mudders keeps it: rigid pieces with their
 * own pixels (after its chunks.ts) and loose grit that piles where it lands (after its debris.ts),
 * all of it matter that stays on the map, that cars plough through, and that flies back to where
 * it came from when the thing is rebuilt. The material a thing is made of (`breaks` in its
 * manifest) decides how it comes apart.
 *
 * Client only: nothing here feeds back into the race.
 */
import type { MaterialManifest } from '@demodogs/shared';
import type { Strip } from './stack';
import { allVoxels, type Chip, type Voxels } from './strips';
import { HARD, Heap, chipEdges, crack, crackPlan, stepSlab, type Cut, type Slab } from './rubble';
import {
  front,
  landing,
  launch,
  sample,
  stepHoming,
  type Burst,
  type Home,
  type Homing,
  type Voxel,
} from './voxels';

export type Breaks = MaterialManifest['breaks'];

/** How something of no known material breaks. */
export const PLAIN: Breaks = {
  piece: 7,
  grit: 0.45,
  bounce: 0.22,
  brittle: 0.6,
  dust: 1,
  drift: 0,
  sparks: false,
};

/** The most pieces lying about at once, and the most grains of grit kept as rubble. */
export const MAX_PIECES = 160;
export const MAX_GRAINS = 3600;
/** The most texels of art all the pieces' strips may take up between them (room in the atlas). */
export const MAX_PIECE_TEXELS = 1_600_000;
/** Texels of art cracked per step: a span's pieces break one after another, not in one hitch. */
const CRACK_BUDGET = 100_000;
/** A piece with fewer texels than this does not split again. */
const MIN_SPLIT = 1400;
const TAU = Math.PI * 2;

/** The scenery a piece of rubble came from, as far as this file needs to know it. */
export interface Owner {
  x: number;
  y: number;
  rot: number;
  lift?: number;
}

/** A piece of something, lying or flying. */
export interface Piece extends Slab {
  strip: Strip;
  v: Voxels;
  count: number;
  mat: Breaks;
  /** Where its box's middle and underside belong, if what it came from can be rebuilt. */
  home?: Home;
  /** On its way home. */
  fly?: {
    t: number;
    wait: number;
    dur: number;
    from: [number, number, number, number, number];
    to: [number, number, number, number];
  };
  /** Back in place, waiting for the rest. */
  placed?: boolean;
}

/** A grain of grit lying in the rubble. */
export interface Grain {
  x: number;
  y: number;
  z: number;
  rot: number;
  rgb: number;
  s: number;
  home?: Home;
  drift?: number;
}

/** Something that has fallen and not been cracked yet: drawn whole where it stood meanwhile. */
export interface Falling {
  o: Owner;
  strip: Strip;
  /** The strip is this thing's own copy (to be given back), not shared art. */
  own: boolean;
  mat: Breaks;
  rebuilds: boolean;
  ox: number;
  oy: number;
}

/** What the wreckage needs of whoever shows it. */
export interface WreckHost {
  /** Loose voxels in flight; grit is thrown into these. */
  voxels: Voxel[];
  /** How many more loose voxels there is room for. */
  room(): number;
  /** Turn a piece's voxels into a strip that can be drawn. */
  strip(v: Voxels): Strip;
  /** A strip's pixels were changed; a strip will not be drawn again. */
  changed(s: Strip): void;
  dropped(s: Strip): void;
  dust(x: number, y: number, z: number): void;
  spark(x: number, y: number, z: number): void;
  /** Something heavy landed at this speed. */
  thud(x: number, y: number, hit: number): void;
  /** A grain there is no room to keep: it becomes a mark on the ground. */
  soak(g: Grain): void;
}

/** Anything fast enough to shove rubble about. */
export interface Shover {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Height of what it drives on: rubble lies on the ground, so only 0 counts. */
  deck: number;
}

export class Wreckage {
  readonly pieces: Piece[] = [];
  readonly grains: Grain[] = [];
  readonly homing: Homing[] = [];
  readonly falling: Falling[] = [];
  /** Grit lying about, and the tops of pieces lying still: what the next thing lands on. */
  readonly heap = new Heap();
  private readonly cover = new Heap();
  private coverStale = false;
  /** Texels of strip the pieces hold between them. */
  texels = 0;
  private evict = 0;

  constructor(
    private readonly host: WreckHost,
    private readonly rand: () => number,
  ) {}

  private r(a: number, b: number): number {
    return a + this.rand() * (b - a);
  }

  /** Is this strip big enough to crack into pieces (rather than just burst into bits)? */
  static cracks(s: Strip): boolean {
    const r3 = s.res * s.res * s.res;
    return (s.cw * s.ch * s.n) / r3 >= 120 && Math.min(s.cw, s.ch, s.n) >= s.res * 3;
  }

  /** Something came down (blast or blow at ox, oy): it will crack apart within a few steps. */
  fall(f: Falling): void {
    this.falling.push(f);
  }

  /** How high the rubble is at (x, y): what loose grit lands on. */
  floor(x: number, y: number): number {
    return Math.max(this.heap.at(x, y), this.cover.at(x, y));
  }

  /**
   * A loose voxel has stopped at its (x, y). True if it was kept as a grain of rubble; false if
   * the caller should let it soak into the ground as before.
   */
  settle(v: Voxel): boolean {
    if (!v.pile) return false;
    if (this.grains.length >= MAX_GRAINS && !(v.home && this.makeRoom())) return false;
    const [x, y, h] = this.heap.lay(v.x, v.y, v.s);
    const g: Grain = { x, y, z: Math.max(h, this.cover.at(x, y)), rot: v.rot, rgb: v.rgb, s: v.s };
    if (v.home) g.home = v.home;
    if (v.drift) g.drift = v.drift;
    this.grains.push(g);
    return true;
  }

  /** Give up one grain that belongs nowhere, so one that does can stay. */
  private makeRoom(): boolean {
    const G = this.grains;
    for (let k = 0; k < G.length; k++) {
      const i = (this.evict + k) % G.length;
      const g = G[i]!;
      if (g.home) continue;
      this.host.soak(g);
      this.heap.lift(g.x, g.y, g.s);
      G[i] = G[G.length - 1]!;
      G.pop();
      this.evict = i;
      return true;
    }
    return false;
  }

  /** Throw chips of something at `b` as grit. `base` is where chip (0, 0, 0) belongs at home. */
  private grit(chips: Chip[], max: number, b: Burst, mat: Breaks, base?: Home): void {
    const some = sample(chips, Math.min(max, this.host.room()), this.rand);
    for (const c of some) {
      const v = launch(c, b, this.rand);
      v.pile = true;
      if (mat.drift > 0) v.drift = mat.drift;
      if (base) v.home = { owner: base.owner, x: base.x + c.x, y: base.y + c.y, z: base.z + c.z };
      this.host.voxels.push(v);
    }
  }

  private addPiece(cut: Cut, at: Burst, mat: Breaks, base: Home | undefined, kick: number): Piece {
    const cs = Math.cos(at.h);
    const sn = Math.sin(at.h);
    const x = at.x + cut.x * cs - cut.y * sn;
    const y = at.y + cut.x * sn + cut.y * cs;
    let dx = x - at.ox;
    let dy = y - at.oy;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d;
    dy /= d;
    const sp = this.r(0.25, 1) * kick;
    const w = cut.v.cw / cut.v.res;
    const h = cut.v.ch / cut.v.res;
    const tall = cut.v.n / cut.v.res;
    const high = at.z + cut.z;
    const p: Piece = {
      strip: this.makeStrip(cut.v),
      v: cut.v,
      count: cut.count,
      mat,
      x,
      y,
      z: high,
      vx: at.vx + dx * sp + this.r(-6, 6),
      vy: at.vy + dy * sp + this.r(-6, 6),
      vz: this.r(-15, 30) + kick * 0.4,
      rot: at.h,
      spin: this.r(-1.6, 1.6),
      tilt: 0,
      dir: this.r(0, TAU),
      // what falls from high up turns over on the way down; what was on the ground just slumps
      tumble: high > 5 ? this.r(1.2, 4) : this.r(0, 1.2),
      phase: 0,
      r: Math.hypot(w, h) * 0.35,
      tall,
      still: false,
      bounce: mat.bounce,
      hits: 0,
      age: 0,
    };
    if (base)
      p.home = { owner: base.owner, x: base.x + cut.x, y: base.y + cut.y, z: base.z + cut.z };
    this.pieces.push(p);
    return p;
  }

  private makeStrip(v: Voxels): Strip {
    const s = this.host.strip(v);
    this.texels += s.img.width * s.img.height;
    return s;
  }

  private drop(p: Piece): void {
    this.texels -= p.strip.img.width * p.strip.img.height;
    this.host.dropped(p.strip);
  }

  /**
   * Make room for `n` more pieces, `texels` of strip between them, by crumbling old ones that
   * belong nowhere. True if there is room.
   */
  private roomFor(n: number, texels: number): boolean {
    const P = this.pieces;
    const full = () => P.length + n > MAX_PIECES || this.texels + texels > MAX_PIECE_TEXELS;
    for (let i = 0; i < P.length && full(); i++) {
      const p = P[i]!;
      if (p.home || !p.still) continue;
      this.crumble(p);
      P.splice(i--, 1);
      this.coverStale = true;
    }
    return !full();
  }

  /** A piece goes to grit where it lies. */
  private crumble(p: Piece): void {
    const at: Burst = {
      x: p.x,
      y: p.y,
      h: p.rot,
      z: p.z,
      ox: p.x,
      oy: p.y,
      speed: 18,
      vx: 0,
      vy: 0,
    };
    this.grit(allVoxels(p.v, p.v.res * 2), 40, at, p.mat, p.home);
    for (let i = 0; i < 2 * p.mat.dust; i++) this.host.dust(p.x, p.y, p.z + 1);
    this.drop(p);
  }

  private crackNext(): number {
    const f = this.falling.shift()!;
    const { o, strip, mat } = f;
    const v: Voxels = {
      px: strip.px!,
      W: strip.img.width,
      cw: strip.cw,
      ch: strip.ch,
      n: strip.n,
      res: strip.res,
      cols: strip.cols,
    };
    const res = v.res;
    const len: [number, number, number] = [v.cw / res, v.ch / res, v.n / res];
    const lift = o.lift ?? 0;
    const at: Burst = {
      x: o.x,
      y: o.y,
      h: o.rot,
      z: lift,
      ox: f.ox,
      oy: f.oy,
      speed: 45,
      vx: 0,
      vy: 0,
    };
    const base: Home | undefined = f.rebuilds ? { owner: o, x: 0, y: 0, z: 0 } : undefined;
    const plan = crackPlan(len, mat.piece, 8);
    const many = plan[0] * plan[1] * plan[2];
    // pieces' boxes overlap along the ragged cracks, so their strips take more than the whole did
    if (!this.roomFor(many, strip.img.width * strip.img.height * 1.6)) {
      // no room for more pieces: it all goes as lumps and grit
      this.grit(allVoxels(v, res * 2), 500, at, mat, base);
    } else {
      const { pieces, grit } = crack(v, plan, this.rand, mat.grit, 0.25, res * res * res * 4);
      for (const cut of pieces) this.addPiece(cut, at, mat, base, 34);
      this.grit(grit, 900, at, mat, base);
    }
    const n = Math.round(mat.dust);
    for (let i = 0; i < n; i++)
      this.host.dust(o.x + this.r(-0.5, 0.5) * len[0], o.y + this.r(-0.5, 0.5) * len[1], lift);
    if (f.own) this.host.dropped(strip);
    return v.cw * v.ch * v.n;
  }

  /** A piece hit the ground hard: it chips, raises dust, and may split. True if it split. */
  private land(p: Piece, hit: number): boolean {
    const H = this.host;
    const at: Burst = {
      x: p.x,
      y: p.y,
      h: p.rot,
      z: p.z,
      ox: p.x,
      oy: p.y,
      speed: 20 + hit * 0.18,
      vx: p.vx,
      vy: p.vy,
    };
    H.thud(p.x, p.y, hit);
    for (let i = 0; i < p.mat.dust * (hit / 220); i++)
      H.dust(p.x + this.r(-p.r, p.r), p.y + this.r(-p.r, p.r), p.z + 0.5);
    if (p.mat.sparks) for (let i = 0; i < 4; i++) H.spark(p.x, p.y, p.z + 1);
    const res = p.v.res;
    if (
      p.hits === 1 &&
      p.count >= MIN_SPLIT &&
      this.rand() < p.mat.brittle &&
      this.pieces.length < MAX_PIECES
    ) {
      // it breaks in two across its longest side, and the halves go their own ways
      const len = [p.v.cw / res, p.v.ch / res, p.v.n / res];
      const a = len[2]! > len[0]! && len[2]! > len[1]! ? 2 : len[0]! >= len[1]! ? 0 : 1;
      const k: [number, number, number] = [1, 1, 1];
      k[a] = 2;
      const { pieces, grit } = crack(p.v, k, this.rand, p.mat.grit, 0.3, res * res * res * 2);
      if (pieces.length > 1) {
        for (const cut of pieces) {
          const q = this.addPiece(cut, at, p.mat, p.home, 22);
          q.hits = 1;
          q.vz = hit * p.bounce * this.r(0.6, 1.3);
          q.tumble = this.r(1, 3.5);
          q.rot = p.rot;
        }
        this.grit(grit, 120, at, p.mat, p.home);
        this.drop(p);
        return true;
      }
    }
    const chips = chipEdges(p.v, Math.round(4 + hit * 0.08), this.rand);
    if (chips.length) {
      p.count -= chips.reduce((n, c) => n + Math.round(c.s * c.s * c.s * res * res * res), 0);
      H.changed(p.strip);
      this.grit(chips, 50, at, p.mat, p.home);
    }
    return false;
  }

  private relaunch(i: number, vx: number, vy: number, vz: number): void {
    const G = this.grains;
    const g = G[i]!;
    this.heap.lift(g.x, g.y, g.s);
    G[i] = G[G.length - 1]!;
    G.pop();
    if (this.host.room() <= 0) {
      if (!g.home) this.host.soak(g);
      return;
    }
    const v: Voxel = {
      x: g.x,
      y: g.y,
      z: g.z,
      vx,
      vy,
      vz,
      rot: g.rot,
      spin: this.r(-10, 10),
      rgb: g.rgb,
      s: g.s,
      age: 0,
      pile: true,
    };
    if (g.home) v.home = g.home;
    if (g.drift) v.drift = g.drift;
    this.host.voxels.push(v);
  }

  /** Lay the tops of the pieces lying still, and drop any grit that was resting on one now gone. */
  private recover(): void {
    this.coverStale = false;
    this.cover.clear();
    for (const p of this.pieces) {
      if (!p.still || p.fly || p.placed) continue;
      const top = p.z + p.tall * Math.cos(p.tilt);
      const R = Math.ceil(p.r);
      for (let dy = -R; dy <= R; dy++)
        for (let dx = -R; dx <= R; dx++)
          if (dx * dx + dy * dy <= p.r * p.r) this.cover.raise(p.x + dx, p.y + dy, top);
    }
    for (let i = this.grains.length - 1; i >= 0; i--) {
      const g = this.grains[i]!;
      if (g.z > this.floor(g.x, g.y) + 1.5) this.relaunch(i, 0, 0, 0);
    }
  }

  /** One step: crack what has fallen, move the pieces, let cars shove the rubble about. */
  step(dt: number, shovers: readonly Shover[]): void {
    for (let spent = 0; this.falling.length && spent < CRACK_BUDGET;) spent += this.crackNext();
    const P = this.pieces;
    const floor = (x: number, y: number, r: number) =>
      Math.max(this.heap.under(x, y, r) * 0.8, this.cover.under(x, y, r));
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i]!;
      if (p.placed) continue;
      if (p.fly) {
        this.flyHome(p, dt);
        continue;
      }
      if (p.still) continue;
      const hit = stepSlab(p, dt, floor);
      if (hit > HARD && this.land(p, hit)) {
        P.splice(i, 1);
        continue;
      }
      if (p.still) this.coverStale = true;
    }
    for (const c of shovers) {
      const sp = Math.hypot(c.vx, c.vy);
      if (sp < 25 || c.deck > 3) continue;
      for (const p of P) {
        if (!p.still || p.fly || p.placed || p.z > 6) continue;
        if (Math.hypot(p.x - c.x, p.y - c.y) > 4 + p.r) continue;
        // ploughed aside: shoved the way the car is going, and a little off to its side
        const side = (p.x - c.x) * c.vy - (p.y - c.y) * c.vx > 0 ? -1 : 1;
        p.still = false;
        p.age = 0;
        p.vx = c.vx * 0.5 + (-c.vy / sp) * side * this.r(10, 30);
        p.vy = c.vy * 0.5 + (c.vx / sp) * side * this.r(10, 30);
        p.vz = this.r(15, 30) + sp * 0.1;
        p.spin = this.r(-3, 3);
        p.tumble = this.r(1, 3);
        this.coverStale = true;
      }
      const G = this.grains;
      for (let i = G.length - 1; i >= 0; i--) {
        const g = G[i]!;
        const dx = g.x - c.x;
        const dy = g.y - c.y;
        if (dx * dx + dy * dy > 20) continue;
        this.relaunch(
          i,
          c.vx * 0.4 + this.r(-25, 25),
          c.vy * 0.4 + this.r(-25, 25),
          this.r(20, 70),
        );
      }
    }
    if (this.coverStale) this.recover();
    for (const h of this.homing)
      if (!h.done && stepHoming(h, dt)) {
        h.done = true;
        if (h.owner) h.rot = (h.owner as Owner).rot;
      }
  }

  private flyHome(p: Piece, dt: number): void {
    const f = p.fly!;
    f.t += dt;
    const [x1, y1, z1, rot1] = f.to;
    if (f.t >= f.dur - 1e-6) {
      p.x = x1;
      p.y = y1;
      p.z = z1;
      p.rot = rot1;
      p.tilt = 0;
      delete p.fly;
      p.placed = true;
      return;
    }
    const [x0, y0, z0, rot0, tilt0] = f.from;
    const u = Math.min(1, Math.max(0, (f.t - f.wait) / Math.max(0.01, f.dur - f.wait)));
    const e = u * u * (3 - 2 * u);
    const arc = 5 + Math.hypot(x1 - x0, y1 - y0) * 0.3;
    p.x = x0 + (x1 - x0) * e;
    p.y = y0 + (y1 - y0) * e;
    p.z = z0 + (z1 - z0) * e + Math.sin(Math.PI * u) * arc;
    // the short way round
    const turn = Math.atan2(Math.sin(rot1 - rot0), Math.cos(rot1 - rot0));
    p.rot = rot0 + turn * e;
    p.tilt = tilt0 * (1 - e);
  }

  /**
   * Rebuild these: every piece and grain that came from them lifts off the rubble and flies back
   * to its own place, over `dur` seconds, as a front sweeping left to right across them all.
   * `tall` is how tall each stands.
   */
  mend(list: readonly { o: Owner; dur: number; tall: number }[]): void {
    const of = new Map<object, { o: Owner; dur: number; tall: number }>();
    for (const m of list) of.set(m.o, m);
    const world = (h: Home): [number, number, number] => {
      const o = h.owner as Owner;
      const cs = Math.cos(o.rot);
      const sn = Math.sin(o.rot);
      return [o.x + h.x * cs - h.y * sn, o.y + h.x * sn + h.y * cs, (o.lift ?? 0) + h.z];
    };
    // grit still in the air joins in from where it is
    const V = this.host.voxels;
    for (let i = V.length - 1; i >= 0; i--) {
      const v = V[i]!;
      if (!v.home || !of.has(v.home.owner)) continue;
      this.grains.push({ x: v.x, y: v.y, z: v.z, rot: v.rot, rgb: v.rgb, s: v.s, home: v.home });
      this.heap.lay(v.x, v.y, v.s);
      V[i] = V[V.length - 1]!;
      V.pop();
    }
    let x0 = Infinity;
    let x1 = -Infinity;
    const span = (h: Home | undefined) => {
      if (!h || !of.has(h.owner)) return;
      const x = world(h)[0];
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
    };
    for (const p of this.pieces) span(p.home);
    for (const g of this.grains) span(g.home);
    const wide = Math.max(1, x1 - x0);
    const when = (h: Home, to: [number, number, number]) => {
      const m = of.get(h.owner)!;
      return landing(front((to[0] - x0) / wide, Math.min(1, h.z / m.tall)), m.dur);
    };
    for (const p of this.pieces) {
      if (!p.home || !of.has(p.home.owner) || p.placed) continue;
      const to = world(p.home);
      const [wait, land] = when(p.home, to);
      p.fly = {
        t: 0,
        wait,
        dur: land,
        from: [p.x, p.y, p.z, p.rot, p.tilt],
        to: [...to, (p.home.owner as Owner).rot],
      };
      p.still = true;
      p.vx = p.vy = p.vz = p.spin = p.tumble = 0;
    }
    const G = this.grains;
    for (let i = G.length - 1; i >= 0; i--) {
      const g = G[i]!;
      if (!g.home || !of.has(g.home.owner)) continue;
      const to = world(g.home);
      const [wait, land] = when(g.home, to);
      this.homing.push({
        x0: g.x,
        y0: g.y,
        z0: g.z,
        x1: to[0],
        y1: to[1],
        z1: to[2],
        x: g.x,
        y: g.y,
        z: g.z,
        rot: g.rot,
        rgb: g.rgb,
        s: g.s,
        t: 0,
        wait: Math.max(0, wait - this.rand() * 0.25),
        dur: land,
        owner: g.home.owner,
      });
      this.heap.lift(g.x, g.y, g.s);
      G[i] = G[G.length - 1]!;
      G.pop();
    }
    this.coverStale = true;
  }

  /** It stands again, whole: what was flying back into it is part of it now. */
  stand(o: Owner): void {
    const mine = (h: Home | undefined) => h?.owner === o;
    const P = this.pieces;
    for (let i = P.length - 1; i >= 0; i--)
      if (mine(P[i]!.home)) {
        this.drop(P[i]!);
        P.splice(i, 1);
      }
    const keep = <T>(list: T[], gone: (t: T) => boolean) => {
      let n = 0;
      for (const t of list) if (!gone(t)) list[n++] = t;
      list.length = n;
    };
    keep(this.homing, (h) => h.owner === o);
    keep(this.grains, (g) => {
      if (!mine(g.home)) return false;
      this.heap.lift(g.x, g.y, g.s);
      return true;
    });
    keep(this.host.voxels, (v) => mine(v.home));
    this.coverStale = true;
  }
}
