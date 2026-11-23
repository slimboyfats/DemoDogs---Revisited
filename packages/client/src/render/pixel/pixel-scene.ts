import type { StaticProp, World } from '@demodogs/sim';
import { armsLights } from '../arms-fx';
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
import { Lights } from './lighting';
import { drawParticle, overSmoke, type Put } from './particles';
import { DETAIL } from '../strips';
import { StackAtlas } from './stack-atlas';
import { StackBatch, type StackView } from './stack-batch';
import { OverdrawMeter, type Channel, type CountSource, type OverdrawStats } from './overdraw';

const hex = (h: string) => parseInt(h.slice(1), 16);

/**
 * The world drawn by mudders' pixel engine with the sprite-stack addon: WebGL2, one instanced
 * draw for every slice on screen, depth-tested on the GPU, lit by the frame's point lights.
 *
 * Frame order: ground quad, cast shadows (ShadowLayer), soft shadows (QuadBatch), stacks (StackBatch, depth on), particles
 * (QuadBatch with mudders' pixel-blob and stipple shapes, then an additive pass for the glow). Words and the HUD go on the overlay.
 */
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
    for (const c of w.cars)
      if ((c.wrecked || c.hp < 20) && this.visible(c.x, c.y, 60))
        L.add(c.x, c.y, 34, 0.7 + Math.sin(t * 23 + c.index * 3) * 0.2, 0xff7a20);
    for (const r of w.rockets) L.add(r.x, r.y, 28, 0.9, 0xffb060);
    armsLights(L, w);
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
      this.fx = fx;
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

    gl.viewport(0, 0, W, H);
    const bg = hex(w.venue.colors.outside);
    gl.clearColor(((bg >> 16) & 255) / 255, ((bg >> 8) & 255) / 255, (bg & 255) / 255, 1);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    this.groundLayer!.draw(view);

    // shadows, in projected map space (x, squashed y) so mudders' quad batch draws them as is
    const quadView: [number, number] = [W, H];
    const quadOrigin: [number, number] = [this.ox, this.oy];
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    this.shadowLayer!.draw(view);
    this.queueShadows(w, fx);
    this.quads.flush(quadView, quadOrigin, S);

    // stacks: one instanced draw, sorted by the depth buffer
    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.depthMask(true);
    this.gatherLights(w, fx);
    this.stacks.begin(view);
    queueStacks(this, this.art, w, fx);
    for (const v of fx.voxels) this.stacks.voxel(v.rgb, v.x, v.y, v.z, v.rot, v.s);
    for (const v of fx.wreck.grains) this.stacks.voxel(v.rgb, v.x, v.y, v.z, v.rot, v.s);
    for (const v of fx.wreck.homing) this.stacks.voxel(v.rgb, v.x, v.y, v.z, v.rot, v.s);
    this.stacks.flush(this.lights);
    gl.disable(gl.DEPTH_TEST);

    // particles: mudders' pixel blobs, on a grid as fine as the art (DETAIL cells to the art
    // pixel) so smoke and fire have the same grain as what they come off. Smoke first, fire over
    // it, then the additive cells (sparks, embers, the hot core of a flame).
    gl.enable(gl.BLEND);
    this.queueParticles(fx);
    this.quads.flush(quadView, quadOrigin, S / DETAIL);
    gl.blendFunc(gl.ONE, gl.ONE);
    this.glow.flush(quadView, quadOrigin, S / DETAIL);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.BLEND);

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
        a,
        box ? Shape.Rect : Shape.Disc,
        Math.atan2(Math.sin(rot) * this.ys, Math.cos(rot)),
      ),
    );
  }

  /**
   * Particles: mudders' pixel blobs, on a grid as fine as the art (DETAIL cells to the art pixel)
   * so smoke and fire have the same grain as what they come off. Smoke first, fire over it; the
   * additive cells (sparks, embers, the hot core of a flame) go to the glow batch.
   */
  private queueParticles(fx: Effects): void {
    const G = DETAIL;
    const cell = (v: number) => Math.floor(v * G) + 0.5;
    const normal: Put = (x, y, z, d, rgb, a, shape) =>
      this.quads.push(cell(x), cell(this.my(y, z)), d * G, d * G, rgb, a, shape);
    const glow: Put = (x, y, z, d, rgb, a) =>
      this.glow.push(cell(x), cell(this.my(y, z)), d * G, d * G, rgb, a, Shape.Rect);
    for (const f of fx.fx)
      if (!overSmoke(f) && this.visible(f.x, f.y, 40, f.z)) drawParticle(f, normal, glow);
    for (const f of fx.fx)
      if (overSmoke(f) && this.visible(f.x, f.y, 40, f.z)) drawParticle(f, normal, glow);
    fx.cells.draw(normal, glow, (x, y, z) => this.visible(x, y, 4, z));
    fx.shock.sparks.draw(normal, glow, (x, y, z) => this.visible(x, y, 4, z));
    fx.defence.draw(glow, (x, y) => this.visible(x, y, 30, 10));
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
    this.quads.flush(q, o, this.scale / DETAIL, step);
    this.glow.flush(q, o, this.scale / DETAIL, step);
  }

  /** Slices drawn last frame (for the perf readout and tests). */
  /** The sprite atlas: how full it is, and how often it filled up and was started again. */
  get atlasState(): { fill: number; flushes: number } {
    return { fill: this.atlas.fill, flushes: this.atlas.flushes };
  }

  get instances(): number {
    return this.stacks.count;
  }
}
