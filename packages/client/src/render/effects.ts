import { DECK_SURFACE, DT, type MaterialManifest, type SimEvent } from '@demodogs/shared';
import type { Car, StaticProp, World } from '@demodogs/sim';
import { createWalker, place, step, type Walker } from './rig';
import type { Art } from './art';
import { markGround, type Ground } from './ground';
import type { Strip } from './stack';
import { char, clone, dent, restore, shatter, stripCrown, voxelsOf, type Chip } from './strips';
import {
  launch,
  launchTogether,
  sample,
  shards,
  stepVoxel,
  type Burst,
  stepHoming,
  type Homing,
  type Voxel,
} from './voxels';
import { HAZE, SOOT, shade, stepParticle, type FxKind, type Particle } from './pixel/particles';
import { CKind, Cells } from './pixel/cells';
import type { Sound } from '../audio/sound';

const TAU = Math.PI * 2;
const hex = (rgb: number) => '#' + rgb.toString(16).padStart(6, '0');
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)]!;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

export type { FxKind, Particle };
export interface Debris {
  strip: Strip;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rot: number;
  spin: number;
  life: number;
}
export interface Flash {
  x: number;
  y: number;
  r: number;
  life: number;
  max: number;
  rgb: number;
}
/** A patch of fire left burning for a moment: it feeds flames, a smoke column and embers. */
export interface Fire {
  x: number;
  y: number;
  /** Radius of the burning patch, art px. */
  r: number;
  life: number;
  max: number;
}
export interface FloatText {
  x: number;
  y: number;
  z: number;
  text: string;
  col: string;
  life: number;
  max: number;
  big: boolean;
}

/** The most loose voxels in the air at once. */
const MAX_VOXELS = 2400;
/** The most pieces of scenery that keep their own damaged copy of their art. */
const MAX_SCARRED = 260;
/** A strip this many texels or more is never copied to be scarred (deck pieces): the atlas has no room. */
const BIG_STRIP = 120_000;
const big = (s: Strip): boolean => s.cw * s.ch * s.n >= BIG_STRIP;
/** mudders' soot tones: what a blast's smoke is made of. */
const SMOKE_TONES = [0x4e4648, 0x625a5c, 0x777073, 0x5a4e48] as const;
/** The most particles alive at once. */
const MAX_FX = 1800;

const BOT_RIG = {
  thigh: 3.4,
  shin: 3.6,
  ankle: 0.8,
  hipHalf: 2.2,
  standHip: 6.2,
  stride: 9,
  duty: 0.58,
  lift: 2.2,
  bob: 0.45,
  twist: 0.12,
  spine: 6,
  kneeHint: -1,
};

/**
 * Everything the client shows that the sim does not track: particles, flying debris, floating
 * words, screen shake, each car's dented body, the bots' walk rigs and the big centre message.
 * It reads the sim's events after every tick and plays them as sights and sounds.
 */
export class Effects {
  readonly fx: Particle[] = [];
  readonly debris: Debris[] = [];
  readonly texts: FloatText[] = [];
  readonly bodies: Strip[] = [];
  /** Short bursts of light (explosions, muzzle flashes) for renderers that light the world. */
  readonly flashes: Flash[] = [];
  /** Loose voxels knocked off cars and props, flying until they settle into the ground. */
  readonly voxels: Voxel[] = [];
  /** Blocks flying back to rebuild something that fell (a flyover span). */
  readonly homing: Homing[] = [];
  /** Scenery that has had a bite taken out of it: its own copy of the art, with the hole. */
  readonly scarred = new Map<StaticProp, Strip>();
  private readonly tones = new Map<string, number[]>();
  /** Single cells of fire and smoke, and the rolling air that carries them. */
  readonly cells = new Cells(14000);
  /** How much of the full effect to draw: 1 everything, less on a slow device. */
  quality = 1;
  /** Blasts still letting go of their burning gas. */
  private readonly burning: {
    x: number;
    y: number;
    z: number;
    r: number;
    left: number;
    ticks: number;
    /** Ticks it goes on smoking into the turning air after the fire. */
    smoke: number;
    high: boolean;
  }[] = [];
  /** Fires still burning where something blew up. */
  readonly fires: Fire[] = [];
  private readonly propAlive: boolean[] = [];
  /** Strips redrawn since a renderer last looked (dents, charring, a fresh body). */
  readonly changed = new Set<Strip>();
  /** Strips of its own that will not be drawn again (the renderer gives their room back). */
  readonly dropped: Strip[] = [];
  /** What each piece of shared art breaks into, worked out once. */
  private readonly bits = new WeakMap<Strip, Chip[]>();
  readonly walkers: Walker[] = [];
  shake = 0;
  msg = '';
  msgT = 0;
  private readonly smokeT: number[] = [];

  constructor(
    private readonly w: World,
    private readonly art: Art,
    private readonly ground: Ground,
    private readonly sound: Sound,
  ) {
    for (const c of w.cars) this.bodies.push(clone(this.carArt(c).body));
    for (const b of w.bots) {
      const wk = createWalker(BOT_RIG);
      place(wk, b.x, b.y, b.h);
      this.walkers.push(wk);
    }
    // the pools the map starts with
    for (const s of w.spills) if (s.fixed) this.pool(s.def, s.x, s.y, s.r);
  }

  carArt(c: Car) {
    return this.art.car(c.def.id, c.paint);
  }

  setMsg(text: string, t: number): void {
    this.msg = text;
    this.msgT = t;
  }

  // ------------------------------------------------------------ helpers
  private emit(
    kind: FxKind,
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    life: number,
    size: number,
    rgb = 0,
  ): void {
    if (this.fx.length >= MAX_FX) return;
    this.fx.push({ kind, x, y, z, vx, vy, vz, life, max: life, size, rgb });
  }

  spark(x: number, y: number, z: number, sp = 0): void {
    const a = rand(0, TAU);
    const v = rand(20, 60) + sp * Math.random();
    this.emit(
      'spark',
      x,
      y,
      z,
      Math.cos(a) * v,
      Math.sin(a) * v,
      rand(30, 110),
      rand(0.25, 0.55),
      1,
      Math.random() < 0.5 ? 0xfff6c0 : 0xffb03a,
    );
  }

  /** A thin stippled puff: tyre smoke, or dust off the dirt. */
  puff(x: number, y: number, z: number, kind: 'smoke' | 'dust', vx = 0, vy = 0): void {
    this.emit(
      kind,
      x + rand(-2, 2),
      y + rand(-2, 2),
      z,
      vx + rand(-8, 8),
      vy + rand(-8, 8),
      rand(8, 20),
      rand(0.8, 1.6),
      rand(3, 5.5),
      kind === 'smoke' ? 0x8a8680 : 0x9a8460,
    );
  }

