import { Relief } from '@demodogs/sim';
import { bakeRelief } from '../relief-map';
import { texture } from './gl';

/**
 * A venue's raised ground on the GPU: its heights as a small filtered texture (one value to the
 * relief's grid cell, read by whatever stands on the ground to lift itself), and the picture-to-
 * ground map (see relief-map.ts) the ground's own shader reads. A flat venue has a single zero.
 */
export class ReliefLayer {
  /**
   * Heights, filtered floats, as `Relief` keeps them: the hills (art px), how many terraces up,
   * and the raised road's four values (two in the grid's upper half, two in a second grid under it).
   */
  readonly heights: WebGLTexture;
  /** The picture-to-ground map, or null on flat ground. */
  readonly map: WebGLTexture | null = null;
  /** The height grid's size, as the shaders need it to find a point's texel. */
  readonly gw: number = 1;
  readonly gh: number = 1;
  /** The highest the ground stands. */
  readonly top: number = 0;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly relief: Relief | null,
    w = 1,
    h = 1,
    rise = 1,
    faces: ((x: number, y: number) => number) | null = null,
    blocks: ((x: number, y: number) => number) | null = null,
  ) {
    this.heights = texture(gl, gl.LINEAR);
    if (!relief) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, 1, 2, 0, gl.RGBA, gl.FLOAT, new Float32Array(8));
      return;
    }
    this.gw = relief.gw;
    this.gh = relief.gh;
    this.top = relief.max;
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    // two grids, one above the other: hills, terraces and the raised road's side and height;
    // then the on-ramps' height and width
    const n = this.gw * this.gh;
    const all = new Float32Array(n * 8);
    const P = relief.plat;
    for (let i = 0; i < n; i++) {
      all[i * 4] = relief.hills[i]!;
      all[i * 4 + 1] = relief.bank[i]!;
      if (!P) continue;
      all[i * 4 + 2] = P[i * 4]!;
      all[i * 4 + 3] = P[i * 4 + 1]!;
      all[(n + i) * 4] = P[i * 4 + 2]!;
      all[(n + i) * 4 + 1] = P[i * 4 + 3]!;
    }
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, this.gw, this.gh * 2, 0, gl.RGBA, gl.FLOAT, all);
    this.map = texture(gl, gl.NEAREST);
    const px = bakeRelief(relief, w, h, rise, faces, blocks);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  }

  /** How high the ground stands at (x, y). */
  at(x: number, y: number): number {
    return this.relief ? this.relief.at(x, y) : 0;
  }

  /** Bind the heights to texture unit `unit` and tell a shader where they are. */
  bind(
    unit: number,
    sampler: WebGLUniformLocation | null,
    grid: WebGLUniformLocation | null,
    face: WebGLUniformLocation | null,
  ): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, this.heights);
    gl.uniform1i(sampler, unit);
    const R = this.relief;
    gl.uniform4f(grid, this.gw * Relief.CELL, this.gh * Relief.CELL, R?.step ?? 0, R?.steps ?? 0);
    gl.uniform1f(face, R?.face ?? 1);
    gl.activeTexture(gl.TEXTURE0);
  }

  dispose(): void {
    this.gl.deleteTexture(this.heights);
    if (this.map) this.gl.deleteTexture(this.map);
  }
}

/**
 * GLSL: the ground's height at a point, from the heights texture (`u_relief`: the hills and how
 * many terraces up, as Relief keeps them), worked out as `Relief.at` does.
 */
export const RELIEF_GLSL = `
uniform highp sampler2D u_relief;
uniform vec4 u_rgrid;   // the height grid's reach in art px; a terrace's height, how many
uniform float u_rface;  // how much of a terrace is its face
float groundAt(vec2 p) {
  vec2 uv = (p + ${(Relief.CELL / 2).toFixed(1)}) / u_rgrid.xy;
  float edge = ${(Relief.CELL / 2).toFixed(1)} / u_rgrid.y;
  uv.y = clamp(uv.y, edge, 1.0 - edge) * 0.5;
  vec4 t = textureLod(u_relief, uv, 0.0);
  float h = t.r;
  if (t.a > 0.0) {
    // raised road: a wall shaped after its smooth values are read (see Relief.plat)
    vec2 l = textureLod(u_relief, uv + vec2(0.0, 0.5), 0.0).rg;
    h += l.r * clamp(t.b + l.g, 0.0, 1.0) + (t.a - l.r) * clamp(t.b, 0.0, 1.0);
  }
  float q = t.g + 0.5;
  float fl = floor(q);
  return h + min(u_rgrid.w, fl + max(0.0, (q - fl - (1.0 - u_rface)) / u_rface)) * u_rgrid.z;
}`;
