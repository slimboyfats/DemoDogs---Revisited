import { fineGrid } from '../strips';
import type { Ground } from '../ground';
import { compile, texture, uniforms } from './gl';
import { groundFs, GROUND_VS } from './stack-shaders';
import type { ReliefLayer } from './relief-layer';
import type { LightBlock } from './light-block';
import type { Lights } from './lighting';
import { depthRange, type StackView } from './stack-batch';

/**
 * The ground canvas as a texture, drawn as one quad behind everything. Marks painted onto the
 * canvas during the race (skids, scorches, splats) are copied up as one small box per frame, the
 * way mudders uploads only the changed box of its maps.
 */
export class GroundLayer {
  private readonly tex: WebGLTexture;
  private readonly prog: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly u;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly ground: Ground,
    /** The venue's raised ground: with it the ground is drawn where it stands, and writes depth. */
    private readonly relief: ReliefLayer | null = null,
  ) {
    // read texel by texel (texelFetch): the shader dithers between texels, never blends them
    this.tex = texture(gl, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, ground.cv);
    ground.dirty = null;
    this.prog = compile(gl, GROUND_VS, groundFs(!!relief?.map));
    this.u = uniforms(gl, this.prog, [
      'u_view',
      'u_origin',
      'u_scale',
      'u_ys',
      'u_size',
      'u_tex',
      'u_fine',
      'u_lcount',
      'u_lpos',
      'u_lcol',
      'u_amb',
      'u_snow',
      'u_wet',
      'u_cone',
      'u_ccount',
      'u_map',
      'u_depth',
      'u_hk',
      'u_lm',
      'u_lmbox',
      'u_lmk',
      'u_lc',
      'u_bounce',
    ]);
    this.vao = gl.createVertexArray();
  }

  /** Copy up whatever was painted since the last frame. */
  sync(): void {
    const d = this.ground.dirty;
    if (!d) return;
    this.ground.dirty = null;
    const W = this.ground.cv.width;
    const H = this.ground.cv.height;
    const x0 = Math.max(0, d[0]);
    const y0 = Math.max(0, d[1]);
    const x1 = Math.min(W, d[2]);
    const y1 = Math.min(H, d[3]);
    if (x1 <= x0 || y1 <= y0) return;
    const img = this.ground.g.getImageData(x0, y0, x1 - x0, y1 - y0);
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, x0, y0, gl.RGBA, gl.UNSIGNED_BYTE, img);
  }

  draw(
    v: StackView,
    lights: Lights,
    sky?: { ground: Float32Array; snow: number; wet: number },
    block?: LightBlock | null,
    bounce?: readonly [number, number, number],
  ): void {
    const gl = this.gl;
    const u = this.u;
    gl.useProgram(this.prog);
    gl.uniform2f(u.u_view, v.w, v.h);
    gl.uniform2f(u.u_origin, v.ox, v.oy);
    gl.uniform1f(u.u_scale, v.scale);
    gl.uniform1f(u.u_ys, v.ys);
    gl.uniform1f(u.u_fine, fineGrid(v.scale));
    gl.uniform1i(u.u_lcount, lights.count);
    gl.uniform4fv(u.u_lpos, lights.pos);
    gl.uniform3fv(u.u_lcol, lights.col);
    gl.uniform4fv(u.u_cone, lights.cones);
    gl.uniform1i(u.u_ccount, lights.coneCount);
    if (sky) gl.uniform3fv(u.u_amb, sky.ground);
    else gl.uniform3f(u.u_amb, 1, 1, 1);
    gl.uniform1f(u.u_snow, sky?.snow ?? 0);
    gl.uniform1f(u.u_wet, sky?.wet ?? 0);
    gl.uniform2f(u.u_size, this.ground.cv.width, this.ground.cv.height);
    // what stands in the lights' way (a sampler must have a texture behind it either way)
    gl.uniform1f(u.u_lmk, block ? 1 : 0);
    gl.uniform3f(u.u_bounce, bounce?.[0] ?? 0, bounce?.[1] ?? 0, block ? (bounce?.[2] ?? 0) : 0);
    if (block) {
      block.bind(4, u.u_lm, u.u_lmbox);
      block.bindColour(5, u.u_lc);
    } else {
      gl.activeTexture(gl.TEXTURE4);
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.uniform1i(u.u_lm, 4);
      gl.activeTexture(gl.TEXTURE5);
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.uniform1i(u.u_lc, 5);
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(u.u_tex, 0);
    const map = this.relief?.map;
    if (map) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, map);
      gl.uniform1i(u.u_map, 1);
      gl.activeTexture(gl.TEXTURE0);
      const dir0 = v.zk / v.scale;
      const [lo, hi] = depthRange(v);
      gl.uniform4f(u.u_depth, dir0, v.ys, lo, 1 / (hi - lo));
      gl.uniform1f(u.u_hk, v.ys / dir0);
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
