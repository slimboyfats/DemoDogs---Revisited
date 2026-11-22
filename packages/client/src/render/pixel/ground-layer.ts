import type { Ground } from '../ground';
import { compile, texture, uniforms } from './gl';
import { GROUND_FS, GROUND_VS } from './stack-shaders';
import type { StackView } from './stack-batch';

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
  ) {
    this.tex = texture(gl);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, ground.cv);
    ground.dirty = null;
    this.prog = compile(gl, GROUND_VS, GROUND_FS);
    this.u = uniforms(gl, this.prog, ['u_view', 'u_origin', 'u_scale', 'u_ys', 'u_size', 'u_tex']);
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

  draw(v: StackView): void {
    const gl = this.gl;
    const u = this.u;
    gl.useProgram(this.prog);
    gl.uniform2f(u.u_view, v.w, v.h);
    gl.uniform2f(u.u_origin, v.ox, v.oy);
    gl.uniform1f(u.u_scale, v.scale);
    gl.uniform1f(u.u_ys, v.ys);
    gl.uniform2f(u.u_size, this.ground.cv.width, this.ground.cv.height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(u.u_tex, 0);
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
