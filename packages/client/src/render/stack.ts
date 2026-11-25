// stack.ts: sprite stacking on a 2D canvas, with a following camera and many objects.
//
// Adapted from js/stack.js of loktar00/sprite-stack-animation (MIT, see THIRD_PARTY_NOTICES.md).
// A stack is a strip image: the object's slices side by side, bottom slice first. Each slice is one
// drawImage, turned by the object's angle and drawn a little further up the screen than the one
// below, repeated a row or two so a layer has thickness. There is no depth buffer: everything
// queued is sorted and drawn back to front.
//
// What this version adds for a game world:
//  - a camera: begin(camX, camY, w, h) puts the world point (camX, camY) in the middle;
//  - groups: every object opens a group keyed by its ground y. Groups draw far to near and slices
//    inside a group lowest first (whole stacks sorted by where they touch the ground);
//  - image(): a static stack is baked once into a canvas and queued as one image;
//  - per-slice alpha, and an item pool so a frame does not allocate.
//
// World coordinates: x and y lie on the ground, z is height, all in art pixels.

import type { Lie } from './pixel/stack-batch';
import { settle } from './strips';

/**
 * A stack's slices in one image. A slice is `cw` by `ch` texels and there are `n` of them, bottom
 * first, laid out `cols` to a row. `res` is texels per art pixel, in all three directions: a strip
 * at res 3 has slices three times finer and three times as many of them for the same size.
 */
export interface Strip {
  img: HTMLCanvasElement;
  cw: number;
  ch: number;
  n: number;
  res: number;
  cols: number;
  /**
   * The image's pixels (RGBA), when something keeps them: they are then what is true, and `img`
   * is behind them while `stale` is set (see `settle` in strips.ts).
   */
  px?: Uint8ClampedArray;
  stale?: boolean;
  /**
   * How much each texel glows (0 to 7, one byte a texel in the image's layout), for strips with
   * lamps in them. Set when the strip is built and never changed: a texel knocked off is gone
   * from the pixels, and a charred one glows in its charred colour.
   */
  glow?: Uint8Array | undefined;
  /** How each texel shines (0 dull, 1 painted, 2 metal, 3 polished), laid out and kept as `glow` is. */
  gloss?: Uint8Array | undefined;
}

/** How tall a strip stands, in art pixels. */
export const tall = (s: Strip): number => s.n / s.res;
/** The texel a slice starts at in its strip's image. */
export const sliceX = (s: Strip, i: number): number => (i % s.cols) * s.cw;
export const sliceY = (s: Strip, i: number): number => Math.floor(i / s.cols) * s.ch;

interface Item {
  img: CanvasImageSource;
  cw: number;
  ch: number;
  /** Source texel of the slice, and texels per art pixel. */
  u: number;
  v: number;
  res: number;
  /** Slice index, or -1 for a pre-drawn image. */
  i: number;
  x: number;
  y: number;
  rot: number;
  g: number;
  gn: number;
  h: number;
  n: number;
  a: number;
}

export class StackRenderer {
  scale = 4;
  ys = 0.8;
  zk = 2.4;
  vw = 0;
  vh = 0;
  calls = 0;
  private camX = 0;
  private camY = 0;
  private ox = 0;
  private oy = 0;
  private group_ = 0;
  private groupN = 0;
  private readonly pool: Item[] = [];
  private count = 0;
  private readonly order: Item[] = [];

  constructor(private readonly ctx: CanvasRenderingContext2D) {}

  setView(scale: number, pitch: number): void {
    this.scale = scale;
    this.ys = Math.sin(pitch);
    this.zk = scale * Math.cos(pitch);
  }

  begin(cx: number, cy: number, w: number, h: number): void {
    this.camX = cx;
    this.camY = cy;
    this.ox = w / 2;
    this.oy = h / 2;
    this.count = 0;
    this.vw = w;
    this.vh = h;
    this.groupN = 0;
  }

  sx(x: number): number {
    return this.ox + (x - this.camX) * this.scale;
  }

  sy(y: number, z = 0): number {
    return this.oy + (y - this.camY) * this.scale * this.ys - z * this.zk;
  }

  /** Is a thing of radius rad (art px) and height ht near the screen? */
  visible(x: number, y: number, rad: number, ht = 0): boolean {
    const sx = this.sx(x);
    const sy = this.sy(y);
    const m = rad * this.scale;
    return sx > -m && sx < this.vw + m && sy > -m && sy < this.vh + m + ht * this.zk;
  }

  /** Start an object: its slices are drawn together, after objects with a smaller key. */
  group(key: number): void {
    this.group_ = key;
    this.groupN++;
  }

