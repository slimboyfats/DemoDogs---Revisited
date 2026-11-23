import type { StaticProp, World } from '@demodogs/sim';
import { armsLights } from '../arms-fx';
import { arsenalLights } from '../arsenal-fx';
import type { Art } from '../art';
import type { Effects } from '../effects';
import type { Ground } from '../ground';
import type { WorldRenderer } from '../overlay';
import { PITCH, type Camera } from '../scene';
import type { Strip } from '../stack';
import { queueShadows, queueStacks, type StackSink } from '../stacks';
import { QuadBatch, Shape } from './batch';
import { GroundLayer } from './ground-layer';
import { ShadowLayer } from './shadow-layer';
import { ShadowMap, casts } from '../cast';
import { pixels } from '../strips';
import { Lights, MAX_CONES } from './lighting';
import { drawParticle, overSmoke, type Put } from './particles';
import { fineGrid } from '../strips';
import { GasGpu, type GasView } from './gas-gpu';
import { StackAtlas } from './stack-atlas';
import { StackBatch, type StackSky, type StackView } from './stack-batch';
import { Atmosphere } from '../atmosphere';
import { LensPass, MAX_RIPPLES, rippleAt, type Lens } from './post';
import { OverdrawMeter, type Channel, type CountSource, type OverdrawStats } from './overdraw';

const hex = (h: string) => parseInt(h.slice(1), 16);

/**
 * The world drawn by mudders' pixel engine with the sprite-stack addon: WebGL2, one instanced
 * draw for every slice on screen, depth-tested on the GPU, lit by the frame's point lights.
 *
 * Frame order: ground quad, cast shadows (ShadowLayer), soft shadows (QuadBatch), stacks (StackBatch, depth on), particles
 * (QuadBatch with mudders' pixel-blob and stipple shapes, then an additive pass for the glow). Words and the HUD go on the overlay.
 */
/** Gas cells the GPU holds at once (a blast lets go thousands; a big fire tens of thousands). */
const GAS_CAP = 131072;

