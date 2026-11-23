import { sliceX, sliceY, type Strip } from '../stack';
import { compile, compileKept, countingShader, uniforms } from './gl';
import type { Lights } from './lighting';
import type { StackAtlas } from './stack-atlas';
import { STACK_FS, STACK_VS } from './stack-shaders';

/** Per-instance floats: x, y, z, lift, rot, u, v, w, h, alpha, res. */
const STRIDE = 11;

const NAMES = [
  'u_view',
  'u_origin',
  'u_scale',
  'u_ys',
  'u_dir',
  'u_drange',
  'u_atlas',
  'u_lpos',
  'u_lcol',
  'u_lcount',
  'u_count',
] as const;
type Uniforms = Record<(typeof NAMES)[number], WebGLUniformLocation | null>;

/** Depth keys are cut to this many bits for the radix sort (two passes of 11). */
const KEY_BITS = 22;
const HALF = 11;
const BUCKETS = 1 << HALF;

/**
 * The order to draw instances in, nearest the camera first: indices sorted by key, largest first,
 * stable (equal keys keep the order they were queued in). Keys are quantised to 22 bits between
 * `lo` and `hi` and sorted with two passes of a counting sort, so the cost is linear in `n`.
 * `tmp` and `out` hold at least `n`; `count` holds `BUCKETS + 1`. Returns `out`.
 */
export function nearestFirstOrder(
  key: Float32Array,
  n: number,
  lo: number,
  hi: number,
  out: Uint32Array,
  tmp: Uint32Array,
  q: Uint32Array,
  count: Uint32Array,
): Uint32Array {
  const top = (1 << KEY_BITS) - 1;
  const k = top / Math.max(1e-6, hi - lo);
  for (let i = 0; i < n; i++) {
    // nearest (largest key) gets the smallest q
    const v = Math.round((hi - key[i]!) * k);
    q[i] = v < 0 ? 0 : v > top ? top : v;
  }
  let src = tmp;
  for (let i = 0; i < n; i++) src[i] = i;
  let dst = out;
  for (let pass = 0; pass < 2; pass++) {
    const shift = pass * HALF;
    count.fill(0);
    for (let i = 0; i < n; i++) count[((q[src[i]!]! >> shift) & (BUCKETS - 1)) + 1]!++;
    for (let b = 0; b < BUCKETS; b++) count[b + 1]! += count[b]!;
    for (let i = 0; i < n; i++) {
      const j = src[i]!;
      dst[count[(q[j]! >> shift) & (BUCKETS - 1)]!++] = j;
    }
    const t = src;
    src = dst;
    dst = t;
  }
  // after two passes the result is back in `src`, which is `tmp`: copy into `out`
  out.set(src.subarray(0, n));
  return out;
}

/** How the overdraw meter draws the frame's slices again (see overdraw.ts). */
export interface CountPass {
  /** Count every fragment the quads cover, discarding nothing. */
  cover?: boolean;
  /** Read the shelled atlas (interiors left out) instead of the real one. */
  shell?: boolean;
  /** Draw the slices nearest first instead of in the order they were queued. */
  front?: boolean;
  /** What each fragment adds. */
  step: number;
}

/** The view a frame of slices is drawn with. */
export interface StackView {
  /** Viewport, device px. */
  w: number;
  h: number;
  /** Device px of the world origin on the ground, whole pixels. */
  ox: number;
  oy: number;
  /** Device px per art px, and the ground squash (sin of the pitch). */
  scale: number;
  ys: number;
  /** Device px a unit of height lifts (scale times cos of the pitch). */
  zk: number;
  /** The world's height, for the depth range. */
  worldH: number;
}

/**
 * Sprite-stack addon for the pixel engine: the same calls as the canvas `StackRenderer` (slice,
 * stack, limb), but every slice becomes one instance in a single draw call, depth-tested on the
 * GPU instead of sorted. Built the way mudders' `QuadBatch` is: a preallocated instance buffer
 * that only grows.
 */
