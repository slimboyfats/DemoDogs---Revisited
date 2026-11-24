import { fineGrid } from '../strips';
import type { ShadowMap } from '../cast';
import { compile, texture, uniforms } from './gl';
import { GROUND_VS, shadowFs } from './stack-shaders';
import type { ReliefLayer } from './relief-layer';
import type { StackView } from './stack-batch';

/** How dark a cast shadow is. */
const DARK = 0.3;

/**
 * Tall scenery's cast shadows (see cast.ts) as a one-channel texture over the ground, drawn as
 * one quad blended over it. Changes go up as one box, as the ground's marks do.
 */
export class ShadowLayer {
  private readonly tex: WebGLTexture;
  private readonly prog: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly u;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly map: ShadowMap,
    private readonly relief: ReliefLayer | null = null,
  ) {
    // filtered: the edge of the mask blends over one art px, and the shader dithers that
    this.tex = texture(gl, gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, map.w, map.h, 0, gl.RED, gl.UNSIGNED_BYTE, map.mask);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    map.dirty = null;
    this.prog = compile(gl, GROUND_VS, shadowFs(!!relief?.map));
    this.u = uniforms(gl, this.prog, [
      'u_view',
      'u_origin',
      'u_scale',
      'u_ys',
      'u_size',
      'u_tex',
      'u_alpha',
      'u_fine',
      'u_map',
    ]);
    this.vao = gl.createVertexArray();
  }

  /** Copy up the box of the mask that changed. */
  sync(): void {
    const M = this.map;
    const d = M.dirty;
    if (!d) return;
    M.dirty = null;
    const x0 = Math.max(0, d[0]);
    const y0 = Math.max(0, d[1]);
    const x1 = Math.min(M.w, d[2]);
    const y1 = Math.min(M.h, d[3]);
    if (x1 <= x0 || y1 <= y0) return;
    const bw = x1 - x0;
    const box = new Uint8Array(bw * (y1 - y0));
    for (let y = y0; y < y1; y++)
      box.set(M.mask.subarray(y * M.w + x0, y * M.w + x1), (y - y0) * bw);
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, x0, y0, bw, y1 - y0, gl.RED, gl.UNSIGNED_BYTE, box);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  }

  /** Draw over the ground; blending must be on (premultiplied). */
  draw(v: StackView, strength = 1): void {
    const gl = this.gl;
    const u = this.u;
    gl.useProgram(this.prog);
    gl.uniform2f(u.u_view, v.w, v.h);
    gl.uniform2f(u.u_origin, v.ox, v.oy);
    gl.uniform1f(u.u_scale, v.scale);
    gl.uniform1f(u.u_ys, v.ys);
    gl.uniform1f(u.u_fine, fineGrid(v.scale));
    gl.uniform2f(u.u_size, this.map.w, this.map.h);
    gl.uniform1f(u.u_alpha, DARK * strength);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(u.u_tex, 0);
    if (this.relief?.map) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.relief.map);
      gl.uniform1i(u.u_map, 1);
      gl.activeTexture(gl.TEXTURE0);
    }
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
  }

  dispose(): void {
    this.gl.deleteTexture(this.tex);
    this.gl.deleteVertexArray(this.vao);
    this.gl.deleteProgram(this.prog);
  }
}
