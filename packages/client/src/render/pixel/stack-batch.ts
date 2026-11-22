import { sliceX, sliceY, type Strip } from '../stack';
import { compile, uniforms } from './gl';
import type { Lights } from './lighting';
import type { StackAtlas } from './stack-atlas';
import { STACK_FS, STACK_VS } from './stack-shaders';

/** Per-instance floats: x, y, z, lift, rot, u, v, w, h, alpha, res. */
const STRIDE = 11;

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
  private readonly u;
  private v: StackView = { w: 1, h: 1, ox: 0, oy: 0, scale: 1, ys: 1, zk: 1, worldH: 1 };

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly atlas: StackAtlas,
    capacity = 16384,
  ) {
    this.data = new Float32Array(capacity * STRIDE);
    this.prog = compile(gl, STACK_VS, STACK_FS);
    this.u = uniforms(gl, this.prog, [
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
    ]);
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
    const gl = this.gl;
    const v = this.v;
    const u = this.u;
    gl.useProgram(this.prog);
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
    gl.bindTexture(gl.TEXTURE_2D, this.atlas.tex);
    gl.uniform1i(u.u_atlas, 0);
    gl.uniform4fv(u.u_lpos, lights.pos);
    gl.uniform3fv(u.u_lcol, lights.col);
    gl.uniform1i(u.u_lcount, lights.count);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    if (this.data.byteLength > this.gpuBytes) {
      gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
      this.gpuBytes = this.data.byteLength;
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data, 0, this.n * STRIDE);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.n);
    gl.bindVertexArray(null);
  }

  dispose(): void {
    this.gl.deleteBuffer(this.buf);
    this.gl.deleteVertexArray(this.vao);
    this.gl.deleteProgram(this.prog);
  }
}