export class StackBatch {
  private data: Float32Array;
  private n = 0;
  private gpuBytes: number;
  private readonly prog: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly buf: WebGLBuffer;
  private readonly u: Uniforms;
  private counters: { prog: WebGLProgram; u: Uniforms }[] = [];
  private order: Float32Array | null = null;
  /**
   * Draw slices nearest the camera first, so the depth test turns away what is hidden before it
   * is shaded (a stack is queued bottom slice first, which is painter order: 12 to 20 times the
   * fragments written; see overdraw.ts). Off only to compare (`?order=queued`).
   */
  frontToBack = true;
  private sorted: Float32Array = new Float32Array(0);
  private keys = new Float32Array(0);
  private idx = new Uint32Array(0);
  private idxTmp = new Uint32Array(0);
  private q = new Uint32Array(0);
  private readonly counts = new Uint32Array(BUCKETS + 1);
  /** The data the last flush drew (queued or sorted), for the overdraw meter's "written". */
  private drawn: Float32Array = new Float32Array(0);
  private v: StackView = { w: 1, h: 1, ox: 0, oy: 0, scale: 1, ys: 1, zk: 1, worldH: 1 };

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly atlas: StackAtlas,
    capacity = 16384,
  ) {
    this.data = new Float32Array(capacity * STRIDE);
    this.prog = compile(gl, STACK_VS, STACK_FS);
    this.u = uniforms(gl, this.prog, NAMES);
    this.vao = gl.createVertexArray();
    this.buf = gl.createBuffer();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
    this.gpuBytes = this.data.byteLength;
    const attrs: [number, number, number][] = [
      [0, 4, 0],
      [1, 1, 4],
      [2, 4, 5],
      [3, 1, 9],
      [4, 1, 10],
    ];
    for (const [loc, size, off] of attrs) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, STRIDE * 4, off * 4);
      gl.vertexAttribDivisor(loc, 1);
    }
    gl.bindVertexArray(null);
  }

  get count(): number {
    return this.n;
  }

  begin(view: StackView): void {
    this.v = view;
    this.n = 0;
  }

  private push(
    x: number,
    y: number,
    z: number,
    lift: number,
    rot: number,
    u: number,
    v: number,
    w: number,
    h: number,
    alpha: number,
    res: number,
  ): void {
    if ((this.n + 1) * STRIDE > this.data.length) {
      const bigger = new Float32Array(this.data.length * 2);
      bigger.set(this.data);
      this.data = bigger;
    }
    const d = this.data;
    const o = this.n * STRIDE;
    d[o] = x;
    d[o + 1] = y;
    d[o + 2] = z;
    d[o + 3] = lift;
    d[o + 4] = rot;
    d[o + 5] = u;
    d[o + 6] = v;
    d[o + 7] = w;
    d[o + 8] = h;
    d[o + 9] = alpha;
    d[o + 10] = res;
    this.n++;
  }

  /** Slice i of a strip, axis at (x, y), underside at height z, turned by rot; thick in layers. */
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
    const a = this.atlas.slot(s);
    const zk = this.v.zk;
    const up = Math.round(z * zk);
    // a layer is drawn a row or two thick so stacks have no gaps between slices
    const rows = Math.max(1, Math.ceil((zk * thick) / s.res - 0.02));
    const u = a.x + sliceX(s, i);
    const v = a.y + sliceY(s, i);
    for (let k = 0; k < rows; k++)
      this.push(x, y, z + k / zk, up + k, rot, u, v, s.cw, s.ch, alpha, s.res);
  }

  /**
   * One loose block: a cube `size` art pixels across in a flat colour (0xRRGGBB), no texture. The
   * colour rides in the texel-x slot with texel-y at -1, which the shader reads as "plain colour".
   */
  voxel(rgb: number, x: number, y: number, z: number, rot: number, size = 1): void {
    const zk = this.v.zk;
    const up = Math.round(z * zk);
    const rows = Math.max(1, Math.ceil(zk * size - 0.02));
    for (let k = 0; k < rows; k++)
      this.push(x, y, z + k / zk, up + k, rot, rgb, -1, size, size, 1, 1);
  }

  stack(s: Strip, x: number, y: number, z: number, rot: number, alpha = 1): void {
    for (let i = 0; i < s.n; i++) this.slice(s, i, x, y, z + i / s.res, rot, 1, alpha);
  }

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

  flush(lights: Lights): void {
    if (this.n === 0) return;
    this.drawn = this.frontToBack ? this.sortNearestFirst() : this.data;
    this.draw(this.prog, this.u, this.atlas.tex, lights, this.drawn);
  }

  /** The depth range of the view (as the vertex shader's): [nearest-to-farthest lo, hi]. */
  private depthRange(): [number, number] {
    const dir0 = this.v.zk / this.v.scale;
    const dir1 = this.v.ys;
    return [-64 * dir0, (this.v.worldH + 64) * dir0 + 96 * dir1];
  }

  /** The queued instances copied into draw order, nearest first (radix sort, linear time). */
  private sortNearestFirst(): Float32Array {
    const n = this.n;
    if (this.keys.length < n) {
      const m = Math.max(n, this.keys.length * 2, 1024);
      this.keys = new Float32Array(m);
      this.idx = new Uint32Array(m);
      this.idxTmp = new Uint32Array(m);
      this.q = new Uint32Array(m);
    }
    if (this.sorted.length < this.data.length) this.sorted = new Float32Array(this.data.length);
    const d = this.data;
    const dx = this.v.zk / this.v.scale;
    const dy = this.v.ys;
    const key = this.keys;
    for (let i = 0; i < n; i++) key[i] = d[i * STRIDE + 1]! * dx + d[i * STRIDE + 2]! * dy;
    const [lo, hi] = this.depthRange();
    const order = nearestFirstOrder(key, n, lo, hi, this.idx, this.idxTmp, this.q, this.counts);
    const o = this.sorted;
    for (let j = 0; j < n; j++) {
      const a = order[j]! * STRIDE;
      const b = j * STRIDE;
      for (let f = 0; f < STRIDE; f++) o[b + f] = d[a + f]!;
    }
    return o;
  }

  /**
   * The overdraw meter's pass: the slices of the last flush drawn again with a counting shader. The
   * caller has bound the count target and set blending and the depth test.
   */
  drawCount(p: CountPass, lights: Lights): void {
    if (this.n === 0) return;
    const gl = this.gl;
    const k = p.cover ? 1 : 0;
    if (!this.counters[k]) {
      const prog = compileKept(gl, STACK_VS, countingShader(STACK_FS, !!p.cover));
      this.counters[k] = { prog, u: uniforms(gl, prog, NAMES) };
    }
    const c = this.counters[k];
    gl.useProgram(c.prog);
    gl.uniform1f(c.u.u_count, p.step);
    const tex = p.shell && this.atlas.shellTex ? this.atlas.shellTex : this.atlas.tex;
    this.draw(c.prog, c.u, tex, lights, p.front ? this.nearestFirst() : this.drawn);
  }

  /** The instances sorted nearest the camera first (largest depth along the view). */
  private nearestFirst(): Float32Array {
    const n = this.n;
    const d = this.data;
    const dx = this.v.zk / this.v.scale;
    const dy = this.v.ys;
    const key = new Float32Array(n);
    const idx = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      key[i] = d[i * STRIDE + 1]! * dx + d[i * STRIDE + 2]! * dy;
      idx[i] = i;
    }
    idx.sort((a, b) => key[b]! - key[a]!);
    if (!this.order || this.order.length < n * STRIDE) this.order = new Float32Array(n * STRIDE);
    const o = this.order;
    for (let j = 0; j < n; j++)
      o.set(d.subarray(idx[j]! * STRIDE, idx[j]! * STRIDE + STRIDE), j * STRIDE);
    return o;
  }

  private upload(data: Float32Array): void {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    if (data.byteLength > this.gpuBytes) {
      gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);
      this.gpuBytes = data.byteLength;
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, this.n * STRIDE);
  }

  private draw(
    prog: WebGLProgram,
    u: Uniforms,
    tex: WebGLTexture,
    lights: Lights,
    data: Float32Array,
  ): void {
    const gl = this.gl;
    const v = this.v;
    gl.useProgram(prog);
    gl.uniform2f(u.u_view, v.w, v.h);
    gl.uniform2f(u.u_origin, v.ox, v.oy);
    gl.uniform1f(u.u_scale, v.scale);
    gl.uniform1f(u.u_ys, v.ys);
    // depth along the view direction (cos, sin of the pitch); the range covers the world plus headroom
    const dir: [number, number] = [v.zk / v.scale, v.ys];
    gl.uniform2f(u.u_dir, dir[0], dir[1]);
    const lo = -64 * dir[0];
    const hi = (v.worldH + 64) * dir[0] + 96 * dir[1];
    gl.uniform2f(u.u_drange, lo, 1 / (hi - lo));
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(u.u_atlas, 0);
    gl.uniform4fv(u.u_lpos, lights.pos);
    gl.uniform3fv(u.u_lcol, lights.col);
    gl.uniform1i(u.u_lcount, lights.count);
    gl.bindVertexArray(this.vao);
    this.upload(data);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.n);
    gl.bindVertexArray(null);
  }

  dispose(): void {
    this.gl.deleteBuffer(this.buf);
    this.gl.deleteVertexArray(this.vao);
    this.gl.deleteProgram(this.prog);
  }
}
