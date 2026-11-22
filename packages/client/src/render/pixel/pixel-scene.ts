import type { World } from '@demodogs/sim';
import type { Art } from '../art';
import type { Effects } from '../effects';
import type { Ground } from '../ground';
import type { WorldRenderer } from '../overlay';
import { PITCH, type Camera } from '../scene';
import type { Strip } from '../stack';
import { queueShadows, queueStacks, type StackSink } from '../stacks';
import { QuadBatch, Shape } from './batch';
import { GroundLayer } from './ground-layer';
import { Lights } from './lighting';
import { StackAtlas } from './stack-atlas';
import { StackBatch, type StackView } from './stack-batch';

const hex = (h: string) => parseInt(h.slice(1), 16);
const FIRE = [0xffe27a, 0xff8a2a, 0xc0321c] as const;

/**
 * The world drawn by mudders' pixel engine with the sprite-stack addon: WebGL2, one instanced
 * draw for every slice on screen, depth-tested on the GPU, lit by the frame's point lights.
 *
 * Frame order: ground quad, shadows (QuadBatch), stacks (StackBatch, depth on), particles
 * (QuadBatch with mudders' pixel-blob and stipple shapes). Words and the HUD go on the overlay.
 */
export class PixelScene implements WorldRenderer, StackSink {
  private readonly gl: WebGL2RenderingContext;
  private readonly atlas: StackAtlas;
  private readonly stacks: StackBatch;
  private readonly quads: QuadBatch;
  private readonly lights = new Lights();
  private groundLayer: GroundLayer | null = null;
  private ground: Ground | null = null;
  private scale = 4;
  private readonly ys = Math.sin(PITCH);
  private readonly cosP = Math.cos(PITCH);
  private ox = 0;
  private oy = 0;
  private vw = 1;
  private vh = 1;

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
    queueShadows(this, this.art, w, (x, y, rx, ry, rot, a) =>
      this.quads.push(
        x,
        this.my(y, 0),
        rx * 2,
        ry * 2 * this.ys,
        0x000000,
        a,
        Shape.Disc,
        Math.atan2(Math.sin(rot) * this.ys, Math.cos(rot)),
      ),
    );
    this.quads.flush(quadView, quadOrigin, S);

    // stacks: one instanced draw, sorted by the depth buffer
    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.depthMask(true);
    this.gatherLights(w, fx);
    this.stacks.begin(view);
    queueStacks(this, this.art, w, fx);
    for (const v of fx.voxels) this.stacks.voxel(v.rgb, v.x, v.y, v.z, v.rot);
    this.stacks.flush(this.lights);
    gl.disable(gl.DEPTH_TEST);

    // particles: mudders' pixel shapes (stippled smoke, solid fire blobs, single-pixel sparks)
    gl.enable(gl.BLEND);
    for (const f of fx.fx) {
      const k = f.life / f.max;
      const x = f.x;
      const y = this.my(f.y, f.z);
      if (f.kind === 'smoke') {
        const d = f.size * (1 + (1 - k) * 1.8) * 1.6;
        this.quads.push(x, y, d, d, 0x3a3836, 0.7 * k, Shape.Stipple);
      } else if (f.kind === 'dust') {
        const d = f.size * (1 + (1 - k) * 1.5) * 1.6;
        this.quads.push(x, y, d, d, 0x9a8460, 0.6 * k, Shape.Stipple);
      } else if (f.kind === 'fire') {
        const col = FIRE[k > 0.6 ? 0 : k > 0.3 ? 1 : 2];
        this.quads.push(x, y, f.size * 1.4, f.size * 1.4, col, 1, Shape.Solid);
      } else {
        this.quads.push(x, y, 0.9, 0.9, k > 0.5 ? 0xfff6c0 : 0xffb03a, 1, Shape.Rect);
      }
    }
    this.quads.flush(quadView, quadOrigin, S);
    gl.disable(gl.BLEND);
  }

  /** Slices drawn last frame (for the perf readout and tests). */
  get instances(): number {
    return this.stacks.count;
  }
}