export class PixelScene implements WorldRenderer, StackSink, CountSource {
  readonly gl: WebGL2RenderingContext;
  private readonly atlas: StackAtlas;
  private fx: Effects | null = null;
  private readonly stacks: StackBatch;
  private readonly quads: QuadBatch;
  private readonly glow: QuadBatch;
  private readonly lights = new Lights();
  private groundLayer: GroundLayer | null = null;
  private shadowLayer: ShadowLayer | null = null;
  private shadows: ShadowMap | null = null;
  private ground: Ground | null = null;
  private scale = 4;
  /** Screen cells to the art pixel for particles (see `fineGrid`). */
  private fxGrid = fineGrid(4);
  /** Fire and smoke on the GPU; null where it cannot (then they stay on the CPU). */
  private gas: GasGpu | null | undefined = undefined;
  private readonly ys = Math.sin(PITCH);
  private readonly cosP = Math.cos(PITCH);
  private ox = 0;
  private oy = 0;
  private vw = 1;
  private vh = 1;
  /** The overdraw meter (made on first use), the heat map shown, and a read-back asked for. */
  private meter: OverdrawMeter | null = null;
  private heat: Channel | null = null;
  private metering = false;
  private wantRead = false;
  private last: OverdrawStats | null = null;
  private frameW: World | null = null;
  /** How strong sun shadows are this frame, 0 to 1. */
  private shade = 1;
  /** The shockwave lens (made on first use), and whether to bend the picture at all. */
  private lens: LensPass | null = null;
  private readonly lenses: Lens[] = [];
  distort = true;
  /** The sky: how dark, how wet, how much snow (set its `dark`, `wet`, `snow`; see Atmosphere). */
  readonly sky = new Atmosphere();
  /** Draw wet ground's reflections (off on a weak phone: the stacks are drawn a second time). */
  reflections = true;
  /** A line round your own car: always, never, or only when it is dark enough to lose it. */
  outline: 'on' | 'off' | 'auto' = 'auto';
  /** Let a new race rise out of the ground, slice by slice. */
  bloom = true;
  /** Seconds the sky moves on each frame drawn, instead of the clock's (captures). */
  fixedDt: number | null = null;
  private lastT = 0;
  private readonly stackSky: StackSky;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly art: Art,
  ) {
    const gl = canvas.getContext('webgl2', {
      antialias: false,
      depth: true,
      alpha: false,
      premultipliedAlpha: true,
    });
    if (!gl) throw new Error('WebGL2 is not available');
    this.gl = gl;
    this.atlas = new StackAtlas(gl);
    this.stacks = new StackBatch(gl, this.atlas);
    this.quads = new QuadBatch(gl);
    this.glow = new QuadBatch(gl, 1024);
    this.atlas.setLit(true);
    const A = this.sky;
    this.stackSky = {
      lit: true,
      amb: A.amb,
      sun: A.sun,
      dir: A.dir,
      glow: 0,
      snow: 0,
      wet: 0,
      time: 0,
    };
  }

  /** Flat light and no second atlas texture (as before there was a sky), or the lit look. */
  setFlat(flat: boolean): void {
    this.sky.flat = flat;
    this.atlas.setLit(!flat);
  }

  // StackSink: where the next instance will go, and a line round everything queued since
  mark(): number {
    return this.stacks.count;
  }
  rim(from: number, rgb: number): void {
    this.stacks.outline(from, rgb);
  }
  warm(on: boolean): void {
    this.stacks.warm = on;
  }
  /** Should your own car get its line this frame? */
  get rimOn(): boolean {
    return this.outline === 'on' || (this.outline === 'auto' && this.sky.now.dark >= 0.4);
  }

  /** Can this browser run the pixel engine? */
  static supported(): boolean {
    try {
      return !!document.createElement('canvas').getContext('webgl2');
    } catch {
      return false;
    }
  }

  setScale(s: number): void {
    this.scale = s;
    this.fxGrid = fineGrid(s);
  }

  sx(x: number): number {
    return this.ox + x * this.scale;
  }

  sy(y: number, z = 0): number {
    return this.oy + y * this.scale * this.ys - z * this.scale * this.cosP;
  }

  // StackSink: visibility and forwarding to the batch (the GPU needs no grouping)
  visible(x: number, y: number, rad: number, ht = 0): boolean {
    const sx = this.sx(x);
    const sy = this.sy(y);
    const m = rad * this.scale;
    return sx > -m && sx < this.vw + m && sy > -m && sy < this.vh + m + ht * this.scale * this.cosP;
  }
  group(): void {}
  slice(
    s: Strip,
    i: number,
    x: number,
    y: number,
    z: number,
    rot: number,
    thick?: number,
    alpha?: number,
  ): void {
    this.stacks.slice(s, i, x, y, z, rot, thick, alpha);
  }
  stack(s: Strip, x: number, y: number, z: number, rot: number, alpha?: number): void {
    this.stacks.stack(s, x, y, z, rot, alpha);
  }
  zoom(k: number): void {
    this.stacks.zoom(k);
  }
  limb(s: Strip, a: readonly number[], b: readonly number[], n: number): void {
    this.stacks.limb(s, a, b, n);
  }

  /** Projected "map" y for the quad batch: ground y squashed, lifted by height. */
  private my(y: number, z: number): number {
    return y * this.ys - z * this.cosP;
  }

  private gatherLights(w: World, fx: Effects): void {
    const L = this.lights;
    L.clear();
    const t = w.time;
    for (const f of fx.flashes) L.add(f.x, f.y, f.r, 1.6 * (f.life / f.max), f.rgb);
    // a blast's ball lights the ground and its own smoke for as long as it burns
    for (const b of fx.blasts) {
      const k = 1 - b.age / 70;
      L.add(b.x, b.y, b.r * 3.2, (1.3 + Math.sin(t * 37 + b.x) * 0.15) * k * k, 0xff9a38);
    }
    for (const c of w.cars)
      if ((c.wrecked || c.hp < 20) && this.visible(c.x, c.y, 60))
        L.add(c.x, c.y, 34, 0.7 + Math.sin(t * 23 + c.index * 3) * 0.2, 0xff7a20);
    for (const r of w.rockets) L.add(r.x, r.y, 28, 0.9, 0xffb060);
    armsLights(L, w);
    arsenalLights(L, w);
    for (const f of fx.fires)
      L.add(
        f.x,
        f.y,
        30 + f.r * 3,
        (0.5 + Math.sin(t * 31 + f.x) * 0.2) * (f.life / f.max) + 0.3,
        0xff8a30,
      );
    for (const m of w.mines)
      if (Math.floor(m.t * 4) % 2 && this.visible(m.x, m.y, 30)) L.add(m.x, m.y, 18, 0.8, 0xff2020);
    for (const p of w.pickups)
      if (p.on && this.visible(p.x, p.y, 30)) L.add(p.x, p.y, 20, 0.45, 0x60f0ff);
    if (!this.sky.lamps) return;
    // dark enough for lamps: every running car throws a beam from its nose, your own first
    const lamp = (c: World['cars'][number]) => {
      if (c.wrecked || !c.has.front || !this.visible(c.x, c.y, 110)) return;
      const a = c.def.body.halfLength - 1;
      L.cone(c.x + Math.cos(c.h) * a, c.y + Math.sin(c.h) * a, c.h);
    };
    lamp(w.player);
    // (a phone that is struggling gets your own beam and two more)
    const most = fx.quality > 0.6 ? MAX_CONES : 3;
    for (const c of w.cars) if (c !== w.player && L.coneCount < most) lamp(c);
    // and scenery with a lamp in it lights the ground round its foot
    const k = (this.sky.now.dark - 0.42) / 0.58;
    for (const s of w.statics) {
      if (s.down || !this.visible(s.x, s.y, 50)) continue;
      if (!this.art.prop(s.def.id).glow) continue;
      L.add(s.x, s.y, 44, 0.75 * k, 0xffd890);
    }
  }

  draw(w: World, fx: Effects, ground: Ground, cam: Camera, W: number, H: number): void {
    const gl = this.gl;
    const S = this.scale;
    if (ground !== this.ground) {
      this.groundLayer?.dispose();
      this.groundLayer = new GroundLayer(gl, ground);
      this.ground = ground;
    }
    // a new race: nothing of the last one's damaged art will be drawn again
    if (fx !== this.fx) {
      this.atlas.reset();
      if (this.fx) this.fx.cells.gpu = null;
      this.fx = fx;
      // fire and smoke go to the GPU from here on (if it can take them)
      if (this.gas === undefined) {
        try {
          this.gas = new GasGpu(gl, GAS_CAP);
        } catch {
          this.gas = null;
        }
      }
      this.gas?.clear();
      fx.cells.gpu = this.gas;
      // and its tall scenery throws its shadows anew, from its own shape
      this.shadowLayer?.dispose();
      const art = this.art;
      this.shadows = new ShadowMap(
        w.w,
        w.h,
        (s) => fx.scarred.get(s) ?? art.prop(s.def.id),
        pixels,
      );
      this.shadows.build(w.statics);
      this.shadowLayer = new ShadowLayer(gl, this.shadows);
    }
    // the sky follows its targets, and strips waiting for their lighting get a little time
    const clock = performance.now();
    const dt = this.fixedDt ?? (this.lastT ? Math.min(0.1, (clock - this.lastT) / 1000) : 0);
    this.lastT = clock;
    const A = this.sky;
    A.update(dt);
    this.atlas.work(2.5, () => performance.now());
    const sky = this.stackSky;
    sky.lit = !A.flat;
    sky.glow = A.glow;
    sky.snow = A.now.snow;
    sky.wet = A.now.wet;
    sky.time = A.time;
    sky.grow = this.bloom && w.time < 2.6 ? [w.player.x, w.player.y, w.time * 70 - 6] : undefined;
    const tint = A.plain ? undefined : A.ground;
    this.shadows!.update(w);
    this.shadowLayer!.sync();
    for (const s of fx.dropped) this.atlas.release(s);
    fx.dropped.length = 0;
    for (const s of fx.changed) this.atlas.refresh(s);
    fx.changed.clear();
    this.groundLayer!.sync();

    // the view: the camera point in the middle, origin snapped to whole device pixels (as mudders' Camera)
    const cx = cam.x + ((Math.random() - 0.5) * cam.shake) / S;
    const cy = cam.y + ((Math.random() - 0.5) * cam.shake) / S;
    this.vw = W;
    this.vh = H;
    this.ox = Math.round(W / 2 - cx * S);
    this.oy = Math.round(H / 2 - cy * S * this.ys);
    const view: StackView = {
      w: W,
      h: H,
      ox: this.ox,
      oy: this.oy,
      scale: S,
      ys: this.ys,
      zk: S * this.cosP,
      worldH: w.h,
    };

    // shockwaves bend the picture: while one is on screen the frame goes through the lens pass
    const lenses = this.gatherLenses(fx);
    if (lenses.length) (this.lens ??= new LensPass(gl)).begin(W, H);

    gl.viewport(0, 0, W, H);
    const bg = hex(w.venue.colors.outside);
    gl.clearColor(((bg >> 16) & 255) / 255, ((bg >> 8) & 255) / 255, (bg & 255) / 255, 1);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    this.gatherLights(w, fx);
    this.groundLayer!.draw(view, this.lights, { ground: A.ground, snow: sky.snow, wet: sky.wet });

    // shadows, in projected map space (x, squashed y) so mudders' quad batch draws them as is
    const quadView: [number, number] = [W, H];
    const quadOrigin: [number, number] = [this.ox, this.oy];
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    this.shade = A.shade * (sky.grow ? Math.min(1, w.time / 2.6) : 1);
    this.shadowLayer!.draw(view, this.shade);
    this.queueShadows(w, fx);
    this.quads.flush(quadView, quadOrigin, S);

    // stacks: one instanced draw, sorted by the depth buffer
    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.depthMask(true);
    this.stacks.begin(view);
    queueStacks(this, this.art, w, fx);
    for (const v of fx.voxels) this.stacks.voxel(v.rgb, v.x, v.y, v.z, v.rot, v.s);
    for (const v of fx.wreck.grains) this.stacks.voxel(v.rgb, v.x, v.y, v.z, v.rot, v.s);
    for (const v of fx.wreck.homing) this.stacks.voxel(v.rgb, v.x, v.y, v.z, v.rot, v.s);
    this.stacks.ready();
    if (sky.wet > 0.02 && this.reflections && fx.quality > 0.5) {
      // wet ground: the stacks upside down under their feet first, then the depth buffer afresh
      this.stacks.mirror(this.lights, sky);
      gl.clear(gl.DEPTH_BUFFER_BIT);
    }
    this.stacks.flush(this.lights, sky);
    gl.disable(gl.DEPTH_TEST);

    // particles: mudders' single cells, on the screen's fine grid (about 2 device px a cell).
    // Smoke first, fire over it, then the additive cells (sparks, embers, the hot core of a flame).
    gl.enable(gl.BLEND);
    const gas: GasView = {
      w: W,
      h: H,
      ox: this.ox,
      oy: this.oy,
      scale: S,
      grid: this.fxGrid,
      ys: this.ys,
      cosP: this.cosP,
    };
    this.gas?.draw(gas, this.lights, 0, tint);
    this.queueParticles(fx);
    this.queueSnow(W, H);
    this.quads.flush(quadView, quadOrigin, S / this.fxGrid, undefined, tint);
    this.gas?.draw(gas, this.lights, 1, tint);
    gl.blendFunc(gl.ONE, gl.ONE);
    this.glow.flush(quadView, quadOrigin, S / this.fxGrid);
    this.gas?.draw(gas, this.lights, 2);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.BLEND);
    if (lenses.length) this.lens!.end(lenses, [this.ox, this.oy], S / this.fxGrid, this.ys);

    this.frameW = w;
    if (this.metering && (this.heat || this.wantRead)) {
      this.meter ??= new OverdrawMeter(gl);
      this.meter.count(this, W, H);
      if (this.wantRead) {
        this.last = this.meter.read(this.stacks.count);
        this.wantRead = false;
      }
      if (this.heat) this.meter.drawHeat(this.heat, W, H);
    }
  }

  /** The frame's lens rings in device pixels: every ripple that has started and is near the view. */
  private gatherLenses(fx: Effects): Lens[] {
    const L = this.lenses;
    L.length = 0;
    if (!this.distort) return L;
    const S = this.scale;
    for (const r of fx.ripples) {
      if (L.length >= MAX_RIPPLES) break;
      if (r.t < 0 || r.t > r.dur) continue;
      const at = rippleAt(r.t / r.dur, r.maxR, r.width, r.strength);
      if (!this.visible(r.x, r.y, at.r + 4)) continue;
      L.push({
        x: this.sx(r.x),
        y: this.sy(r.y, r.z),
        r: at.r * S,
        width: at.width * S,
        strength: at.strength,
      });
    }
    return L;
  }

  private queueShadows(w: World, fx: Effects): void {
    const art = this.art;
    const cast = (s: StaticProp) => casts(s, fx.scarred.get(s) ?? art.prop(s.def.id));
    queueShadows(this, art, w, cast, (x, y, rx, ry, rot, a, box) =>
      this.quads.push(
        x,
        this.my(y, 0),
        rx * 2,
        ry * 2 * this.ys,
        0x000000,
        a * this.shade,
        box ? Shape.Rect : Shape.Disc,
        Math.atan2(Math.sin(rot) * this.ys, Math.cos(rot)),
      ),
    );
  }

  /**
   * Particles, on the screen's own fine grid: one cell is `fxGrid` to the art pixel, about two
   * device pixels (one CSS pixel), as small as mudders draws its fire and smoke at a whole-map
   * view. Fire, smoke, sparks and embers are single cells on that grid; the few blob particles
   * left (art px sizes) are drawn on it too, so their edges step in fine cells. Smoke first, fire
   * over it; the additive cells (sparks, embers, the hot core of a flame) go to the glow batch.
   */
  private queueParticles(fx: Effects): void {
    const G = this.fxGrid;
    // a cell's place on the grid: odd sizes sit on a cell, even ones on the line between cells
    const at = (v: number, n: number) => (n & 1 ? Math.floor(v * G) + 0.5 : Math.round(v * G));
    // sizes in art px (blobs)
    const normal: Put = (x, y, z, d, rgb, a, shape) => {
      const n = Math.max(1, Math.round(d * G));
      this.quads.push(at(x, n), at(this.my(y, z), n), n, n, rgb, a, shape);
    };
    const glow: Put = (x, y, z, d, rgb, a) => {
      const n = Math.max(1, Math.round(d * G));
      this.glow.push(at(x, n), at(this.my(y, z), n), n, n, rgb, a, Shape.Rect);
    };
    // sizes in fine cells (fire, smoke, leaves, arcs: mudders' single cells)
    const cellN: Put = (x, y, z, n, rgb, a, shape) =>
      this.quads.push(at(x, n), at(this.my(y, z), n), n, n, rgb, a, shape);
    const cellG: Put = (x, y, z, n, rgb, a) =>
      this.glow.push(at(x, n), at(this.my(y, z), n), n, n, rgb, a, Shape.Rect);
    const one = 1 / G;
    for (const f of fx.fx)
      if (!overSmoke(f) && this.visible(f.x, f.y, 40, f.z)) drawParticle(f, normal, glow, one);
    for (const f of fx.fx)
      if (overSmoke(f) && this.visible(f.x, f.y, 40, f.z)) drawParticle(f, normal, glow, one);
    fx.cells.draw(cellN, cellG, (x, y, z) => this.visible(x, y, 4, z));
    fx.shock.sparks.draw(cellN, cellG, (x, y, z) => this.visible(x, y, 4, z));
    fx.defence.draw(glow, (x, y) => this.visible(x, y, 30, 10));
  }

  /**
   * Falling snow: single cells on the fine grid, each on its own slow path down the screen,
   * drifting with the ground as the camera moves so they do not stick to the glass.
   */
  private queueSnow(W: number, H: number): void {
    const A = this.sky;
    const fall = Math.min(1, A.snow) * (this.fx ? Math.min(1, this.fx.quality + 0.2) : 1);
    if (fall <= 0.01 || A.flat) return;
    const cell = this.scale / this.fxGrid;
    const cw = W / cell;
    const ch = H / cell;
    const n = Math.round(((W * H) / 5200) * fall);
    const t = A.time;
    const ox = this.ox / cell;
    const oy = this.oy / cell;
    for (let i = 0; i < n; i++) {
      // a cheap hash per flake: where it starts, how fast it falls, how it wanders
      const a = Math.sin(i * 12.9898) * 43758.5453;
      const b = Math.sin(i * 78.233) * 12543.123;
      const fa = a - Math.floor(a);
      const fb = b - Math.floor(b);
      const near = 0.5 + fa * 0.9;
      const x = fa * cw * 7 + ox * near + Math.sin(t * (0.6 + fb) + i) * 5 + t * 6 * near;
      const y = fb * ch * 5 + oy * near + t * (16 + 22 * fb) * near;
      const sx = ((x % cw) + cw) % cw;
      const sy = ((y % ch) + ch) % ch;
      const big = near > 1.15 ? 2 : 1;
      this.glow.push(
        Math.floor(sx - ox) + 0.5 * (big & 1),
        Math.floor(sy - oy) + 0.5 * (big & 1),
        big,
        big,
        0xdfe8f4,
        0.55 + 0.4 * fb,
        Shape.Rect,
      );
    }
  }

  // ---- the overdraw meter (?dev OVERDRAW, ?overdraw with the perf recorder, __dd.overdraw())

  /** Draw slices nearest first (the default) or in the order they are queued (to compare). */
  set frontToBack(on: boolean) {
    this.stacks.frontToBack = on;
  }

  get frontToBack(): boolean {
    return this.stacks.frontToBack;
  }

  /** Turn the meter on (it keeps a shelled copy of the atlas while on) or off. */
  setMeter(on: boolean): void {
    if (on === this.metering) return;
    this.metering = on;
    this.atlas.setShell(on);
    if (!on) {
      this.heat = null;
      this.last = null;
    }
  }

  get meterOn(): boolean {
    return this.metering;
  }

  /** Show one count as a heat map over the world, or none. */
  setHeat(ch: Channel | null): void {
    if (ch) this.setMeter(true);
    this.heat = ch;
  }

  get heatShown(): Channel | null {
    return this.heat;
  }

  /** Ask for a read-back with the next frame; `overdraw` has it after that frame is drawn. */
  measureNext(): void {
    if (this.metering) this.wantRead = true;
  }

  /** The last read-back, if any. */
  get overdraw(): OverdrawStats | null {
    return this.last;
  }

  // CountSource: the frame's slices and particles drawn again with counting shaders
  slices(cover: boolean, shell: boolean, front: boolean, step: number): void {
    this.stacks.drawCount({ cover, shell, front, step }, this.lights);
  }
  particles(step: number): void {
    if (!this.frameW || !this.fx) return;
    const q: [number, number] = [this.vw, this.vh];
    const o: [number, number] = [this.ox, this.oy];
    this.queueShadows(this.frameW, this.fx);
    this.quads.flush(q, o, this.scale, step);
    this.queueParticles(this.fx);
    this.quads.flush(q, o, this.scale / this.fxGrid, step);
    this.glow.flush(q, o, this.scale / this.fxGrid, step);
  }

  /** Slices drawn last frame (for the perf readout and tests). */
  /** The sprite atlas: how full it is, and how often it filled up and was started again. */
  get atlasState(): { fill: number; flushes: number } {
    return { fill: this.atlas.fill, flushes: this.atlas.flushes };
  }

  /** Strips still waiting for their lighting to be baked. */
  get baking(): number {
    return this.atlas.baking;
  }

  get instances(): number {
    return this.stacks.count;
  }
}