  /**
   * A lick of flame rising from (x, y, z): a clutch of burning cells, about `size` across.
   * (vx, vy, vz) is the way the fire is thrown.
   */
  flame(x: number, y: number, z: number, size: number, vx = 0, vy = 0, vz = rand(20, 45)): void {
    const n = Math.max(1, Math.round(size * size * 0.45 * this.quality));
    const r = size * 0.5;
    for (let i = 0; i < n; i++)
      this.cells.add(
        CKind.Bang,
        x + rand(-r, r),
        y + rand(-r, r),
        z + rand(0, r),
        vx + rand(-8, 8),
        vy + rand(-8, 8),
        vz + rand(-10, 10),
        rand(0.25, 0.6),
      );
  }

  /** A puff of a smoke column: a clutch of smoke cells that the air and the wind carry off. */
  plume(x: number, y: number, z: number, size: number, rgb = SOOT, vz = rand(26, 44)): void {
    const n = Math.max(1, Math.round(size * size * 0.3 * this.quality));
    const r = size * 0.5;
    for (let i = 0; i < n; i++)
      this.cells.add(
        CKind.Wisp,
        x + rand(-r, r),
        y + rand(-r, r),
        z + rand(0, r),
        rand(-6, 6),
        rand(-6, 6),
        vz + rand(-8, 8),
        rand(1.2, 2.6),
        rgb,
      );
  }

  ember(x: number, y: number, z: number): void {
    this.emit('ember', x, y, z, rand(-14, 14), rand(-14, 14), rand(25, 60), rand(0.8, 1.8), 1);
  }

