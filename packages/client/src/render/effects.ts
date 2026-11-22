import { DT, type SimEvent } from '@demodogs/shared';
import type { Car, StaticProp, World } from '@demodogs/sim';
import { createWalker, place, step, type Walker } from './rig';
import type { Art } from './art';
import { markGround, type Ground } from './ground';
import type { Strip } from './stack';
import { char, clone, dent, restore, shatter, voxelsOf, type Chip } from './strips';
import {
  launch,
  launchTogether,
  sample,
  shards,
  stepVoxel,
  type Burst,
  type Voxel,
} from './voxels';
import { HAZE, SOOT, stepParticle, type FxKind, type Particle } from './pixel/particles';
import type { Sound } from '../audio/sound';

const TAU = Math.PI * 2;
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
const MAX_SCARRED = 40;
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
  /** Scenery that has had a bite taken out of it: its own copy of the art, with the hole. */
  readonly scarred = new Map<StaticProp, Strip>();
  /** Fires still burning where something blew up. */
  readonly fires: Fire[] = [];
  private readonly propAlive: boolean[] = [];
  /** Strips redrawn since a renderer last looked (dents, charring, a fresh body). */
  readonly changed = new Set<Strip>();
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

  /** One lick of flame rising from (x, y, z). */
  flame(x: number, y: number, z: number, size: number, vx = 0, vy = 0, vz = rand(20, 45)): void {
    this.emit('flame', x, y, z, vx, vy, vz, rand(0.3, 0.6), size);
  }

  /** One puff of a smoke column. */
  plume(x: number, y: number, z: number, size: number, rgb = SOOT, vz = rand(26, 44)): void {
    this.emit('plume', x, y, z, rand(-5, 5), rand(-5, 5), vz, rand(1.5, 2.6), size, rgb);
  }

  ember(x: number, y: number, z: number): void {
    this.emit('ember', x, y, z, rand(-14, 14), rand(-14, 14), rand(25, 60), rand(0.8, 1.8), 1);
  }

  /**
   * An explosion, mudders' way: a ball of fire cells thrown out and up that brake in the air and
   * burn down through the fire ramp, firework stars, a ring of dust along the ground, and a patch
   * of fire left burning that feeds a smoke column.
   */
  fireball(x: number, y: number, power: number): void {
    const k = Math.sqrt(power);
    for (let i = 0; i < 30 * power; i++) {
      const a = rand(0, TAU);
      const up = rand(0, 1);
      const v = rand(30, 150) * k * Math.sqrt(1 - up * up * 0.7);
      this.emit(
        'flame',
        x + Math.cos(a) * rand(0, 3),
        y + Math.sin(a) * rand(0, 3),
        rand(1, 6),
        Math.cos(a) * v,
        Math.sin(a) * v,
        up * 130 * k,
        rand(0.35, 0.85),
        rand(4, 8) * k,
      );
    }
    for (let i = 0; i < 20 * power; i++) {
      const a = rand(0, TAU);
      const v = rand(120, 300) * k;
      this.emit(
        'glitter',
        x,
        y,
        rand(2, 6),
        Math.cos(a) * v,
        Math.sin(a) * v,
        rand(60, 260),
        rand(0.5, 1.1),
        1,
        Math.random() < 0.5 ? 0xfff0a0 : 0xffa020,
      );
    }
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * TAU + rand(-0.1, 0.1);
      const v = rand(90, 130) * k;
      this.emit('dust', x, y, 1, Math.cos(a) * v, Math.sin(a) * v, 4, rand(0.5, 0.9), 4, 0x9a8a70);
    }
    for (let i = 0; i < 8 * power; i++)
      this.plume(x + rand(-6, 6), y + rand(-6, 6), rand(4, 14), rand(5, 8));
    this.fires.push({ x, y, r: 7 * k, life: 1.1 * k, max: 1.1 * k });
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
      if (d > reach + s.def.radius) continue;
      let strip = this.scarred.get(s);
      if (!strip) {
        if (this.scarred.size >= MAX_SCARRED) continue;
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
      const from = { x: s.x, y: s.y, h: s.rot, z: 0, ox: x, oy: y, vx: 0, vy: 0 };
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
            clamp(3 + e.amount * 0.14, 3, 7),
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
          this.fireball(x, y, power);
          this.scar(x, y, power);
          for (let i = 0; i < 16; i++) this.spark(x, y, 4, 120);
          this.scorch(x, y, 16 * power);
          this.flashes.push({ x, y, r: 70 * power + 20, life: 0.45, max: 0.45, rgb: 0xffa040 });
          const v = this.vol(x, y);
          if (v > 0) S.boom(v);
          if (this.near(x, y, 160)) this.shake = Math.max(this.shake, 9 * power * v);
          break;
        }
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
            if (e.kind === 'repair') S.repair();
            else if (e.kind === 'nitro') S.nitro();
            else S.pickup();
          }
          break;
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
    for (const b of w.bots) if (b.alive) step(this.walkers[b.index]!, b.x, b.y, b.h, DT);
    // a prop that died this tick (a smashed crate, a barrel going up) bursts into its voxels
    for (const p of w.props) {
      if (!p.alive && this.propAlive[p.index] !== false) {
        const boom = p.def.explodesAt !== undefined;
        this.burst(voxelsOf(this.art.prop(p.def.id)), boom ? 260 : 200, {
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
      if (c.sliding)
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
    // a rocket rides a tail of fire and leaves a thin smoke trail
    for (const r of w.rockets) {
      const bx = r.x - Math.cos(r.h) * 5;
      const by = r.y - Math.sin(r.h) * 5;
      this.flame(bx, by, 5, rand(2, 3.5), 0, 0, 0);
      if (Math.random() < 0.6) this.emit('plume', bx, by, 5, 0, 0, 6, rand(0.5, 0.9), 2.5, HAZE);
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