  private take(): Item {
    if (this.count === this.pool.length)
      this.pool.push({
        img: this.ctx.canvas,
        cw: 0,
        ch: 0,
        u: 0,
        v: 0,
        res: 1,
        i: 0,
        x: 0,
        y: 0,
        rot: 0,
        g: 0,
        gn: 0,
        h: 0,
        n: 0,
        a: 1,
      });
    return this.pool[this.count++]!;
  }

  /**
   * Queue slice i of a strip, axis at (x, y), underside at height z, turned by rot. `thick` is in
   * layers of this strip.
   */
  slice(
    s: Strip,
    i: number,
    x: number,
    y: number,
    z: number,
    rot: number,
    thick = 1,
    alpha = 1,
  ): void {
    const T = this.lie;
    if (T) {
      // lying over: slices stay level here, but each is carried round with the tilt
      const h = z - T.pz;
      z += T.lift + T.tx * (x - T.px) + T.ty * (y - T.py);
      x -= h * T.tx;
      y -= h * T.ty;
    }
    const sx = this.ox + Math.round((x - this.camX) * this.scale);
    const sy = this.oy + Math.round((y - this.camY) * this.scale * this.ys);
    const up = Math.round(z * this.zk);
    const res = s.res / this.zm;
    const rows = Math.max(1, Math.ceil((this.zk * thick) / res - 0.02));
    for (let k = 0; k < rows; k++) {
      const it = this.take();
      it.img = s.stale ? settle(s) : s.img;
      it.cw = s.cw;
      it.ch = s.ch;
      it.u = sliceX(s, i);
      it.v = sliceY(s, i);
      it.res = res;
      it.i = i;
      it.x = sx;
      it.y = sy - up - k;
      it.rot = rot;
      it.g = this.group_;
      it.gn = this.groupN;
      it.h = up + k;
      it.n = this.count;
      it.a = alpha;
    }
  }

  private lie: Lie | null = null;

  /** What follows lies tilted as one thing (see `Lie`); null puts it back. */
  tilt(lie: Lie | null): void {
    this.lie = lie;
  }

  private zm = 1;

  /** Draw what follows `k` times its size, with pixels that much bigger (1 puts it back). */
  zoom(k: number): void {
    this.zm = k;
  }

  /** Queue a whole stack standing at (x, y, z). */
  stack(s: Strip, x: number, y: number, z: number, rot: number, alpha = 1): void {
    const res = s.res / this.zm;
    for (let i = 0; i < s.n; i++) this.slice(s, i, x, y, z + i / res, rot, 1, alpha);
  }

  /** One single-slice strip repeated n times along a bone from a to b. */
  limb(s: Strip, a: readonly number[], b: readonly number[], n: number): void {
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      this.stack(
        s,
        a[0]! + (b[0]! - a[0]!) * t,
        a[1]! + (b[1]! - a[1]!) * t,
        a[2]! + (b[2]! - a[2]!) * t - 0.5,
        0,
      );
    }
  }

  /** Queue a pre-drawn image; (ax, ay) is its ground point in the image. */
  image(img: CanvasImageSource, x: number, y: number, ax: number, ay: number): void {
    const it = this.take();
    it.img = img;
    it.i = -1;
    it.x = this.ox + Math.round((x - this.camX) * this.scale) - ax;
    it.y = this.oy + Math.round((y - this.camY) * this.scale * this.ys) - ay;
    it.rot = 0;
    it.g = this.group_;
    it.gn = this.groupN;
    it.h = 0;
    it.n = this.count;
    it.a = 1;
  }

  /** Draw everything queued: far groups first, inside a group lowest first. */
  flush(): void {
    const ctx = this.ctx;
    const order = this.order;
    order.length = this.count;
    for (let q = 0; q < this.count; q++) order[q] = this.pool[q]!;
    order.sort((a, b) => a.g - b.g || a.gn - b.gn || a.h - b.h || a.n - b.n);
    ctx.imageSmoothingEnabled = false;
    let lastA = 1;
    ctx.globalAlpha = 1;
    const sc = this.scale;
    for (const it of order) {
      if (it.a !== lastA) {
        ctx.globalAlpha = it.a;
        lastA = it.a;
      }
      if (it.i < 0) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(it.img, it.x, it.y);
        continue;
      }
      const c = Math.cos(it.rot);
      const s = Math.sin(it.rot);
      // translate(x, y) * scale(1, ys) * rotate(rot), in one call
      ctx.setTransform(c, this.ys * s, -s, this.ys * c, it.x, it.y);
      const k = sc / it.res;
      ctx.drawImage(
        it.img,
        it.u,
        it.v,
        it.cw,
        it.ch,
        (-it.cw * k) / 2,
        (-it.ch * k) / 2,
        it.cw * k,
        it.ch * k,
      );
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    this.calls = this.count;
  }
}