  /**
   * An explosion, mudders' way. Nothing is a drawn shape: the blast lets go a packed ball of
   * white-hot cells in every direction the ground allows, sets a ring of air rolling (up through
   * the middle, out over the top, back in along the ground) and then feeds burning gas into that
   * roll for a quarter of a second, so the fire curls over into a cap and burns out into soot
   * that is still turning. Round it: firework stars, a ring of sparks racing out with the shock,
   * dust along the ground and a patch left burning.
   */
  fireball(x: number, y: number, power: number, z = 0): void {
    const high = z > 12;
    const r = 20 * Math.sqrt(power);
    const q = this.quality;
    const C = this.cells;
    C.ring({
      x,
      y,
      z: z + r * 0.3,
      vz: high ? 8 : 24 + r * 0.9,
      R: r * 0.5,
      r: r * 0.55,
      spin: 34 + r * 1.1,
      grow: r * 0.45,
      life: 2.2,
    });
    // the bang: it fills the blast radius in a few ticks and burns out fast
    const nBang = Math.min(3000, Math.round(r * r * 3.6 * q));
    const vMax = (0.5 + r * 0.13) * 38;
    for (let i = 0; i < nBang; i++) {
      const a = rand(0, TAU);
      const u = high ? rand(-1, 1) : rand(0, 1);
      const flat = Math.sqrt(1 - u * u);
      const sp = Math.sqrt(Math.random()) * vMax;
      const d = rand(0, r * 0.2);
      C.add(
        CKind.Bang,
        x + Math.cos(a) * flat * d,
        y + Math.sin(a) * flat * d,
        z + 1 + Math.abs(u) * d,
        Math.cos(a) * flat * sp,
        Math.sin(a) * flat * sp,
        u * sp * 0.75,
        rand(0.23, 0.73),
      );
    }
    this.burning.push({
      x,
      y,
      z,
      r,
      left: Math.min(4500, Math.round(r * r * 6 * q)),
      ticks: 22,
      smoke: 50,
      high,
    });
    // the shock front: a ring of sparks racing out along the ground
    if (!high)
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * TAU;
        const v = vMax * 1.5;
        this.emit('spark', x, y, 2, Math.cos(a) * v, Math.sin(a) * v, 20, 0.22, 1, 0xfff6c0);
      }
    for (let i = 0; i < 20 * power; i++) {
      const a = rand(0, TAU);
      const v = rand(120, 300) * Math.sqrt(power);
      this.emit(
        'glitter',
        x,
        y,
        z + rand(2, 6),
        Math.cos(a) * v,
        Math.sin(a) * v,
        rand(high ? -80 : 60, 260),
        rand(0.5, 1.1),
        1,
        Math.random() < 0.5 ? 0xfff0a0 : 0xffa020,
      );
    }
    // a burst high in the air raises no dust and leaves no fire on the ground under it
    if (high) return;
    for (let i = 0; i < 90 * q; i++) {
      const a = rand(0, TAU);
      const v = rand(40, 130) * Math.sqrt(power);
      C.add(
        CKind.Wisp,
        x,
        y,
        rand(0, 2),
        Math.cos(a) * v,
        Math.sin(a) * v,
        4,
        rand(0.5, 1.1),
        0x9a8a70,
      );
    }
    this.fires.push({
      x,
      y,
      r: 7 * Math.sqrt(power),
      life: 1.1 * Math.sqrt(power),
      max: 1.1 * Math.sqrt(power),
    });
  }

  /** Let go this tick's share of each blast's burning gas: a heart over the impact, and the roll. */
  private feed(): void {
    const C = this.cells;
    for (let i = this.burning.length - 1; i >= 0; i--) {
      const b = this.burning[i]!;
      const r = b.r;
      if (b.ticks <= 0) {
        // the fire is out: the crater goes on smoking into the air that is still turning
        if (--b.smoke <= 0) this.burning.splice(i, 1);
        for (let k = 0; k < r * 1.2 * this.quality; k++) {
          const a = rand(0, TAU);
          const d = Math.sqrt(Math.random()) * r * 0.5;
          C.add(
            CKind.Wisp,
            b.x + Math.cos(a) * d,
            b.y + Math.sin(a) * d,
            b.z + rand(0, r * 0.4),
            rand(-6, 6),
            rand(-6, 6),
            rand(10, 40),
            rand(1.4, 3.2),
            SMOKE_TONES[(Math.random() * 4) | 0]!,
          );
        }
        continue;
      }
      const n = Math.ceil(b.left / b.ticks);
      b.left -= n;
      b.ticks--;
      const up = (0.55 + r * 0.03) * 45;
      const heart = Math.round(n * 0.45);
      for (let k = 0; k < n; k++) {
        const a = rand(0, TAU);
        if (k < heart) {
          // packed over the impact and thrown up: the air rolls it as it climbs
          const d = Math.sqrt(Math.random()) * r * 0.42;
          C.add(
            CKind.Fire,
            b.x + Math.cos(a) * d,
            b.y + Math.sin(a) * d,
            b.z + rand(0, r * 0.5),
            rand(-10, 10),
            rand(-10, 10),
            (b.high ? rand(-0.5, 0.5) : rand(0.4, 1)) * up,
            rand(1.3, 3),
          );
        } else {
          // thrown out along the ground into the underside of the roll
          const d = r * rand(0.25, 0.6);
          const v = rand(0.5, 1) * r * 1.5;
          C.add(
            CKind.Fire,
            b.x + Math.cos(a) * d,
            b.y + Math.sin(a) * d,
            b.z + rand(0, 3),
            Math.cos(a) * v,
            Math.sin(a) * v,
            rand(0, 12),
            rand(1.2, 2.6),
          );
        }
      }
    }
  }

  text(x: number, y: number, text: string, col = '#fff', big = false): void {
    this.texts.push({ x, y, z: 18, text, col, life: big ? 1.8 : 1.2, max: big ? 1.8 : 1.2, big });
  }

  private fling(
    strip: Strip,
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    rot: number,
    life: number,
  ): void {
    this.debris.push({ strip, x, y, z, vx, vy, vz, rot, spin: rand(-14, 14), life });
  }

  private paintGround(
    x: number,
    y: number,
    r: number,
    fn: (g: CanvasRenderingContext2D) => void,
  ): void {
    fn(this.ground.g);
    markGround(this.ground, x, y, r);
  }

  /**
   * Let leaves that came off a tree go as single cells: up to `max` of them, each from where it
   * grew, thrown at (vx, vy) and scattered by `spread`.
   */
  private leaves(
    s: StaticProp,
    off: Chip[],
    max: number,
    vx: number,
    vy: number,
    spread: number,
  ): void {
    const cs = Math.cos(s.rot);
    const sn = Math.sin(s.rot);
    const keep = Math.min(1, (max * Math.max(0.35, this.quality)) / (off.length || 1));
    for (const c of off) {
      if (Math.random() >= keep) continue;
      const k = rand(0.35, 1.2);
      this.cells.add(
        CKind.Leaf,
        s.x + c.x * cs - c.y * sn,
        s.y + c.x * sn + c.y * cs,
        c.z + (s.lift ?? 0),
        vx * k + rand(-1, 1) * spread,
        vy * k + rand(-1, 1) * spread,
        rand(-0.2, 1) * spread,
        rand(5, 9),
        c.rgb,
      );
    }
  }

  /** The colours of a kind of tree's leaves, sampled from its art once. */
  private leafTones(s: StaticProp): number[] {
    let t = this.tones.get(s.def.id);
    if (!t) {
      const C = s.def.crown!;
      const all = voxelsOf(this.art.prop(s.def.id)).filter(
        (c) => Math.hypot(c.x, c.y) > C.trunk || c.z > C.top,
      );
      t = [];
      for (let i = 0; i < 12 && all.length; i++)
        t.push(all[Math.floor(Math.random() * all.length)]!.rgb);
      this.tones.set(s.def.id, t);
    }
    return t;
  }

  /** Now and then a leaf lets go of a tree near the player and drifts off on the wind. */
  private leafFall(): void {
    if (Math.random() > 0.3 * this.quality) return;
    const P = this.w.player;
    const list = this.w.near(P.x, P.y, 230);
    const s = list[Math.floor(Math.random() * list.length)];
    const C = s?.def.crown;
    if (!s || !C || s.down || !s.leaves || Math.random() > s.leaves) return;
    const t = this.leafTones(s);
    if (!t.length) return;
    const a = rand(0, TAU);
    const d = rand(0.3, 1) * (s.def.radius + 3);
    this.cells.add(
      CKind.Leaf,
      s.x + Math.cos(a) * d,
      s.y + Math.sin(a) * d,
      C.top + rand(0, 5),
      rand(-6, 6),
      rand(-6, 6),
      0,
      rand(5, 9),
      pick(t),
    );
  }

  /** Leaves that have come down stay where they lie, a cell each. */
  private litter(): void {
    const L = this.cells.landed;
    if (!L.length) return;
    const g = this.ground.g;
    for (let i = 0; i < L.length; i += 3) {
      g.fillStyle = hex(L[i + 2]!);
      g.fillRect(Math.floor(L[i]!), Math.floor(L[i + 1]!), 1, 1);
      markGround(this.ground, L[i]!, L[i + 1]!, 1);
    }
    L.length = 0;
  }

  /** A piece of shared art as blocks, kept: many of a kind burst the same way. */
  private chipsOf(art: Strip): Chip[] {
    let c = this.bits.get(art);
    if (!c) this.bits.set(art, (c = voxelsOf(art)));
    return c;
  }

  /** A pool on the ground: a ragged blot of the material's colour, cell by cell, with a sheen. */
  private pool(m: MaterialManifest, x: number, y: number, r: number): void {
    const rgb = parseInt(m.colour.slice(1), 16);
    const k = 2 + Math.floor(rand(0, 3));
    const ph = rand(0, TAU);
    this.paintGround(x, y, r + 3, (g) => {
      for (let py = Math.floor(y - r - 1); py <= y + r + 1; py++)
        for (let px = Math.floor(x - r - 1); px <= x + r + 1; px++) {
          const dx = px + 0.5 - x;
          const dy = py + 0.5 - y;
          const a = Math.atan2(dy, dx);
          const edge = r * (0.84 + 0.11 * Math.sin(a * k + ph) + 0.05 * Math.sin(a * (k + 3) - ph));
          const d = Math.hypot(dx, dy) / edge + rand(-0.07, 0.07);
          if (d > 1) continue;
          g.globalAlpha = m.alpha * (d > 0.86 ? 0.55 : 1);
          g.fillStyle = hex(shade(rgb, rand(0.88, 1.12)));
          g.fillRect(px, py, 1, 1);
        }
      // the sheen: a few light cells
      g.globalAlpha = 0.16;
      g.fillStyle = '#ffffff';
      for (let i = 0; i < 4 + r * 0.4; i++)
        g.fillRect(
          Math.round(x + rand(-0.55, 0.55) * r),
          Math.round(y + rand(-0.55, 0.55) * r),
          Math.round(rand(1, 3)),
          1,
        );
      g.globalAlpha = 1;
    });
  }

  private splat(x: number, y: number): void {
    this.paintGround(x, y, 10, (g) => {
      g.fillStyle = 'rgba(16,14,20,0.55)';
      for (let i = 0; i < 9; i++) {
        g.beginPath();
        g.arc(x + rand(-6, 6), y + rand(-5, 5), rand(1.5, 4), 0, TAU);
        g.fill();
      }
      g.fillStyle = 'rgba(60,200,220,0.25)';
      g.beginPath();
      g.arc(x, y, 3, 0, TAU);
      g.fill();
    });
  }

  private scorch(x: number, y: number, r: number): void {
    this.paintGround(x, y, r + 1, (g) => {
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(10,8,6,0.6)');
      gr.addColorStop(1, 'rgba(10,8,6,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.fill();
    });
  }

  /**
   * A blast takes a bite out of the scenery around it: each piece in reach gets its own copy of
   * its art, cratered on the side that faced the blast, and what came off goes flying.
   */
  private scar(x: number, y: number, power: number): void {
    const reach = 10 + 14 * power;
    for (const s of this.w.statics) {
      const dx = x - s.x;
      const dy = y - s.y;
      const d = Math.hypot(dx, dy);
      // scenery that can be broken is told by the sim what it lost ('chip'); this is for the rest
      if (d > reach + s.def.radius || s.down || s.hp !== undefined) continue;
      let strip = this.scarred.get(s);
      if (!strip) {
        if (this.scarred.size >= MAX_SCARRED || big(this.art.prop(s.def.id))) continue;
        this.scarred.set(s, (strip = clone(this.art.prop(s.def.id))));
      }
      // the blast in the prop's own frame, pulled in to its edge
      const cs = Math.cos(s.rot);
      const sn = Math.sin(s.rot);
      const k = Math.min(1, (s.def.radius * 0.8) / (d || 1));
      const lx = (dx * cs + dy * sn) * k;
      const ly = (-dx * sn + dy * cs) * k;
      const broke = dent(strip, lx, ly, 2.5 + 2.5 * power, 0.85, Math.random, 1);
      this.changed.add(strip);
      const from = { x: s.x, y: s.y, h: s.rot, z: s.lift ?? 0, ox: x, oy: y, vx: 0, vy: 0 };
      this.burst(broke.chips, 60, { ...from, speed: 70 + 50 * power });
      this.burst(broke.loose, 50, { ...from, speed: 30 }, true);
    }
  }

  /** How loud a sound at (x, y) is for the player: 1 close, 0 far away. */
  vol(x: number, y: number): number {
    const P = this.w.player;
    return clamp(1 - Math.hypot(x - P.x, y - P.y) / 380, 0, 1);
  }

  private near(x: number, y: number, d: number): boolean {
    const P = this.w.player;
    return Math.hypot(x - P.x, y - P.y) < d;
  }

  // ------------------------------------------------------------ events
  handle(events: SimEvent[]): void {
    const w = this.w;
    const S = this.sound;
    let smashAt = '';
    for (const e of events) {
      switch (e.t) {
        case 'hit': {
          const c = w.cars[e.car]!;
          const broke = dent(
            this.bodies[e.car]!,
            e.lx * 0.9,
            e.ly * 0.85,
            clamp(1.3 + e.amount * 0.2, 1.3, 7),
            clamp(e.amount / 45, 0.05, 0.6),
            Math.random,
            1,
          );
          this.changed.add(this.bodies[e.car]!);
          // what the blow knocked off flies away from the hit; what it cut loose drops in a piece
          const from = { ...this.carBurst(c), ox: e.x, oy: e.y };
          this.burst(broke.chips, 90, { ...from, speed: 30 + e.amount * 3 });
          this.burst(broke.loose, 60, { ...from, speed: 25 }, true);
          if (c.isPlayer && e.amount > 6)
            this.shake = Math.max(this.shake, Math.min(10, e.amount * 0.35));
          break;
        }
        case 'crash': {
          for (let i = 0; i < 6; i++) this.spark(e.x, e.y, 3, e.impact * 0.4);
          const v = this.vol(e.x, e.y);
          if (v > 0) S.crash(e.impact * v);
          break;
        }
        case 'scrape':
          this.spark(e.x, e.y, 3, 20);
          if (e.player) S.scrape();
          break;
        case 'detach': {
          const c = w.cars[e.car]!;
          const A = this.carArt(c);
          this.debris.push({
            strip: e.part === 'top' ? A.top : A.bumper,
            x: e.x,
            y: e.y,
            z: e.z,
            vx: e.vx,
            vy: e.vy,
            vz: rand(70, 140),
            rot: c.h,
            spin: rand(-9, 9),
            life: 9,
          });
          for (let i = 0; i < 6; i++) this.spark(e.x, e.y, 3, 60);
          break;
        }
        case 'wreck': {
          const c = w.cars[e.car]!;
          // the car bursts: about half of what is left of the body flies off, the rest is a burnt hull
          const broke = shatter(this.bodies[e.car]!, 0.5, Math.random);
          const from = { ...this.carBurst(c), ox: c.x, oy: c.y };
          this.burst(broke.chips, 260, { ...from, speed: 110 });
          this.burst(broke.loose, 80, { ...from, speed: 60 }, true);
          char(this.bodies[e.car]!);
          this.changed.add(this.bodies[e.car]!);
          const A = this.carArt(c);
          for (let i = 0; i < 4; i++)
            this.fling(
              A.chunk,
              c.x,
              c.y,
              4,
              rand(-90, 90),
              rand(-90, 90),
              rand(90, 180),
              rand(0, TAU),
              7,
            );
          if (c.isPlayer)
            this.setMsg(w.kind === 'race' ? 'TOTALLED! TOWING YOU BACK' : 'YOU ARE SCRAP', 2.4);
          else if (w.kind === 'derby' && this.near(c.x, c.y, 300) && e.by !== w.player.index)
            this.text(c.x, c.y, `${c.name} IS OUT`, '#ffb08a');
          break;
        }
        case 'respawn': {
          const c = w.cars[e.car]!;
          // paint the fresh body back into the same strip, so renderers keep their copy of it
          const body = this.bodies[e.car]!;
          restore(body, this.carArt(c).body);
          this.changed.add(body);
          for (let k = 0; k < 6; k++) this.puff(c.x, c.y, 2, 'smoke');
          this.smokeT[e.car] = 0;
          break;
        }
        case 'land':
          if (e.impact > 90 && this.near(w.cars[e.car]!.x, w.cars[e.car]!.y, 300)) S.crash(10);
          break;
        case 'explode': {
          const { x, y, power } = e;
          const z = e.z ?? 0;
          this.fireball(x, y, power, z);
          this.scar(x, y, power);
          for (let i = 0; i < 16; i++) this.spark(x, y, z + 4, 120);
          if (z < 4) this.scorch(x, y, 16 * power);
          this.flashes.push({ x, y, r: 70 * power + 20, life: 0.45, max: 0.45, rgb: 0xffa040 });
          const v = this.vol(x, y);
          if (v > 0) S.boom(v);
          if (this.near(x, y, 160)) this.shake = Math.max(this.shake, 9 * power * v);
          break;
        }
        case 'strip': {
          // leaves come off a tree: off the side facing a blast, all round when shaken or burnt
          const s = w.statics[e.prop]!;
          const C = s.def.crown;
          if (!C) break;
          let strip = this.scarred.get(s);
          if (!strip) {
            if (this.scarred.size >= MAX_SCARRED) break;
            this.scarred.set(s, (strip = clone(this.art.prop(s.def.id))));
          }
          const dx = e.x - s.x;
          const dy = e.y - s.y;
          const d = Math.hypot(dx, dy) || 1;
          const blast = e.by === 'blast';
          const cs = Math.cos(s.rot);
          const sn = Math.sin(s.rot);
          const off = stripCrown(
            strip,
            C.trunk,
            C.top,
            blast ? (dx * cs + dy * sn) / d : 0,
            blast ? (-dx * sn + dy * cs) / d : 0,
            e.amount / (e.left + e.amount),
            Math.random,
          );
          this.changed.add(strip);
          if (e.by === 'heat') {
            // burnt off: the crown is in flames, and a few leaves get away alight
            for (let i = 0; i < 3; i++) {
              const c = off[Math.floor(Math.random() * off.length)];
              if (c) this.flame(s.x + c.x, s.y + c.y, c.z + (s.lift ?? 0), rand(3, 5));
            }
            this.leaves(s, off, 12, 0, 0, 18);
            break;
          }
          // away from the blast, faster the more it tore off; a shaken tree just lets them drop
          const sp = blast ? 60 + 380 * e.amount : 0;
          this.leaves(
            s,
            off,
            blast ? 170 : 60,
            (-dx / d) * sp,
            (-dy / d) * sp,
            blast ? 30 + sp * 0.25 : 14,
          );
          break;
        }
        case 'chip': {
          // a piece knocked out of scenery where it was struck
          const s = w.statics[e.prop]!;
          let strip = this.scarred.get(s);
          if (!strip && big(this.art.prop(s.def.id))) {
            // a deck piece is too big to keep a scarred copy of each: it throws grit and dust
            // where it was struck, and shows its damage by coming down
            const z = (s.lift ?? 0) + DECK_SURFACE;
            for (let i = 0; i < 4; i++) this.puff(e.x, e.y, z, 'dust');
            for (let i = 0; i < 6; i++) this.spark(e.x, e.y, z, 70);
            break;
          }
          if (!strip) {
            if (this.scarred.size >= MAX_SCARRED) break;
            this.scarred.set(s, (strip = clone(this.art.prop(s.def.id))));
          }
          const cs = Math.cos(s.rot);
          const sn = Math.sin(s.rot);
          const dx = e.x - s.x;
          const dy = e.y - s.y;
          const part = Math.min(1, e.amount / (s.def.integrity ?? 100));
          const broke = dent(
            strip,
            dx * cs + dy * sn,
            -dx * sn + dy * cs,
            clamp(1.2 + part * s.def.radius * 2.2, 1.2, 7),
            e.by === 'heat' ? 0.35 : 0.9,
            Math.random,
            e.by === 'heat' ? 1 : 0.4,
          );
          this.changed.add(strip);
          const from = { x: s.x, y: s.y, h: s.rot, z: s.lift ?? 0, ox: e.x, oy: e.y, vx: 0, vy: 0 };
          if (e.by === 'heat') {
            if (Math.random() < 0.5)
              this.flame(
                e.x + rand(-3, 3),
                e.y + rand(-3, 3),
                (s.lift ?? 0) + rand(3, 9),
                rand(3, 5),
              );
            break;
          }
          this.burst(broke.chips, 50, { ...from, speed: 40 + 60 * part });
          this.burst(broke.loose, 40, { ...from, speed: 25 }, true);
          if (e.by === 'impact') for (let i = 0; i < 3; i++) this.puff(e.x, e.y, 2, 'dust');
          break;
        }
        case 'mend': {
          // it flies back together off the rubble, bottom layers first, and stands when they land
          const s = w.statics[e.prop]!;
          const chips = sample(this.chipsOf(this.art.prop(s.def.id)), 320, Math.random);
          const cs = Math.cos(s.rot);
          const sn = Math.sin(s.rot);
          const lift = s.lift ?? 0;
          let top = 1;
          for (const c of chips) top = Math.max(top, c.z);
          for (const c of chips) {
            const x1 = s.x + c.x * cs - c.y * sn;
            const y1 = s.y + c.x * sn + c.y * cs;
            const a = rand(0, TAU);
            const d = rand(2, s.def.radius + 12);
            this.homing.push({
              x0: x1 + Math.cos(a) * d,
              y0: y1 + Math.sin(a) * d * 0.7 + lift * 0.3,
              z0: 0,
              x1,
              y1,
              z1: lift + c.z,
              x: x1,
              y: y1,
              z: 0,
              rot: s.rot + rand(-2, 2),
              rgb: c.rgb,
              s: c.s,
              t: 0,
              wait: (c.z / top) * e.in * 0.45 + rand(0, 0.15),
              dur: e.in,
            });
          }
          for (let i = 0; i < 6; i++) this.puff(s.x + rand(-8, 8), s.y + rand(-8, 8), 1, 'dust');
          break;
        }
        case 'stand': {
          const s = w.statics[e.prop]!;
          for (let i = 0; i < 8; i++) this.spark(s.x, s.y, (s.lift ?? 0) + 2, 60);
          break;
        }
        case 'fall': {
          // it comes down: every voxel it still has flies apart, and rubble marks the spot
          const s = w.statics[e.prop]!;
          let strip = this.scarred.get(s) ?? this.art.prop(s.def.id);
          if (s.def.crown && s.leaves) {
            // a tree: what leaves it still has drift down while the wood flies apart
            if (!this.scarred.has(s)) strip = clone(strip);
            const C = s.def.crown;
            this.leaves(s, stripCrown(strip, C.trunk, C.top, 0, 0, 1, Math.random), 220, 0, 0, 30);
          }
          this.burst(
            this.scarred.has(s) || s.def.crown ? voxelsOf(strip) : this.chipsOf(strip),
            220,
            {
              x: s.x,
              y: s.y,
              h: s.rot,
              z: s.lift ?? 0,
              ox: e.x,
              oy: e.y,
              speed: 55,
              vx: 0,
              vy: 0,
            },
          );
          if (this.scarred.delete(s)) this.dropped.push(strip);
          const col = s.made?.colour ?? '#6a6660';
          const r = s.def.radius;
          this.paintGround(s.x, s.y, r + 3, (g) => {
            g.fillStyle = col;
            g.globalAlpha = 0.55;
            for (let i = 0; i < 16; i++) {
              const a = rand(0, TAU);
              const d = rand(0, 1) * (r + 1);
              const q = Math.random() < 0.3 ? 2 : 1;
              g.fillRect(
                Math.round(s.x + Math.cos(a) * d),
                Math.round(s.y + Math.sin(a) * d),
                q,
                q,
              );
            }
            g.globalAlpha = 1;
          });
          for (let i = 0; i < 8; i++)
            this.puff(s.x + rand(-r, r), s.y + rand(-r, r), rand(1, 6), 'dust');
          const v = this.vol(s.x, s.y);
          if (v > 0) S.crash(6 * v);
          break;
        }
        case 'crater': {
          const { x, y, r } = e;
          const dirt = parseInt(w.venue.colors.dirt.slice(1), 16);
          const top = parseInt(w.venue.colors.ground2.slice(1), 16);
          // the pit: dark in the middle, a lip of thrown-up earth round it, all in single cells
          this.paintGround(x, y, r + 4, (g) => {
            for (let py = Math.floor(y - r - 3); py <= y + r + 3; py++)
              for (let px = Math.floor(x - r - 3); px <= x + r + 3; px++) {
                const d = Math.hypot(px + 0.5 - x, py + 0.5 - y) / r + rand(-0.12, 0.12);
                if (d > 1.28) continue;
                if (d > 1) {
                  if (Math.random() < 0.55) {
                    g.fillStyle = hex(shade(top, rand(1.12, 1.4)));
                    g.fillRect(px, py, 1, 1);
                  }
                } else {
                  // lit from the top left: the far wall catches the light, the near one is in shade
                  const lit = (px - x + (py - y)) / r;
                  g.fillStyle = hex(shade(dirt, 0.34 + 0.2 * d + 0.14 * lit + rand(-0.04, 0.04)));
                  g.fillRect(px, py, 1, 1);
                }
              }
          });
          // clods of earth thrown out: they land and stay as specks, and dust hangs over the pit
          const clods: Chip[] = [];
          for (let i = 0; i < r * 5; i++) {
            const a = rand(0, TAU);
            const d = rand(0.2, 1) * r;
            clods.push({
              x: Math.cos(a) * d,
              y: Math.sin(a) * d,
              z: rand(0, 2),
              s: Math.random() < 0.3 ? 1 : 0.5,
              rgb: shade(dirt, rand(0.6, 1.2)),
            });
          }
          this.burst(clods, 90, {
            x,
            y,
            h: 0,
            z: 0,
            ox: x,
            oy: y,
            speed: 60 + r * 5,
            vx: 0,
            vy: 0,
          });
          for (let i = 0; i < r * 14 * this.quality; i++) {
            const a = rand(0, TAU);
            const v = rand(10, 60);
            this.cells.add(
              CKind.Wisp,
              x + Math.cos(a) * rand(0, r),
              y + Math.sin(a) * rand(0, r),
              rand(0, 4),
              Math.cos(a) * v,
              Math.sin(a) * v,
              rand(20, 90),
              rand(0.6, 1.5),
              shade(dirt, rand(0.9, 1.3)),
            );
          }
          break;
        }
        case 'spill': {
          // a pool poured on the ground: a ragged blot of the material's colour, with a sheen
          const m = w.content.material.get(e.material);
          if (!m) break;
          const { x, y, r } = e;
          this.pool(m, x, y, r);
          for (let i = 0; i < 6; i++) this.puff(x, y, 1, 'dust');
          break;
        }
        case 'quench': {
          // fire put out: the flames stop and steam rolls up
          for (let i = this.fires.length - 1; i >= 0; i--) {
            const f = this.fires[i]!;
            if (Math.hypot(f.x - e.x, f.y - e.y) < e.r + 2) this.fires.splice(i, 1);
          }
          for (let i = 0; i < 10; i++)
            this.plume(
              e.x + rand(-e.r, e.r) * 0.6,
              e.y + rand(-e.r, e.r) * 0.6,
              rand(1, 5),
              rand(4, 7),
              0xd8dde0,
            );
          break;
        }
        case 'launch': {
          for (let i = 0; i < 10; i++) this.spark(e.x, e.y, 3, 90);
          const v = this.vol(e.x, e.y);
          if (v > 0) S.whoosh(v);
          break;
        }
        case 'airburst': {
          const { x, y, z, power } = e;
          this.fireball(x, y, power, z);
          this.flashes.push({ x, y, r: 90 * power + 30, life: 0.5, max: 0.5, rgb: 0xffb050 });
          const v = this.vol(x, y);
          if (v > 0) S.boom(v * 0.8);
          if (this.near(x, y, 160)) this.shake = Math.max(this.shake, 6 * power * v);
          break;
        }
        case 'pop': {
          for (let i = 0; i < 7; i++) this.spark(e.x, e.y, 2, 60);
          for (let i = 0; i < 4; i++) this.flame(e.x, e.y, rand(1, 3), rand(2.5, 4));
          this.scorch(e.x, e.y, 5);
          this.flashes.push({ x: e.x, y: e.y, r: 22, life: 0.18, max: 0.18, rgb: 0xffc060 });
          const v = this.vol(e.x, e.y);
          if (v > 0) S.pop(v);
          break;
        }
        case 'blaze':
          // a pool of burning fuel: it burns for as long as the sim says it does
          this.fires.push({ x: e.x, y: e.y, r: e.r, life: e.life, max: e.life * 0.6 });
          this.scorch(e.x, e.y, e.r + 3);
          break;
        case 'smash': {
          const b = w.bots[e.bot]!;
          const A = this.art.bot(b.def.id, b.paint);
          const sp = Math.hypot(e.vx, e.vy);
          const ux = e.vx / (sp || 1);
          const uy = e.vy / (sp || 1);
          // the bot's body bursts into its pixels, thrown the way the car was going
          this.burst(voxelsOf(A.body), 70, {
            x: e.x,
            y: e.y,
            h: b.h,
            z: 3,
            ox: e.x - ux * 6,
            oy: e.y - uy * 6,
            speed: 50 + sp * 0.5,
            vx: e.vx,
            vy: e.vy,
          });
          for (let i = 0; i < 5; i++)
            this.fling(
              i < 2 ? A.foot : A.chunk,
              e.x,
              e.y,
              3,
              ux * sp * 0.6 + rand(-60, 60),
              uy * sp * 0.6 + rand(-60, 60),
              rand(70, 160),
              rand(0, TAU),
              6,
            );
          for (let i = 0; i < 14; i++) this.spark(e.x, e.y, 5, sp * 0.3);
          for (let i = 0; i < 4; i++) this.puff(e.x, e.y, 4, 'smoke');
          this.splat(e.x, e.y);
          if (e.by === w.player.index) {
            this.text(
              e.x,
              e.y,
              `${pick(['SCRAPPED!', 'CLANK!', 'BOT BOWLED!', 'BOLTS!'])} +${b.def.points}`,
              '#7ff0ff',
            );
            // the score event that follows says the same thing
            smashAt = `${e.x},${e.y}`;
            S.smash();
          } else if (this.near(e.x, e.y, 220)) S.smash();
          break;
        }
        case 'bot-spawn': {
          const b = w.bots[e.bot]!;
          place(this.walkers[e.bot]!, b.x, b.y, b.h);
          break;
        }
        case 'break':
          // the crate itself bursts into voxels in afterStep, like any prop that dies
          for (let i = 0; i < 4; i++) this.puff(e.x, e.y, 4, 'smoke');
          if (this.near(e.x, e.y, 250)) S.crash(20);
          break;
        case 'pickup':
          for (let i = 0; i < 8; i++) this.spark(e.x, e.y, 6, 30);
          if (e.car === w.player.index) {
            this.text(e.x, e.y, e.label, '#a6fbff');
            if (e.kind === 'repair' || e.kind === 'cash') S.repair();
            else if (e.kind === 'nitro') S.nitro();
            else S.pickup();
          }
          break;
        case 'shot': {
          // a tracer down the line of fire, a flash at the muzzle, sparks where it lands
          const dx = e.tx - e.x;
          const dy = e.ty - e.y;
          const d = Math.hypot(dx, dy) || 1;
          const v = 620;
          this.emit('spark', e.x, e.y, 4.5, (dx / d) * v, (dy / d) * v, 8, d / v, 1, 0xfff0a0);
          this.flashes.push({ x: e.x, y: e.y, r: 16, life: 0.06, max: 0.06, rgb: 0xffd070 });
          if (e.hit >= 0) for (let i = 0; i < 3; i++) this.spark(e.tx, e.ty, 4, 40);
          else this.puff(e.tx, e.ty, 0.5, 'dust');
          const vol = this.vol(e.x, e.y);
          if (vol > 0) S.gun(vol);
          break;
        }
        case 'fire': {
          const c = w.cars[e.car]!;
          const wpn = w.content.weapon.get(e.weapon);
          if (wpn?.kind === 'rocket') {
            if (this.vol(c.x, c.y) > 0) S.fire();
          } else if (c.isPlayer) S.drop();
          break;
        }
        case 'score':
          if (e.car === w.player.index && `${e.x},${e.y}` !== smashAt) {
            const big = e.label.startsWith('WRECKED');
            this.text(e.x, e.y, e.label, big ? '#ff6a3d' : '#ffd24a', big);
          }
          break;
        case 'countdown':
          S.beep(false);
          break;
        case 'go':
          S.beep(true);
          this.setMsg('GO!', 0.9);
          break;
        case 'final-lap':
          this.setMsg('FINAL LAP', 1.6);
          break;
        case 'finish':
          if (e.car === w.player.index) this.setMsg(e.place === 1 ? 'YOU WIN!' : 'FINISHED', 2.4);
          break;
        case 'over':
          break;
      }
    }
    if (w.kind === 'derby' && w.endT > 0 && !this.endShown) {
      this.endShown = true;
      if (!w.player.wrecked)
        this.setMsg(
          w.cars.filter((c) => !c.wrecked).length <= 1 ? 'LAST DOG STANDING!' : 'TIME!',
          3,
        );
    }
  }
  private endShown = false;

  private carBurst(c: Car): Omit<Burst, 'ox' | 'oy' | 'speed'> {
    return { x: c.x, y: c.y, h: c.h, z: c.z + 0.6, vx: c.vx, vy: c.vy };
  }

  /**
   * Send up to `max` of these chips flying (the rest just vanish), within the overall budget.
   * `asOne` throws them all the same way, so a piece cut loose travels as a piece until it lands.
   */
  private burst(chips: Chip[], max: number, b: Burst, asOne = false): void {
    const room = Math.max(0, MAX_VOXELS - this.voxels.length);
    const some = sample(chips, Math.min(max, room), Math.random);
    if (asOne) this.voxels.push(...launchTogether(some, b, Math.random));
    else for (const c of some) this.voxels.push(launch(c, b, Math.random));
  }

  /** Per tick: walk the bots, lay skid marks, puff smoke from damaged cars, age everything. */
  afterStep(): void {
    const w = this.w;
    for (let i = this.homing.length - 1; i >= 0; i--)
      if (stepHoming(this.homing[i]!, DT)) {
        this.homing[i] = this.homing[this.homing.length - 1]!;
        this.homing.pop();
      }
    for (const b of w.bots) if (b.alive) step(this.walkers[b.index]!, b.x, b.y, b.h, DT);
    // a prop that died this tick (a smashed crate, a barrel going up) bursts into its voxels
    for (const p of w.props) {
      if (!p.alive && this.propAlive[p.index] !== false) {
        const boom = p.def.explodesAt !== undefined;
        this.burst(this.chipsOf(this.art.prop(p.def.id)), boom ? 260 : 200, {
          x: p.x,
          y: p.y,
          h: p.rot,
          z: p.z,
          ox: p.x,
          oy: p.y,
          speed: boom ? 150 : 80,
          vx: p.vx,
          vy: p.vy,
        });
      }
      this.propAlive[p.index] = p.alive;
    }
    // loose blocks fly and bounce. One that lands hard breaks into smaller ones while there is
    // room for them; one that stops is painted into the ground for good.
    const g = this.ground.g;
    for (let i = this.voxels.length - 1; i >= 0; i--) {
      const v = this.voxels[i]!;
      const fate = stepVoxel(v, DT);
      if (fate === 'fly') continue;
      if (fate === 'split') {
        if (this.voxels.length + 8 > MAX_VOXELS) continue;
        const bits = shards(v, Math.random);
        this.voxels[i] = bits[0]!;
        for (let k = 1; k < bits.length; k++) this.voxels.push(bits[k]!);
        continue;
      }
      const [x, y] = w.keepInside(v.x, v.y, 1);
      // a crumb leaves a faint speck, a block a mark its own size
      const d = Math.max(1, Math.round(v.s));
      g.globalAlpha = Math.min(1, 0.35 + v.s * 0.65);
      g.fillStyle = `rgb(${((v.rgb >> 16) & 255) * 0.8},${((v.rgb >> 8) & 255) * 0.8},${(v.rgb & 255) * 0.8})`;
      g.fillRect(Math.floor(x - d / 2 + 0.5), Math.floor(y - d / 2 + 0.5), d, d);
      g.globalAlpha = 1;
      markGround(this.ground, x, y, d);
      this.voxels[i] = this.voxels[this.voxels.length - 1]!;
      this.voxels.pop();
    }
    w.cars.forEach((c, i) => {
      const cs = Math.cos(c.h);
      const sn = Math.sin(c.h);
      // up on a deck, the marks would land on the ground below it
      if (c.sliding && c.deck < 1)
        for (const sgn of [-1, 1]) {
          const wx = -7;
          const wy = 5.4 * sgn;
          this.ground.g.fillStyle = c.offroad ? 'rgba(60,40,20,0.3)' : 'rgba(18,16,14,0.3)';
          const mx = Math.round(c.x + cs * wx - sn * wy);
          const my = Math.round(c.y + sn * wx + cs * wy);
          this.ground.g.fillRect(mx - 1, my - 1, 2, 2);
          markGround(this.ground, mx, my, 1);
        }
      if (c.sliding && Math.random() < 0.3) this.puff(c.x - cs * 9, c.y - sn * 9, 1, 'smoke');
      if (c.offroad && Math.abs(c.vf) > 50 && Math.random() < 0.25)
        this.puff(c.x - cs * 9, c.y - sn * 9, 1, 'dust');
      if (c.wrecked || c.hp < 45) {
        const t = (this.smokeT[i] ?? 0) - DT;
        this.smokeT[i] = t;
        if (t <= 0) {
          this.smokeT[i] = c.wrecked ? 0.05 : c.hp < 25 ? 0.07 : 0.16;
          // the engine: a hurt one trails grey smoke, a dying one burns under a black column
          const ex = c.x + cs * 6 + rand(-2, 2);
          const ey = c.y + sn * 6 + rand(-2, 2);
          const burning = c.wrecked || c.hp < 20;
          this.plume(ex, ey, c.z + 6, burning ? rand(4, 6) : rand(2.5, 4), burning ? SOOT : HAZE);
          if (burning) {
            this.flame(ex, ey, c.z + 5, rand(3, 5.5), c.vx * 0.5, c.vy * 0.5);
            if (Math.random() < 0.25) this.ember(ex, ey, c.z + 7);
          }
        }
      }
    });
    // a burst drum climbs on a jet of fire and leaves a column of smoke under it
    for (const p of w.props) {
      if (!p.alive || !p.flying) continue;
      for (let n = 0; n < 3; n++)
        this.flame(
          p.x + rand(-1.5, 1.5),
          p.y + rand(-1.5, 1.5),
          p.z - 2,
          rand(3, 5.5),
          0,
          0,
          -rand(30, 80),
        );
      this.plume(p.x, p.y, p.z - 3, 3.5, HAZE, 4);
      if (Math.random() < 0.5) this.spark(p.x, p.y, p.z, 30);
    }
    // burning bits falling out of a burst: stars glitter, fuel burns and smokes on its way down
    for (const e of w.embers) {
      if (e.kind === 'star') {
        this.emit(
          'glitter',
          e.x,
          e.y,
          e.z,
          rand(-6, 6),
          rand(-6, 6),
          rand(-10, 10),
          rand(0.15, 0.35),
          1,
          Math.random() < 0.5 ? 0xfff0a0 : 0xffa020,
        );
        if (Math.random() < 0.35) this.flame(e.x, e.y, e.z, rand(1.5, 2.5), 0, 0, 0);
      } else {
        this.flame(e.x, e.y, e.z, rand(2.5, 4), 0, 0, 0);
        if (Math.random() < 0.4) this.plume(e.x, e.y, e.z, 2.5, SOOT, 6);
      }
    }
    // a rocket rides a tail of fire and leaves a thin smoke trail
    for (const r of w.rockets) {
      const bx = r.x - Math.cos(r.h) * 5;
      const by = r.y - Math.sin(r.h) * 5;
      this.flame(bx, by, 5, rand(2, 3.5), 0, 0, 0);
      if (Math.random() < 0.6) this.plume(bx, by, 5, 2.5, HAZE, 6);
    }
    // fires left by explosions burn down: flames, then mostly smoke
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i]!;
      f.life -= DT;
      if (f.life <= 0) {
        this.fires.splice(i, 1);
        continue;
      }
      const k = f.life / f.max;
      const a = rand(0, TAU);
      const d = rand(0, f.r);
      const x = f.x + Math.cos(a) * d;
      const y = f.y + Math.sin(a) * d;
      for (let n = 0; n < 2; n++)
        if (Math.random() < k + 0.2)
          this.flame(x + rand(-2, 2), y + rand(-2, 2), rand(1, 4), rand(4, 7) * (0.5 + k * 0.5));
      if (Math.random() < 0.45) this.plume(x, y, rand(5, 10), rand(4, 7));
      if (Math.random() < 0.2) this.ember(x, y, 5);
    }
    this.feed();
    this.cells.step(DT);
    this.leafFall();
    this.litter();
    for (let i = this.fx.length - 1; i >= 0; i--) {
      if (stepParticle(this.fx[i]!, DT)) continue;
      this.fx[i] = this.fx[this.fx.length - 1]!;
      this.fx.pop();
    }
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i]!;
      d.life -= DT;
      if (d.life <= 0) {
        this.debris.splice(i, 1);
        continue;
      }
      d.x += d.vx * DT;
      d.y += d.vy * DT;
      d.rot += d.spin * DT;
      d.vz -= 420 * DT;
      d.z += d.vz * DT;
      if (d.z <= 0) {
        d.z = 0;
        d.vz = d.vz < -60 ? -d.vz * 0.3 : 0;
        const f = Math.exp(-5 * DT);
        d.vx *= f;
        d.vy *= f;
        d.spin *= f;
      }
      [d.x, d.y] = w.keepInside(d.x, d.y, 2);
    }
    if (this.debris.length > 160) this.debris.splice(0, this.debris.length - 160);
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i]!;
      t.life -= DT;
      t.z += 14 * DT;
      if (t.life <= 0) this.texts.splice(i, 1);
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i]!;
      f.life -= DT;
      if (f.life <= 0) this.flashes.splice(i, 1);
    }
    this.msgT -= DT;
    this.shake *= Math.exp(-8 * DT);
  }
}
